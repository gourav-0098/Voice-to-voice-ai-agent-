import express from "express";
import { GoogleGenAI } from "@google/genai";
import { verifyToken } from "../middleware/auth.js";
import { voiceLimiter } from "../middleware/security.js";
import Conversation from "../models/Conversation.js";
import memoryService from "../services/memoryService.js";
import deepgramTts from "../services/deepgramTtsService.js";

const router = express.Router();

// Initialize Google Gemini client
const apiKey = process.env.GEMINI_API_KEY || "";
console.log("📍 [VOICE CHECKPOINT] Initializing Gemini AI client. Key present:", !!apiKey);
let ai = null;
try {
  ai = new GoogleGenAI({ apiKey });
  console.log("✅ [VOICE CHECKPOINT] GoogleGenAI client ready!");
} catch (err) {
  console.error("❌ [VOICE CHECKPOINT ERROR] GoogleGenAI init failure:", err.message);
}

// System instruction for clean conversational spoken output
const SYSTEM_INSTRUCTION =
  "You are Chatly, an intelligent, helpful, and natural conversational voice AI companion. Answer the user directly and conversationally in 1 to 2 clear spoken sentences. " +
  "CRITICAL FOR HINDI & HINGLISH: If the user speaks or asks in Hindi or Hinglish, always answer in friendly, natural conversational Hinglish using the English/Latin alphabet (Romanized Hindi, e.g., 'Haan bilkul! Main aapki madad kar sakta hoon. Aap kya puchna chahte hain?'). Never output Devanagari Hindi characters (do not write in हिंदी लिपि), because the text-to-speech engine requires Romanized Latin characters to speak aloud. " +
  "Do NOT repeat or echo the user's question. Do NOT use markdown symbols, asterisks, hashtags, or bullet points so it sounds natural when spoken aloud via text-to-speech.";

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
// POST /api/voice - Main Voice Pipeline (Gemini + Qdrant + Deepgram)
// =========================================================
router.post("/", voiceLimiter, verifyToken, async (req, res) => {
  const startTotal = Date.now();
  console.log("📍 [VOICE CHECKPOINT 1] Received voice request from user:", req.user?.email);

  try {
    const user = req.user;
    const isAdmin = user.role === "admin" || user.email?.toLowerCase() === "r19216871@gamil.com";

    // 1. Sliding-window account rate limit
    console.log(`📍 [VOICE CHECKPOINT 2] Checking quota for user ${user.email} (isAdmin: ${isAdmin})...`);
    const quota = await user.checkAndRecordVoiceCall();
    if (!quota.allowed) {
      console.warn(`⚠️ [VOICE CHECKPOINT 2] Quota exceeded for user: ${user.email}`);
      return res.status(429).json({
        error: quota.error,
        quota,
        reply: quota.error,
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

    // 2. Retrieve recent conversation history from MongoDB
    console.log("📍 [VOICE CHECKPOINT 4] Fetching recent conversation turns from MongoDB...");
    const recentHistory = await Conversation.getRecentTurns(user._id, 6);
    console.log(`✅ [VOICE CHECKPOINT 4] Retrieved ${recentHistory.length} previous history items`);

    // 3. If Admin: Retrieve long-term semantic knowledge from Qdrant
    let qdrantMemories = [];
    if (isAdmin) {
      console.log("📍 [VOICE CHECKPOINT 5] Searching admin memory in Qdrant Vector Cloud...");
      try {
        qdrantMemories = await memoryService.searchAdminKnowledge(prompt, 2);
        console.log(`✅ [VOICE CHECKPOINT 5] Qdrant returned ${qdrantMemories.length} relevant memories`);
      } catch (memErr) {
        console.warn("⚠️ [VOICE CHECKPOINT 5] Qdrant search warning:", memErr.message);
      }
    }

    let dynamicInstruction = SYSTEM_INSTRUCTION;
    if (qdrantMemories.length > 0) {
      dynamicInstruction += `\n\n[RETRIEVED FROM ADMIN QDRANT KNOWLEDGE BASE & LONG-TERM MEMORY]:\n${qdrantMemories.map((m, i) => `${i + 1}. ${m}`).join("\n")}\nUse these retrieved facts naturally if relevant to the user's question.`;
    }

    // 4. Send multi-turn contents to Google Gemini 2.5 Flash
    console.log("📍 [VOICE CHECKPOINT 6] Calling Google Gemini 2.5 Flash...");
    const contents = [
      ...recentHistory,
      { role: "user", parts: [{ text: prompt }] },
    ];

    const geminiStart = Date.now();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction: dynamicInstruction,
      },
    });

    const aiReply = response.text?.trim() || "I hear you! How can I help you further?";
    console.log(`🤖 [VOICE CHECKPOINT 6] Gemini replied in ${Date.now() - geminiStart}ms: "${aiReply.slice(0, 100)}..."`);

    // 5. Save exchange to MongoDB conversation history
    console.log("📍 [VOICE CHECKPOINT 7] Saving exchange to MongoDB...");
    await Conversation.appendTurn(user._id, prompt, aiReply);
    console.log("✅ [VOICE CHECKPOINT 7] Exchange persisted to MongoDB conversation history");

    // 6. If Admin: Asynchronously index memory into Qdrant
    if (isAdmin) {
      console.log("📍 [VOICE CHECKPOINT 8] Queuing Qdrant memory indexing for admin...");
      memoryService
        .saveAdminMemory(`User asked: ${prompt}. Chatly answered: ${aiReply}`, user.email)
        .catch((err) => console.warn("⚠️ Qdrant async save error:", err.message));
    }

    // 7. Synthesize speech using Deepgram's Flux TTS (Alexis Voice)
    console.log("📍 [VOICE CHECKPOINT 9] Requesting Deepgram Alexis TTS...");
    let audioPayload = null;
    const ttsStart = Date.now();
    try {
      audioPayload = await deepgramTts.generateSpeech(aiReply);
      console.log(`🔊 [VOICE CHECKPOINT 9] Deepgram TTS generated in ${Date.now() - ttsStart}ms (${audioPayload?.audioBase64?.length || 0} base64 chars)`);
    } catch (ttsErr) {
      console.warn("⚠️ [VOICE CHECKPOINT 9] Deepgram TTS failed, falling back to browser speech synthesis:", ttsErr.message);
    }

    const totalDuration = Date.now() - startTotal;
    console.log(`🏁 [VOICE CHECKPOINT 10] Complete pipeline finished in ${totalDuration}ms. Sending 200 OK.`);

    return res.json({
      status: "success",
      reply: aiReply,
      audio: audioPayload?.audioBase64 || null,
      audioFormat: audioPayload?.format || "audio/wav",
      voice: {
        name: audioPayload?.model || "alexis",
        uuid: audioPayload?.modelUuid || "36f312ab-d06a-4c1c-9071-ba18bebb29e9",
        requestId: audioPayload?.requestId || "",
      },
      userText: prompt,
      quota,
      hasLongTermMemory: qdrantMemories.length > 0,
      memoryTurns: recentHistory.length / 2 + 1,
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

export default router;
