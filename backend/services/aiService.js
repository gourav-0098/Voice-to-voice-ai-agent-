import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

export const DEFAULT_SYSTEM_INSTRUCTION =
  "You are Chatly, an intelligent, helpful, and natural conversational voice AI companion. Answer the user directly and conversationally in 1 to 2 clear spoken sentences. " +
  "CRITICAL FOR HINDI & HINGLISH: If the user speaks or asks in Hindi or Hinglish, always answer in friendly, natural conversational Hinglish using the English/Latin alphabet (Romanized Hindi, e.g., 'Haan bilkul! Main aapki madad kar sakta hoon. Aap kya puchna chahte hain?'). Never output Devanagari Hindi characters (do not write in हिंदी लिपि), because the text-to-speech engine requires Romanized Latin characters to speak aloud. " +
  "Do NOT repeat or echo the user's question. Do NOT use markdown symbols, asterisks, hashtags, or bullet points so it sounds natural when spoken aloud via text-to-speech.";

// Initialize Gemini client for fallback
let geminiClient = null;
function getGeminiClient() {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (apiKey) {
      try {
        geminiClient = new GoogleGenAI({ apiKey });
      } catch (err) {
        console.warn("⚠️ [AI SERVICE] Gemini client init warning:", err.message);
      }
    }
  }
  return geminiClient;
}

/**
 * Clean text for clean TTS speech output (remove markdown, asterisks, bullet points)
 */
function cleanForVoice(text) {
  if (!text) return "";
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "") // Remove reasoning tokens if any
    .replace(/[*_#`~>]/g, "") // Remove markdown asterisks, hashes, backticks
    .replace(/\[.*?\]\(.*?\)/g, "") // Remove links
    .replace(/^\s*[-•*]\s+/gm, "") // Remove bullet points
    .replace(/\s{2,}/g, " ") // Normalize spaces
    .trim();
}

/**
 * Call Groq Cloud Chat Completion API
 * @param {Object} options
 * @param {string} options.prompt - Current user question/input
 * @param {Array} options.history - Array of { role, text } turns
 * @param {string} options.systemInstruction - Custom system prompt
 * @param {string} [options.model] - Groq model name
 * @returns {Promise<{reply: string, model: string}>}
 */
async function callGroq({ prompt, history = [], systemInstruction, model = "groq/compound-mini" }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const messages = [
    { role: "system", content: systemInstruction || DEFAULT_SYSTEM_INSTRUCTION },
  ];

  // Append recent conversation history (last 6 turns)
  for (const turn of history.slice(-6)) {
    const role = (turn.sender === "user" || turn.role === "user") ? "user" : "assistant";
    const content = turn.text || "";
    if (content) {
      messages.push({ role, content });
    }
  }

  // Append current user prompt
  messages.push({ role: "user", content: prompt });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout for Groq

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 150, // Keep concise for voice synthesis
        temperature: 0.7,
      }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Groq HTTP ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    let reply = data.choices?.[0]?.message?.content?.trim() || "";
    reply = cleanForVoice(reply);

    if (!reply) {
      throw new Error("Empty response returned from Groq.");
    }

    return { reply, model };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Call Google Gemini API (Emergency / Quota Fallback)
 * @param {Object} options
 * @returns {Promise<{reply: string, model: string}>}
 */
async function callGemini({ prompt, history = [], systemInstruction, model = "gemini-2.5-flash" }) {
  const client = getGeminiClient();
  if (!client) {
    throw new Error("Gemini AI client is not available.");
  }

  const contents = [];
  for (const turn of history.slice(-6)) {
    const role = (turn.sender === "user" || turn.role === "user") ? "user" : "model";
    contents.push({
      role,
      parts: [{ text: turn.text || "" }],
    });
  }
  contents.push({ role: "user", parts: [{ text: prompt }] });

  const response = await client.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: systemInstruction || DEFAULT_SYSTEM_INSTRUCTION,
    },
  });

  let reply = "";
  if (response.text) {
    reply = response.text.trim();
  } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
    reply = response.candidates[0].content.parts[0].text.trim();
  }

  reply = cleanForVoice(reply);
  if (!reply) {
    throw new Error("Empty response returned from Gemini.");
  }

  return { reply, model };
}

/**
 * Orchestrate AI Generation: Groq (Primary) -> Gemini (Fallback) -> Safe Fallback
 * @param {Object} params
 * @param {string} params.prompt - Spoken user text
 * @param {Array} [params.history] - Recent conversation turns
 * @param {string} [params.systemInstruction] - Dynamic prompt including Qdrant memory
 * @returns {Promise<{reply: string, provider: string, model: string, latencyMs: number}>}
 */
export async function generateAIResponse({ prompt, history = [], systemInstruction = DEFAULT_SYSTEM_INSTRUCTION }) {
  const startTime = Date.now();

  // 1. PRIMARY: Try Groq (Ultra-fast, 30 RPM)
  try {
    console.log("🚀 [AI ORCHESTRATOR] Calling Primary AI: Groq (groq/compound-mini)...");
    const groqResult = await callGroq({ prompt, history, systemInstruction, model: "groq/compound-mini" });
    const latencyMs = Date.now() - startTime;
    console.log(`✅ [AI ORCHESTRATOR] Groq replied in ${latencyMs}ms: "${groqResult.reply.slice(0, 80)}..."`);
    return {
      reply: groqResult.reply,
      provider: "groq",
      model: groqResult.model,
      latencyMs,
    };
  } catch (groqErr) {
    console.warn("⚠️ [AI ORCHESTRATOR] Groq primary failed:", groqErr.message || groqErr);
  }

  // 2. SECONDARY / EMERGENCY FALLBACK: Google Gemini 2.5 Flash
  try {
    console.log("🔄 [AI ORCHESTRATOR] Failing over to Secondary AI: Google Gemini 2.5 Flash...");
    const geminiStart = Date.now();
    const geminiResult = await callGemini({ prompt, history, systemInstruction });
    const latencyMs = Date.now() - startTime;
    console.log(`✅ [AI ORCHESTRATOR] Gemini fallback replied in ${Date.now() - geminiStart}ms: "${geminiResult.reply.slice(0, 80)}..."`);
    return {
      reply: geminiResult.reply,
      provider: "gemini",
      model: geminiResult.model,
      latencyMs,
    };
  } catch (geminiErr) {
    console.error("❌ [AI ORCHESTRATOR] Gemini fallback also failed:", geminiErr.message || geminiErr);
  }

  // 3. FINAL RESILIENT FALLBACK: Never crash the voice turn
  const latencyMs = Date.now() - startTime;
  return {
    reply: "I heard you clearly, but my connection momentarily blinked. Could you please say that again?",
    provider: "fallback",
    model: "none",
    latencyMs,
  };
}

export default {
  generateAIResponse,
  DEFAULT_SYSTEM_INSTRUCTION,
};
