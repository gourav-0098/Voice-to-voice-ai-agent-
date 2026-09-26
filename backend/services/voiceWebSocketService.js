import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import memoryService from "./memoryService.js";
import adaptiveRagService from "./adaptiveRagService.js";
import aiService, { DEFAULT_SYSTEM_INSTRUCTION } from "./aiService.js";
import streamingVoiceService from "./streamingVoiceService.js";

/**
 * Attaches the real-time Voice WebSocket Server to the Node HTTP server.
 * Handles sub-300ms duplex voice streaming.
 */
export function setupVoiceWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/voice" });
  console.log("⚡ [WEBSOCKET] Real-Time Voice WebSocket server attached to /ws/voice");

  wss.on("connection", (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`🔌 [WS CONNECT] Client connected from ${clientIp}`);

    let authenticatedUser = null;

    ws.on("message", async (rawMessage) => {
      try {
        const data = JSON.parse(rawMessage.toString());

        // 1. Handshake / Auth Message
        if (data.type === "auth" || data.token) {
          try {
            const token = data.token;
            const secret = process.env.JWT_SECRET || "default_jwt_secret_chatly_ai";
            const decoded = jwt.verify(token, secret);
            authenticatedUser = await User.findById(decoded.id);
            ws.send(JSON.stringify({ type: "auth_ok", user: { id: authenticatedUser?._id, email: authenticatedUser?.email } }));
            if (data.type === "auth") return;
          } catch (_) {
            // Soft fail, allow guest/test mode
          }
        }

        // 2. Main Speech Turn Event
        if (data.type === "speech" || data.type === "user_speech") {
          const prompt = (data.text || data.message || "").trim();
          if (!prompt) return;

          const persona = data.persona || "conversational";
          const voiceModel = data.voiceModel || "aura-asteria-en";
          const userIdentifier = authenticatedUser?.email || "guest_user";
          const t0 = Date.now();

          console.log(`🗣️ [WS VOICE TURN] "${prompt.slice(0, 60)}" (Persona: ${persona}, Voice: ${voiceModel})`);

          // Fast RAG Grounding & History
          const [adaptiveRag, qdrantMemories, dbHistory] = await Promise.all([
            adaptiveRagService.getPersonaGrounding(prompt, persona).catch(() => ({ contextPrompt: "", ragSource: null })),
            memoryService.searchUserMemory(prompt, userIdentifier, 2).catch(() => []),
            authenticatedUser ? Conversation.getRecentTurns(authenticatedUser._id, 8).catch(() => []) : Promise.resolve([]),
          ]);

          // Prefer real-time client history if provided, falling back to database turns
          const recentHistory = (Array.isArray(data.history) && data.history.length > 0)
            ? data.history
            : dbHistory;

          // Send RAG telemetry event to frontend immediately
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "rag_grounded",
              ragSource: adaptiveRag.ragSource,
              latencyMs: adaptiveRag.latencyMs,
            }));
          }

          // Build dynamic instruction
          let dynamicInstruction = typeof aiService.getSystemInstruction === "function"
            ? aiService.getSystemInstruction(persona, voiceModel)
            : DEFAULT_SYSTEM_INSTRUCTION;

          if (adaptiveRag.contextPrompt) {
            dynamicInstruction += adaptiveRag.contextPrompt;
          }
          if (qdrantMemories && qdrantMemories.length > 0) {
            dynamicInstruction += `\n\n[USER RECALLED LONG-TERM MEMORIES]:\n${qdrantMemories.map((m, i) => `${i + 1}. ${m}`).join("\n")}`;
          }

          // Stream LLM tokens directly into sentence audio synthesizer
          const streamResult = await streamingVoiceService.streamVoiceResponse({
            prompt,
            history: recentHistory,
            systemInstruction: dynamicInstruction,
            voiceModel,
            onTokenDelta: (token) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "token_delta", token }));
              }
            },
            onAudioChunk: (chunk) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: "audio_chunk",
                  index: chunk.index,
                  audio: chunk.audio,
                  format: chunk.format,
                  text: chunk.text,
                  latencyMs: chunk.latencyMs,
                  totalElapsedMs: chunk.totalElapsedMs,
                }));
              }
            },
          });

          // Send Turn Completion
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "turn_complete",
              fullText: streamResult.fullText,
              firstAudioTimeMs: streamResult.firstAudioTimeMs,
              totalLatencyMs: streamResult.totalLatencyMs,
              sentenceCount: streamResult.sentenceCount,
              ragSource: adaptiveRag.ragSource,
            }));
          }

          // Persist conversation in MongoDB asynchronously
          if (authenticatedUser) {
            Conversation.appendTurn(authenticatedUser._id, prompt, streamResult.fullText).catch(() => {});
            memoryService.saveUserMemory(`User: ${prompt} | Chatly: ${streamResult.fullText}`, userIdentifier).catch(() => {});
          }
        }
      } catch (err) {
        console.error("❌ [WS MESSAGE ERROR]:", err.message);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "error", message: err.message }));
        }
      }
    });

    ws.on("close", () => {
      console.log(`🔌 [WS DISCONNECT] Client disconnected`);
    });

    ws.on("error", (err) => {
      console.warn("⚠️ [WS SOCKET ERROR]:", err.message);
    });
  });

  return wss;
}

export default {
  setupVoiceWebSocket,
};
