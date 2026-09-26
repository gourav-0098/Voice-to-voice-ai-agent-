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

/**
 * Fast REST fallback synthesizer for single sentences or clauses.
 * Returns base64 WAV/linear16 audio data.
 */
export async function synthesizeSentenceAudio(sentenceText, voiceModel = "aura-asteria-en") {
  const clean = cleanForVoice(sentenceText);
  if (!clean) return null;

  const targetModel = voiceModel || "aura-asteria-en";
  const endpoint = targetModel.startsWith("aura-") ? "v1" : "v2";
  const url = `https://api.deepgram.com/${endpoint}/speak?model=${encodeURIComponent(targetModel)}&encoding=linear16&sample_rate=24000`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${DEEPGRAM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: clean }),
  });

  if (!resp.ok) {
    throw new Error(`Deepgram TTS HTTP error ${resp.status}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return {
    audioBase64: buffer.toString("base64"),
    format: "audio/wav",
    sizeBytes: buffer.length,
    text: clean,
  };
}

/**
 * Streaming LLM Orchestrator
 * Streams tokens from Groq or Gemini, buffers into natural sentence chunks,
 * and feeds sentences concurrently into speech synthesis for sub-300ms audio delivery.
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

  // Helper to trigger sentence synthesis immediately
  const triggerSentenceSynthesis = async (sentenceText) => {
    const clean = cleanForVoice(sentenceText);
    if (!clean || clean.length < 2) return;

    const sIndex = sentenceIndex++;
    const sStart = Date.now();

    try {
      const audioPayload = await synthesizeSentenceAudio(clean, voiceModel);
      if (audioPayload && onAudioChunk) {
        if (!firstAudioTime) {
          firstAudioTime = Date.now() - t0;
          console.log(`⚡⚡ [REAL-TIME STREAMING] Time-to-First-Audio: ${firstAudioTime}ms!`);
        }

        onAudioChunk({
          index: sIndex,
          text: clean,
          audio: audioPayload.audioBase64,
          format: audioPayload.format,
          latencyMs: Date.now() - sStart,
          totalElapsedMs: Date.now() - t0,
        });
      }
      if (onSentenceComplete) {
        onSentenceComplete({ index: sIndex, text: clean });
      }
    } catch (err) {
      console.warn(`⚠️ [STREAMING TTS] Failed to synthesize chunk #${sIndex}:`, err.message);
    }
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

                // Check for sentence/clause boundary: '.', '?', '!', '\n', or ',' after >= 7 words
                const wordCount = currentSentenceBuffer.trim().split(/\s+/).length;
                const boundaryMatch = currentSentenceBuffer.match(/([.?!;\n])\s+/);
                const clauseMatch = wordCount >= 7 && currentSentenceBuffer.match(/(,)\s+/);

                if (boundaryMatch || clauseMatch) {
                  const match = boundaryMatch || clauseMatch;
                  const cutIdx = match.index + 1;
                  const complete = currentSentenceBuffer.substring(0, cutIdx).trim();
                  currentSentenceBuffer = currentSentenceBuffer.substring(cutIdx).trim();

                  triggerSentenceSynthesis(complete);
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

            const match = currentSentenceBuffer.match(/([.?!;\n])\s+/);
            if (match) {
              const cutIdx = match.index + 1;
              const complete = currentSentenceBuffer.substring(0, cutIdx).trim();
              currentSentenceBuffer = currentSentenceBuffer.substring(cutIdx).trim();
              triggerSentenceSynthesis(complete);
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
    await triggerSentenceSynthesis(currentSentenceBuffer.trim());
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
