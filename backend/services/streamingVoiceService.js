import WebSocket from "ws";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { DEFAULT_SYSTEM_INSTRUCTION } from "./aiService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const DEEPGRAM_API_KEY =
  process.env.DEEPGRAM_API_KEY || "910e2755e332885f111ed17c514acb5ba03e81ab";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Clean text for speech synthesis (strip markdown, asterisks, brackets, latex)
export function cleanForVoice(text) {
  if (!text) return "";
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
    .replace(/Toolcode:[^\n.]*/gi, "")
    .replace(/\bprint\s*\([^)]*\)[.\s]*/gi, "")
    .replace(/\\\[|\\\]|\\\(|\\\)/g, "")
    .replace(/\\boxed\{([^}]+)\}/g, "$1")
    .replace(/\\sqrt\{([^}]+)\}/g, "square root of $1")
    .replace(/\\times/g, " times ")
    .replace(/\$+/g, "")
    .replace(/[*_#`~>]/g, "")
    .replace(/\[.*?\]\(.*?\)/g, "")
    .replace(/^\s*[-•*]\s+/gm, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Creates a streaming Deepgram WebSocket TTS session.
 * Streams synthesized linear16 binary audio chunks as text is fed into it.
 */
export function createDeepgramTtsStream(voiceModel = "aura-asteria-en", onAudioChunk, onDone, onError) {
  const model = voiceModel.startsWith("aura-") ? voiceModel : "aura-asteria-en";
  const dgWsUrl = `wss://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&encoding=linear16&sample_rate=24000`;

  let ws = null;
  let isOpen = false;
  let isClosed = false;
  const pendingTextQueue = [];

  try {
    ws = new WebSocket(dgWsUrl, {
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
      },
    });

    ws.on("open", () => {
      isOpen = true;
      while (pendingTextQueue.length > 0) {
        const text = pendingTextQueue.shift();
        ws.send(JSON.stringify({ type: "Speak", text }));
      }
    });

    ws.on("message", (data, isBinary) => {
      if (isBinary && onAudioChunk) {
        onAudioChunk(data);
      }
    });

    ws.on("close", () => {
      isClosed = true;
      if (onDone) onDone();
    });

    ws.on("error", (err) => {
      console.warn("⚠️ [DEEPGRAM WS TTS] Error:", err.message);
      if (onError) onError(err);
    });
  } catch (err) {
    if (onError) onError(err);
  }

  return {
    sendText(text) {
      if (!text || isClosed) return;
      if (isOpen && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "Speak", text }));
      } else {
        pendingTextQueue.push(text);
      }
    },
    flush() {
      if (isOpen && ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "Flush" }));
      }
    },
    close() {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "Close" }));
        setTimeout(() => {
          try {
            ws.terminate();
          } catch (_) {}
        }, 800);
      }
    },
  };
}

import { generateSpeech } from "./deepgramTtsService.js";

/**
 * Multi-engine synthesizer for single sentences or clauses.
 * Routes to Sarvam AI Bulbul (Hindi/Hinglish), Edge Neural (backup), or Deepgram (English).
 * Returns { audioBase64, format, text, model }.
 */
export async function synthesizeSentenceAudio(sentenceText, voiceModel = "aura-asteria-en") {
  const clean = cleanForVoice(sentenceText);
  if (!clean) return null;

  try {
    const result = await generateSpeech(clean, voiceModel);
    if (result && result.audioBase64) {
      return {
        audioBase64: result.audioBase64,
        format: result.format || (result.audioBase64.startsWith("//u") || result.format === "audio/mp3" ? "audio/mp3" : "audio/wav"),
        sizeBytes: result.audioBase64.length,
        text: clean,
        model: result.model || voiceModel,
      };
    }
  } catch (err) {
    console.warn(`⚠️ [STREAMING SYNTHESIS] Error for "${clean.slice(0, 30)}":`, err.message);
  }

  return null;
}

/**
 * Helper to identify natural sentence or clause boundary.
 * Supports English punctuation (. ? ! ;), Hindi/Devanagari danda (। ॥),
 * newlines, and clause breaking.
 */
function findSentenceBoundary(buffer) {
  // 1. Full stop punctuation including Devanagari danda: . ? ! ; \n । ॥
  const puncMatch = buffer.match(/([.?!;\n\u0964\u0965])(\s+|$)/);
  if (puncMatch && puncMatch.index !== undefined) {
    return puncMatch.index + puncMatch[1].length;
  }

  // 2. Clause break: comma after at least 7 words and 30 characters
  const words = buffer.trim().split(/\s+/);
  if (words.length >= 7 && buffer.length >= 30) {
    const commaMatch = buffer.match(/([,])\s+/);
    if (commaMatch && commaMatch.index !== undefined && commaMatch.index >= 18) {
      return commaMatch.index + 1;
    }
  }

  // 3. Overflow protection: If buffer exceeds 110 characters without punctuation, break on last space
  if (buffer.length > 110) {
    const lastSpace = buffer.lastIndexOf(" ");
    if (lastSpace > 40) {
      return lastSpace + 1;
    }
  }

  return -1;
}

/**
 * Streaming LLM Orchestrator
 * Streams tokens from Groq or Gemini, buffers into natural sentence chunks,
 * synthesizes sentences concurrently across Sarvam/Edge/Deepgram, and delivers
 * in-order audio chunks with zero SSE freezing.
 */
export async function streamVoiceResponse({
  prompt,
  history = [],
  systemInstruction = DEFAULT_SYSTEM_INSTRUCTION,
  voiceModel = "aura-asteria-en",
  onTokenDelta,
  onAudioChunk,
  onSentenceComplete,
}) {
  const t0 = Date.now();
  let firstTokenTime = null;
  let firstAudioTime = null;
  let fullGeneratedText = "";
  let currentSentenceBuffer = "";
  let sentenceIndex = 0;

  // In-order audio delivery sequencer
  const completedChunks = new Map();
  let nextEmitIndex = 0;
  const inFlightTasks = [];

  const flushOrderedChunks = () => {
    while (completedChunks.has(nextEmitIndex)) {
      const payload = completedChunks.get(nextEmitIndex);
      completedChunks.delete(nextEmitIndex);
      if (payload && onAudioChunk) {
        if (!firstAudioTime) {
          firstAudioTime = Date.now() - t0;
          console.log(`⚡⚡ [REAL-TIME STREAMING] Time-to-First-Audio: ${firstAudioTime}ms!`);
        }
        onAudioChunk(payload);
      }
      nextEmitIndex++;
    }
  };

  const dispatchSentenceSynthesis = (sentenceText) => {
    const clean = cleanForVoice(sentenceText);
    if (!clean || clean.length < 2) return;

    const sIndex = sentenceIndex++;
    const sStart = Date.now();

    const task = (async () => {
      try {
        const audioPayload = await synthesizeSentenceAudio(clean, voiceModel);
        if (audioPayload && audioPayload.audioBase64) {
          completedChunks.set(sIndex, {
            index: sIndex,
            text: clean,
            audio: audioPayload.audioBase64,
            format: audioPayload.format || "audio/wav",
            latencyMs: Date.now() - sStart,
            totalElapsedMs: Date.now() - t0,
            model: audioPayload.model,
          });
        } else {
          completedChunks.set(sIndex, null);
        }
      } catch (err) {
        console.warn(`⚠️ [STREAMING TTS] Failed chunk #${sIndex}:`, err.message);
        completedChunks.set(sIndex, null);
      } finally {
        flushOrderedChunks();
        if (onSentenceComplete) {
          onSentenceComplete({ index: sIndex, text: clean });
        }
      }
    })();

    inFlightTasks.push(task);
  };

  // 1. Try Groq Streaming first (Ultra-low latency ~80ms first token)
  let groqSuccess = false;
  if (GROQ_API_KEY) {
    try {
      const messages = [{ role: "system", content: systemInstruction }];
      for (const turn of history.slice(-4)) {
        messages.push({
          role: (turn.sender === "user" || turn.role === "user") ? "user" : "assistant",
          content: turn.text || "",
        });
      }
      messages.push({ role: "user", content: prompt });

      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "qwen/qwen3.8-27b",
          messages,
          stream: true,
          max_tokens: 350,
          temperature: 0.6,
        }),
      });

      if (resp.ok) {
        groqSuccess = true;
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let streamBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          streamBuffer += decoder.decode(value, { stream: true });

          const lines = streamBuffer.split("\n");
          streamBuffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;
            if (trimmed === "data: [DONE]") break;

            try {
              const json = JSON.parse(trimmed.slice(5).trim());
              const token = json.choices?.[0]?.delta?.content || "";
              if (token) {
                if (!firstTokenTime) {
                  firstTokenTime = Date.now() - t0;
                }
                fullGeneratedText += token;
                currentSentenceBuffer += token;

                if (onTokenDelta) {
                  onTokenDelta(token);
                }

                const cutIdx = findSentenceBoundary(currentSentenceBuffer);
                if (cutIdx > 0) {
                  const complete = currentSentenceBuffer.substring(0, cutIdx).trim();
                  currentSentenceBuffer = currentSentenceBuffer.substring(cutIdx).trim();
                  dispatchSentenceSynthesis(complete);
                }
              }
            } catch (_) {}
          }
        }
      }
    } catch (groqErr) {
      console.warn("⚠️ [STREAMING] Groq stream error, falling back to Gemini:", groqErr.message);
    }
  }

  // 2. Gemini Stream Fallback if Groq was unavailable
  if (!groqSuccess) {
    try {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (geminiApiKey) {
        const client = new GoogleGenAI({ apiKey: geminiApiKey });
        const contents = [];
        for (const turn of history.slice(-4)) {
          contents.push({
            role: (turn.sender === "user" || turn.role === "user") ? "user" : "model",
            parts: [{ text: turn.text || "" }],
          });
        }
        contents.push({ role: "user", parts: [{ text: prompt }] });

        const stream = await client.models.generateContentStream({
          model: "gemini-flash-lite-latest",
          contents,
          config: { systemInstruction },
        });

        for await (const chunk of stream) {
          const token = chunk.text || "";
          if (token) {
            if (!firstTokenTime) firstTokenTime = Date.now() - t0;
            fullGeneratedText += token;
            currentSentenceBuffer += token;

            if (onTokenDelta) onTokenDelta(token);

            const cutIdx = findSentenceBoundary(currentSentenceBuffer);
            if (cutIdx > 0) {
              const complete = currentSentenceBuffer.substring(0, cutIdx).trim();
              currentSentenceBuffer = currentSentenceBuffer.substring(cutIdx).trim();
              dispatchSentenceSynthesis(complete);
            }
          }
        }
      }
    } catch (geminiErr) {
      console.error("❌ [STREAMING] Gemini fallback error:", geminiErr.message);
    }
  }

  // Flush remaining buffer
  if (currentSentenceBuffer.trim()) {
    dispatchSentenceSynthesis(currentSentenceBuffer.trim());
    currentSentenceBuffer = "";
  }

  // CRITICAL: Await all in-flight sentence syntheses so all chunks are delivered before SSE finishes
  if (inFlightTasks.length > 0) {
    await Promise.race([
      Promise.allSettled(inFlightTasks),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
    flushOrderedChunks();
  }

  const cleanFullText = cleanForVoice(fullGeneratedText);
  return {
    fullText: cleanFullText,
    firstTokenTimeMs: firstTokenTime || Date.now() - t0,
    firstAudioTimeMs: firstAudioTime || Date.now() - t0,
    totalLatencyMs: Date.now() - t0,
    sentenceCount: sentenceIndex,
  };
}

export default {
  cleanForVoice,
  createDeepgramTtsStream,
  synthesizeSentenceAudio,
  streamVoiceResponse,
};
