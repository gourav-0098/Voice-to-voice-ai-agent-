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
const ai = new GoogleGenAI({ apiKey });

// System instruction for clean conversational spoken output
const SYSTEM_INSTRUCTION =
  "You are Chatly, an intelligent, helpful, and natural conversational voice AI companion. Answer the user directly and conversationally in 1 to 2 clear spoken sentences. Do NOT repeat or echo the user's question. Do NOT use markdown symbols, asterisks, hashtags, or bullet points so it sounds natural when spoken aloud via text-to-speech.";

// =========================================================
// DELETE /api/voice/history - Clear conversation context
// =========================================================
router.delete("/history", verifyToken, async (req, res) => {
  try {
    await Conversation.clearHistory(req.user._id);
    return res.json({ status: "success", message: "Conversation history cleared." });
  } catch (err) {
    console.error("Clear history error:", err.message || err);
    return res.status(500).json({ error: "Failed to clear history." });
  }
});

// =========================================================
// POST /api/voice - Main Voice Pipeline (Gemini + Qdrant + Deepgram)
// =========================================================
router.post("/", voiceLimiter, verifyToken, async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === "admin" || user.email?.toLowerCase() === "r19216871@gamil.com";

    // 1. Sliding-window account rate limit: 5 calls/hour, 10 calls/day (Admin unlimited)
    const quota = await user.checkAndRecordVoiceCall();
    if (!quota.allowed) {
      return res.status(429).json({
        error: quota.error,
        quota,
        reply: quota.error,
      });
    }

    const userText = req.body?.text || req.body?.message || "";
    if (!userText || typeof userText !== "string" || !userText.trim() || userText.length > 2000) {
      return res.status(400).json({
        error: "Valid text (max 2000 characters) is required in request body.",
      });
    }

    const prompt = userText.trim();

    // 2. Retrieve recent conversation history from MongoDB (All Users)
    const recentHistory = await Conversation.getRecentTurns(user._id, 6);

    // 3. If Admin: Retrieve long-term semantic knowledge from Qdrant ('first_cluster')
    let qdrantMemories = [];
    if (isAdmin) {
      try {
        qdrantMemories = await memoryService.searchAdminKnowledge(prompt, 2);
      } catch (_) {}
    }

    let dynamicInstruction = SYSTEM_INSTRUCTION;
    if (qdrantMemories.length > 0) {
      dynamicInstruction += `\n\n[RETRIEVED FROM ADMIN QDRANT KNOWLEDGE BASE & LONG-TERM MEMORY]:\n${qdrantMemories.map((m, i) => `${i + 1}. ${m}`).join("\n")}\nUse these retrieved facts naturally if relevant to the user's question.`;
    }

    // 4. Send multi-turn contents to Google Gemini 2.5 Flash
    const contents = [
      ...recentHistory,
      { role: "user", parts: [{ text: prompt }] },
    ];

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction: dynamicInstruction,
      },
    });

    const aiReply = response.text?.trim() || "I hear you! How can I help you further?";

    // 5. Save exchange to MongoDB conversation history for future turns
    await Conversation.appendTurn(user._id, prompt, aiReply);

    // 6. If Admin: Asynchronously index memory into Qdrant for long-term recall
    if (isAdmin) {
      memoryService
        .saveAdminMemory(`User asked: ${prompt}. Chatly answered: ${aiReply}`, user.email)
        .catch(() => {});
    }

    // 7. Synthesize speech using Deepgram's Flux TTS (Alexis Voice)
    let audioPayload = null;
    try {
      audioPayload = await deepgramTts.generateSpeech(aiReply);
    } catch (_) {}

    // Send AI reply, audio data, and quota status back to frontend
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
    console.error("Voice processing error:", error.message || error);
    return res.status(500).json({
      error: "An unexpected error occurred while processing your voice request.",
      reply: "Sorry, I had trouble generating a response. Please try again.",
    });
  }
});

export default router;
