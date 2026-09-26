import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import memoryService from "./memoryService.js";
import adaptiveRagService from "./adaptiveRagService.js";
import aiService, { DEFAULT_SYSTEM_INSTRUCTION } from "./aiService.js";
import streamingVoiceService from "./streamingVoiceService.js";
import { routeQuery } from "./queryRouter.js";
import { buildEvidencePack } from "./evidencePackBuilder.js";
import toolService from "./toolService.js";
import groqMemoryWorker from "./groqMemoryWorker.js";

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

          // Fast Deterministic Query Intelligence Router (< 2ms)
          const route = routeQuery(prompt, { persona, historyLength: (data.history || []).length });
          console.log(`🧭 [WS ROUTE] Intent: ${route.intent} | Mode: ${route.mode} | NeedsRAG: ${route.needsRag} | NeedsLiveSearch: ${route.needsLiveSearch} (${route.routerLatencyMs}ms)`);

          let adaptiveRag = { contextPrompt: "", ragSource: null, groundingDetails: null, latencyMs: 0 };
          let qdrantMemories = [];
          let dbHistory = [];
          let liveWebResult = null;
          let evidencePack = null;

          const retrievalTasks = [];

          // 1. History retrieval
          retrievalTasks.push(
            (Array.isArray(data.history) && data.history.length > 0)
              ? Promise.resolve([])
              : (authenticatedUser ? Conversation.getRecentTurns(authenticatedUser._id, 8).catch(() => []) : Promise.resolve([]))
          );

          // 2. Memory retrieval (if not simple chit-chat)
          if (route.intent === "MEMORY" || route.needsRag) {
            retrievalTasks.push(memoryService.searchUserMemory(prompt, userIdentifier, 2).catch(() => []));
          } else {
            retrievalTasks.push(Promise.resolve([]));
          }

          // 3. Qdrant RAG Grounding (if needed)
          if (route.needsRag) {
            retrievalTasks.push(adaptiveRagService.getPersonaGrounding(prompt, persona).catch(() => ({ contextPrompt: "", ragSource: null })));
          } else {
            retrievalTasks.push(Promise.resolve({ contextPrompt: "", ragSource: null }));
          }

          // 4. Parallel Live Web Search (if current events / statement today)
          if (route.needsLiveSearch) {
            retrievalTasks.push(
              toolService.webSearch(prompt).then((res) => ({ text: res, title: "Live Web Search" })).catch(() => null)
            );
          } else {
            retrievalTasks.push(Promise.resolve(null));
          }

          // Execute all retrieval in PARALLEL
          const [fetchedHistory, fetchedMemories, fetchedRag, fetchedWeb] = await Promise.all(retrievalTasks);
          dbHistory = fetchedHistory || [];
          qdrantMemories = fetchedMemories || [];
          adaptiveRag = fetchedRag || adaptiveRag;
          liveWebResult = fetchedWeb || null;

          // Format clean Evidence Pack if RAG or Live Search was retrieved
          const qdrantChunks = adaptiveRag.groundingDetails ? [adaptiveRag.groundingDetails] : [];
          const webChunks = liveWebResult ? [liveWebResult] : [];

          if (qdrantChunks.length > 0 || webChunks.length > 0) {
            evidencePack = buildEvidencePack({
              query: prompt,
              topic: route.detectedTopic,
              qdrantResults: qdrantChunks,
              webResults: webChunks,
              intent: route.intent,
            });
          }

          // Prefer real-time client history if provided, falling back to database turns
          const recentHistory = (Array.isArray(data.history) && data.history.length > 0)
            ? data.history
            : dbHistory;

          // Send RAG telemetry event to frontend immediately
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "rag_grounded",
              ragSource: adaptiveRag.ragSource || (route.needsLiveSearch ? "live_search" : "chit_chat_direct"),
              latencyMs: adaptiveRag.latencyMs || route.routerLatencyMs,
              citations: evidencePack?.uiCitations || [],
              confidence: evidencePack?.confidenceLevel || "HIGH",
            }));
          }

          // Build dynamic instruction
          let dynamicInstruction = typeof aiService.getSystemInstruction === "function"
            ? aiService.getSystemInstruction(persona, voiceModel)
            : DEFAULT_SYSTEM_INSTRUCTION;

          if (evidencePack && evidencePack.spokenEvidenceContext) {
            dynamicInstruction += `\n\n${evidencePack.spokenEvidenceContext}`;
          } else if (adaptiveRag.contextPrompt) {
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

          // Send Turn Completion with Full Latency Telemetry
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "turn_complete",
              fullText: streamResult.fullText,
              firstAudioTimeMs: streamResult.firstAudioTimeMs,
              totalLatencyMs: streamResult.totalLatencyMs,
              sentenceCount: streamResult.sentenceCount,
              ragSource: adaptiveRag.ragSource || (route.needsLiveSearch ? "live_search" : "chit_chat_direct"),
              telemetry: {
                routeMs: route.routerLatencyMs,
                ragMs: adaptiveRag.latencyMs || 0,
                llmFirstTokenMs: streamResult.firstTokenTimeMs,
                firstAudioMs: streamResult.firstAudioTimeMs,
                totalMs: streamResult.totalLatencyMs,
                confidence: evidencePack?.confidenceLevel || "HIGH",
              },
            }));
          }

          // Persist conversation in MongoDB asynchronously
          if (authenticatedUser) {
            Conversation.appendTurn(authenticatedUser._id, prompt, streamResult.fullText).catch(() => {});
          }

          // Asynchronously extract distilled, durable user memories in the background via Groq (Zero blocking latency)
          setImmediate(() => {
            groqMemoryWorker.extractMemoriesAsync({
              userPrompt: prompt,
              aiResponse: streamResult.fullText,
              userId: userIdentifier,
              intent: route.intent,
            }).catch(() => {});
          });
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
