import express from "express";
import { verifyToken, optionalVerifyToken } from "../middleware/auth.js";
import { voiceLimiter } from "../middleware/security.js";
import Conversation from "../models/Conversation.js";
import memoryService from "../services/memoryService.js";
import adaptiveRagService from "../services/adaptiveRagService.js";
import deepgramTts from "../services/deepgramTtsService.js";
import aiService, { DEFAULT_SYSTEM_INSTRUCTION } from "../services/aiService.js";
import semanticCache from "../services/semanticCacheService.js";

const router = express.Router();

// =========================================================
// GET /api/voice/cache/stats - Semantic Cache Telemetry
// =========================================================
router.get("/cache/stats", (req, res) => {
  return res.json({ status: "success", stats: semanticCache.getStats() });
});

// =========================================================
// GET /api/voice/history - Get conversation history
// =========================================================
router.get("/history", verifyToken, async (req, res) => {
  try {
    const convo = await Conversation.findOne({ userId: req.user._id });
    const messages = convo?.messages?.map((m) => ({
      sender: m.role === "user" ? "user" : "ai",
      text: m.text,
      timestamp: m.timestamp || new Date(),
      toolUsed: m.toolUsed || null,
    })) || [];
    return res.json({ status: "success", messages });
  } catch (err) {
    console.error("❌ [VOICE CHECKPOINT ERROR] Get history failure:", err.message || err);
    return res.status(500).json({ error: "Failed to retrieve history." });
  }
});

// =========================================================
// DELETE /api/voice/history - Clear conversation context
// =========================================================
router.delete("/history", verifyToken, async (req, res) => {
  console.log(`📍 [VOICE CHECKPOINT] Clearing history for user: ${req.user?._id}`);
  try {
    await Conversation.clearHistory(req.user._id);
    console.log(`✅ [VOICE CHECKPOINT] History cleared for user: ${req.user?._id}`);
    return res.json({ status: "success", message: "Conversation history cleared." });
  } catch (err) {
    console.error("❌ [VOICE CHECKPOINT ERROR] Clear history failure:", err.message || err);
    return res.status(500).json({ error: "Failed to clear history." });
  }
});

// =========================================================
// POST /api/voice/stream - Real-Time Token-to-Audio SSE Stream (Sub-300ms)
// =========================================================
router.post("/stream", voiceLimiter, verifyToken, async (req, res) => {
  const startTotal = Date.now();
  const user = req.user;
  const userText = (req.body?.text || req.body?.message || "").trim();

  if (!userText) {
    return res.status(400).json({ error: "Text is required for streaming voice." });
  }

  // Set SSE Headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const selectedPersona = req.body?.persona || "conversational";
    const selectedVoiceModel = req.body?.voiceModel || "aura-asteria-en";
    const userIdentifier = user?.email || String(user?._id) || "general_user";

    // 0. Fast Semantic Query Cache Check (< 3ms response, zero LLM cost)
    const cachedHit = semanticCache.get(userText, null, selectedPersona);
    if (cachedHit) {
      console.log(`⚡ [SEMANTIC CACHE] Serving cached response for "${userText.slice(0, 40)}" in ${Date.now() - startTotal}ms`);
      sendEvent("rag", {
        ragSource: cachedHit.ragSource,
        groundingDetails: cachedHit.groundingDetails,
        latencyMs: 1,
        cached: true,
      });
      sendEvent("token", { token: cachedHit.reply });
      if (cachedHit.audio) {
        sendEvent("audio", {
          index: 0,
          text: cachedHit.reply,
          audio: cachedHit.audio,
          format: cachedHit.audioFormat || "audio/wav",
          latencyMs: 2,
          totalElapsedMs: Date.now() - startTotal,
        });
      }
      sendEvent("done", {
        reply: cachedHit.reply,
        firstAudioTimeMs: Date.now() - startTotal,
        totalLatencyMs: Date.now() - startTotal,
        sentenceCount: 1,
        cached: true,
        ragSource: cachedHit.ragSource,
        groundingDetails: cachedHit.groundingDetails,
      });
      res.end();
      return;
    }

    // 1. Adaptive RAG Grounding + Memories
    const [adaptiveRag, qdrantMemories, recentHistory] = await Promise.all([
      adaptiveRagService.getPersonaGrounding(userText, selectedPersona).catch(() => ({ contextPrompt: "", ragSource: null })),
      memoryService.searchUserMemory(userText, userIdentifier, 2).catch(() => []),
      Conversation.getRecentTurns(user._id, 4).catch(() => []),
    ]);

    sendEvent("rag", {
      ragSource: adaptiveRag.ragSource,
      groundingDetails: adaptiveRag.groundingDetails,
      latencyMs: adaptiveRag.latencyMs,
    });

    let dynamicInstruction = typeof aiService.getSystemInstruction === "function"
      ? aiService.getSystemInstruction(selectedPersona)
      : DEFAULT_SYSTEM_INSTRUCTION;

    if (adaptiveRag.contextPrompt) {
      dynamicInstruction += adaptiveRag.contextPrompt;
    }
    if (qdrantMemories && qdrantMemories.length > 0) {
      dynamicInstruction += `\n\n[USER RECALLED LONG-TERM MEMORIES]:\n${qdrantMemories.map((m, i) => `${i + 1}. ${m}`).join("\n")}`;
    }

    const { streamVoiceResponse } = await import("../services/streamingVoiceService.js");

    let firstAudioPayload = null;

    const result = await streamVoiceResponse({
      prompt: userText,
      history: recentHistory,
      systemInstruction: dynamicInstruction,
      voiceModel: selectedVoiceModel,
      onTokenDelta: (token) => {
        sendEvent("token", { token });
      },
      onAudioChunk: (chunk) => {
        if (!firstAudioPayload) firstAudioPayload = chunk;
        sendEvent("audio", {
          index: chunk.index,
          text: chunk.text,
          audio: chunk.audio,
          format: chunk.format,
          latencyMs: chunk.latencyMs,
          totalElapsedMs: chunk.totalElapsedMs,
        });
      },
    });

    sendEvent("done", {
      reply: result.fullText,
      firstAudioTimeMs: result.firstAudioTimeMs,
      totalLatencyMs: result.totalLatencyMs,
      sentenceCount: result.sentenceCount,
      ragSource: adaptiveRag.ragSource,
      groundingDetails: adaptiveRag.groundingDetails,
    });

    // Save to Semantic Cache for instant reuse
    semanticCache.set(userText, adaptiveRag.queryVector, selectedPersona, {
      reply: result.fullText,
      audio: firstAudioPayload?.audio || null,
      audioFormat: firstAudioPayload?.format || "audio/wav",
      ragSource: adaptiveRag.ragSource,
      groundingDetails: adaptiveRag.groundingDetails,
    });

    // Save exchange to MongoDB
    Conversation.appendTurn(user._id, userText, result.fullText).catch(() => {});
    memoryService.saveUserMemory(`User: ${userText} | Chatly: ${result.fullText}`, userIdentifier).catch(() => {});

    res.end();
  } catch (err) {
    console.error("❌ [STREAMING ERROR]:", err.message);
    sendEvent("error", { message: err.message });
    res.end();
  }
});

// =========================================================
// POST /api/voice - Main Voice Pipeline (Gemini + Qdrant + Deepgram)
// =========================================================
router.post("/", voiceLimiter, verifyToken, async (req, res) => {
  const startTotal = Date.now();
  console.log("📍 [VOICE CHECKPOINT 1] Received voice request from user:", req.user?.email);

  try {
    const user = req.user;
    const isAdmin = user.role === "admin" || user.email?.toLowerCase() === "r19216871@gamil.com";

    // 1. Account rate limit check
    console.log(`📍 [VOICE CHECKPOINT 2] Checking quota for user ${user.email} (isAdmin: ${isAdmin})...`);
    let quota = { allowed: true, isAdmin, remainingHourly: "Unlimited", remainingDaily: "Unlimited" };
    try {
      quota = await user.checkAndRecordVoiceCall();
    } catch (quotaErr) {
      console.warn("⚠️ Quota check warning, defaulting to allow:", quotaErr.message);
    }

    if (!quota.allowed) {
      console.warn(`⚠️ [VOICE CHECKPOINT 2] Quota exceeded for user: ${user.email}`);
      return res.status(429).json({
        error: quota.error || "Rate limit exceeded. Please wait a moment before speaking again.",
        quota,
        reply: quota.error || "You have reached your voice call limit. Please check back soon!",
      });
    }

    const userText = req.body?.text || req.body?.message || "";
    if (!userText || typeof userText !== "string" || !userText.trim() || userText.length > 2000) {
      console.warn("⚠️ [VOICE CHECKPOINT] Invalid input text length/type");
      return res.status(400).json({
        error: "Valid text (max 2000 characters) is required in request body.",
      });
    }

    const prompt = userText.trim();
    console.log(`🗣️ [VOICE CHECKPOINT 3] User Prompt: "${prompt.slice(0, 80)}..."`);

    const selectedPersona = req.body?.persona || "conversational";

    // 1.5. Fast Semantic Query Cache Check (< 3ms response, zero LLM cost)
    const cachedHit = semanticCache.get(prompt, null, selectedPersona);
    if (cachedHit) {
      console.log(`⚡ [SEMANTIC CACHE] Exact match hit in ${Date.now() - startTotal}ms for "${prompt.slice(0, 40)}"`);
      return res.json({
        status: "success",
        reply: cachedHit.reply,
        provider: "semantic_cache",
        model: "Instant Cache (<5ms)",
        aiLatencyMs: 2,
        audio: cachedHit.audio || null,
        audioFormat: cachedHit.audioFormat || "audio/wav",
        voice: { name: "alexis" },
        userText: prompt,
        quota,
        persona: selectedPersona,
        ragSource: cachedHit.ragSource,
        groundingDetails: cachedHit.groundingDetails,
        ragLatencyMs: 0,
        cached: true,
      });
    }

    // 2. Retrieve recent conversation history from MongoDB
    console.log("📍 [VOICE CHECKPOINT 4] Fetching recent conversation turns from MongoDB...");
    let recentHistory = [];
    try {
      recentHistory = await Conversation.getRecentTurns(user._id, 6);
      console.log(`✅ [VOICE CHECKPOINT 4] Retrieved ${recentHistory.length} previous history items`);
    } catch (historyErr) {
      console.warn("⚠️ History fetch warning, proceeding without history:", historyErr.message);
    }

    // 3. Persona-Adaptive RAG Grounding + Long-term user memories
    const userIdentifier = user?.email || String(user?._id) || "general_user";
    console.log(`📍 [VOICE CHECKPOINT 5] Running Adaptive RAG for persona "${selectedPersona}" & memories for ${userIdentifier}...`);

    let qdrantMemories = [];
    let adaptiveRag = { contextPrompt: "", ragSource: null, latencyMs: 0, groundingDetails: null };

    try {
      const [personalMemoriesResult, adaptiveRagResult] = await Promise.allSettled([
        memoryService.searchUserMemory(prompt, userIdentifier, 2),
        adaptiveRagService.getPersonaGrounding(prompt, selectedPersona),
      ]);

      if (personalMemoriesResult.status === "fulfilled" && Array.isArray(personalMemoriesResult.value)) {
        qdrantMemories = personalMemoriesResult.value;
        if (qdrantMemories.length > 0) {
          console.log(`✅ [VOICE CHECKPOINT 5] Qdrant returned ${qdrantMemories.length} relevant user memories`);
        }
      }

      if (adaptiveRagResult.status === "fulfilled" && adaptiveRagResult.value) {
        adaptiveRag = adaptiveRagResult.value;
        if (adaptiveRag.ragSource && adaptiveRag.ragSource !== "none") {
          console.log(`🎯 [VOICE CHECKPOINT 5] Adaptive RAG matched: ${adaptiveRag.ragSource} in ${adaptiveRag.latencyMs}ms`);
        }
      }
    } catch (ragErr) {
      console.warn("⚠️ [VOICE CHECKPOINT 5] RAG retrieval error:", ragErr.message);
    }

    let dynamicInstruction = typeof aiService.getSystemInstruction === "function" 
      ? aiService.getSystemInstruction(selectedPersona) 
      : DEFAULT_SYSTEM_INSTRUCTION;

    if (adaptiveRag.contextPrompt) {
      dynamicInstruction += adaptiveRag.contextPrompt;
    }

    if (qdrantMemories.length > 0) {
      dynamicInstruction += `\n\n[USER RECALLED LONG-TERM MEMORIES & PERSONAL FACTS]:\n${qdrantMemories.map((m, i) => `${i + 1}. ${m}`).join("\n")}\nNaturally acknowledge these known personal details if relevant to the question.`;
    }

    // 4. Generate AI response via Groq (Primary) with Gemini (Fallback)
    console.log(`📍 [VOICE CHECKPOINT 6] Invoking AI Orchestrator with Persona "${selectedPersona}"...`);
    const aiResult = await aiService.generateAIResponse({
      prompt,
      history: recentHistory,
      systemInstruction: dynamicInstruction,
      persona: selectedPersona,
    });
    const aiReply = aiResult.reply;
    console.log(`🤖 [VOICE CHECKPOINT 6] AI (${aiResult.provider} / ${aiResult.model}) replied in ${aiResult.latencyMs}ms: "${aiReply.slice(0, 100)}..."`);

    // 5. Save exchange to MongoDB conversation history
    console.log("📍 [VOICE CHECKPOINT 7] Saving exchange to MongoDB...");
    try {
      await Conversation.appendTurn(user._id, prompt, aiReply, aiResult.toolUsed);
      console.log("✅ [VOICE CHECKPOINT 7] Exchange persisted to MongoDB conversation history");
    } catch (dbErr) {
      console.warn("⚠️ MongoDB history save warning:", dbErr.message);
    }

    // 6. Asynchronously index memory into Qdrant Vector Cloud for continuous learning
    memoryService
      .saveUserMemory(`User: ${prompt} | Chatly: ${aiReply}`, userIdentifier)
      .catch((err) => console.warn("⚠️ Qdrant async save warning:", err.message));

    // 7. Synthesize speech using Deepgram TTS (Alexis or requested Aura model)
    const selectedVoiceModel = req.body?.voiceModel || "flux-alexis-en";
    console.log(`📍 [VOICE CHECKPOINT 9] Requesting Deepgram TTS (${selectedVoiceModel})...`);
    let audioPayload = null;
    const ttsStart = Date.now();
    try {
      audioPayload = await deepgramTts.generateSpeech(aiReply, selectedVoiceModel);
      console.log(`🔊 [VOICE CHECKPOINT 9] Deepgram TTS generated in ${Date.now() - ttsStart}ms (${audioPayload?.audioBase64?.length || 0} base64 chars)`);
    } catch (ttsErr) {
      console.warn("⚠️ [VOICE CHECKPOINT 9] Deepgram TTS failed, falling back to browser speech synthesis:", ttsErr.message);
    }

    // 8. Store in Semantic Cache for zero-cost subsequent hits
    semanticCache.set(prompt, adaptiveRag.queryVector, selectedPersona, {
      reply: aiReply,
      audio: audioPayload?.audioBase64 || null,
      audioFormat: audioPayload?.format || "audio/wav",
      ragSource: adaptiveRag.ragSource,
      groundingDetails: adaptiveRag.groundingDetails,
    });

    const totalDuration = Date.now() - startTotal;
    console.log(`🏁 [VOICE CHECKPOINT 10] Complete pipeline finished in ${totalDuration}ms. Sending 200 OK.`);

    return res.json({
      status: "success",
      reply: aiReply,
      provider: aiResult.provider,
      model: aiResult.model,
      aiLatencyMs: aiResult.latencyMs,
      audio: audioPayload?.audioBase64 || null,
      audioFormat: audioPayload?.format || "audio/wav",
      voice: {
        name: audioPayload?.model || "alexis",
        uuid: audioPayload?.modelUuid || "36f312ab-d06a-4c1c-9071-ba18bebb29e9",
        requestId: audioPayload?.requestId || "",
      },
      userText: prompt,
      quota,
      persona: selectedPersona,
      ragSource: adaptiveRag.ragSource || (qdrantMemories.length > 0 ? "user_memory" : null),
      groundingDetails: adaptiveRag.groundingDetails || null,
      ragLatencyMs: adaptiveRag.latencyMs || 0,
      toolUsed: aiResult.toolUsed || null,
      hasLongTermMemory: qdrantMemories.length > 0,
      memoryTurns: (recentHistory?.length || 0) / 2 + 1,
    });
  } catch (error) {
    console.error("❌ [VOICE CHECKPOINT CRITICAL ERROR] Pipeline failure:", error.message || error);
    console.error(error.stack);
    return res.status(500).json({
      error: "An unexpected error occurred while processing your voice request.",
      details: error.message,
      reply: "Sorry, I had trouble generating a response. Please try again.",
    });
  }
});

// =========================================================
// POST /api/voice/debate/turn - AI vs AI "Debate Arena" Mode
// =========================================================
router.post("/debate/turn", optionalVerifyToken, async (req, res) => {
  const t0 = Date.now();
  try {
    const { topic, round = 1, currentSpeaker = "andhbhakt", history = [] } = req.body;
    if (!topic || !topic.trim()) {
      return res.status(400).json({ error: "Debate topic is required." });
    }

    const speaker = currentSpeaker === "rational" ? "rational" : "andhbhakt";
    const nextSpeaker = speaker === "andhbhakt" ? "rational" : "andhbhakt";
    const speakerName = speaker === "andhbhakt" ? "Saffron Debater" : "Rationalist Analyst";
    const speakerAvatar = speaker === "andhbhakt" ? "🚩" : "⚖️";

    // Alternate voices: Female Asteria for Saffron, Male Orion for Rationalist
    const targetVoice = speaker === "andhbhakt" ? "aura-asteria-en" : "aura-orion-en";

    // Extract last opposing statement if available
    const lastTurn = history && history.length > 0 ? history[history.length - 1] : null;
    const debateContext = lastTurn
      ? `Your opponent said: "${lastTurn.text}". Deliver a direct, sharp rebuttal.`
      : `You are opening the debate on: "${topic}".`;

    // Hybrid Grounding for the active speaker persona
    const adaptiveRag = await adaptiveRagService.getPersonaGrounding(`${topic} ${lastTurn?.text || ""}`, speaker);

    let systemInstruction = speaker === "andhbhakt"
      ? `You are the firebrand Saffron Debater in a high-stakes TV news debate against a skeptical rationalist. Debate Topic: "${topic}". Defend PM Narendra Modi and India's post-2014 resurgence with intense patriotic conviction, witty counters, and sharp whataboutisms comparing pre-2014 failures. Address your opponent's exact points directly in 2 firecracker, spoken conversational Hinglish sentences in Roman script (e.g. 'Arre bhai, pehle ground reality toh dekh lijiye!'). Never use markdown, bullets, or code.`
      : `You are the Rationalist Analyst in a live verbal debate against a saffron hyper-nationalist. Debate Topic: "${topic}". Dissect claims with calm objectivity, cite empirical statistical facts, highlight trade-offs, and challenge exaggerations in 2 clear spoken conversational sentences. Never use markdown, bullets, or code.`;

    if (adaptiveRag.contextPrompt) {
      systemInstruction += adaptiveRag.contextPrompt;
    }

    // Call AI to generate concise spoken debate turn
    const aiResult = await aiService.generateAIResponse({
      prompt: `${debateContext} Respond directly to your opponent in 2 natural spoken sentences.`,
      history: history.slice(-4).map((h) => ({ role: h.speaker === speaker ? "assistant" : "user", text: h.text })),
      systemInstruction,
      persona: speaker,
    });

    const replyText = aiResult.reply;

    // Synthesize voice
    let audioPayload = null;
    try {
      audioPayload = await deepgramTts.generateSpeech(replyText, targetVoice);
    } catch (_) {}

    return res.json({
      status: "success",
      round,
      speaker,
      speakerName,
      speakerAvatar,
      reply: replyText,
      audio: audioPayload?.audioBase64 || null,
      audioFormat: audioPayload?.format || "audio/wav",
      voiceModel: targetVoice,
      ragSource: adaptiveRag.ragSource,
      groundingDetails: adaptiveRag.groundingDetails,
      nextSpeaker,
      latencyMs: Date.now() - t0,
    });
  } catch (err) {
    console.error("❌ [DEBATE ARENA ERROR]:", err.message);
    return res.status(500).json({ error: "Failed to generate debate turn.", details: err.message });
  }
});

export default router;
