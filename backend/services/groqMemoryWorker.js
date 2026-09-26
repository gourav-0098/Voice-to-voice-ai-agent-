/**
 * Background Groq Memory Worker for Chatly Voice AI
 * 
 * Runs ASYNCHRONOUSLY AFTER a conversation turn has completed / first audio played.
 * Never blocks Time-To-First-Audio (TTFA).
 * 
 * Responsibilities:
 * 1. Filter out non-memory-worthy turns (chit-chat, simple QA, commands) via deterministic regex.
 * 2. Send worthy exchanges to Groq (Llama-3.1-8b-instant / Qwen) with a strict JSON schema.
 * 3. Extract 0 to 3 durable, user-specific facts/preferences (e.g. name, location, preferred stack, goals).
 * 4. Deduplicate against recently extracted memories.
 * 5. Embed and save distilled facts into Qdrant 'first_cluster' under the user's ID.
 * 6. Hard 2.5s circuit-breaker with silent fallback to preserve server stability.
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import memoryService from "./memoryService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Deterministic check to avoid burning Groq RPM on trivial turns
const TRIVIAL_TURN_PATTERN = /^(hi|hello|hey|namaste|kaise ho|kya hal|good morning|good night|bye|thank you|thanks|shukriya|dhanyawad|ok|theek hai|haan|nahi|bolona)\b/i;

// Patterns indicating potentially durable user-specific facts
const MEMORY_WORTHY_INDICATORS = /\b(i am|i have|i live in|i work|my name is|my favourite|my favorite|i prefer|i like|i love|i hate|i want to|i am learning|i use|mera naam|main|mujhe|meri|mera|mere pass|rehta hoon|rehti hoon|seekh raha|pasand hai)\b/i;

// In-memory LRU-like set for deduplicating recent memory extractions per user
const recentMemoriesByUser = new Map();

function isDuplicate(userId, factText) {
  const norm = factText.toLowerCase().replace(/[^a-z0-9]/g, "");
  const userHistory = recentMemoriesByUser.get(userId) || [];
  if (userHistory.includes(norm)) return true;

  userHistory.push(norm);
  if (userHistory.length > 50) userHistory.shift();
  recentMemoriesByUser.set(userId, userHistory);
  return false;
}

/**
 * Extracts durable memories in the background without blocking voice latency
 * 
 * @param {Object} params
 * @param {string} params.userPrompt - User's spoken turn
 * @param {string} params.aiResponse - AI's spoken response
 * @param {string} [params.userId] - Identifier for user (e.g. email or id)
 * @param {string} [params.intent] - Detected intent from queryRouter
 */
export async function extractMemoriesAsync({
  userPrompt = "",
  aiResponse = "",
  userId = "guest_user",
  intent = "GENERAL_KNOWLEDGE",
} = {}) {
  const q = (userPrompt || "").trim();
  const lower = q.toLowerCase();

  // 1. Skip if no API key or invalid input
  if (!GROQ_API_KEY || !q || q.length < 8) return;

  // 2. Cheap Deterministic Gating: Skip obvious chit-chat, simple acknowledgments, or generic searches
  if (intent === "CHIT_CHAT" || TRIVIAL_TURN_PATTERN.test(lower)) {
    return;
  }

  // 3. Skip if turn has zero first-person assertions or user preferences
  if (!MEMORY_WORTHY_INDICATORS.test(lower)) {
    return;
  }

  // 4. Background Groq invocation with strict 2500ms timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const systemPrompt =
      `You are an expert user memory extraction system for a voice assistant.\n` +
      `Your task: Identify if the user stated any permanent or durable personal facts, preferences, background, location, goals, or identity traits.\n` +
      `STRICT RULES:\n` +
      `1. Extract ONLY facts explicitly stated by the user about THEMSELVES (e.g. preferences, skills, hobbies, city of residence).\n` +
      `2. Do NOT extract temporary conversational status (e.g., 'user said hello', 'user asked about the weather').\n` +
      `3. Do NOT extract facts mentioned solely by the assistant.\n` +
      `4. PRIVACY & SECURITY GUARDRAIL: NEVER extract or persist passwords, API keys, credit cards, bank accounts, government IDs, phone numbers, or confidential credentials.\n` +
      `5. Output MUST be valid JSON only. Format:\n` +
      `   {"has_memories": boolean, "facts": ["clean statement 1", "clean statement 2"]}\n` +
      `6. Extract at most 2 facts. If no durable user facts exist or if text contains sensitive credentials, return {"has_memories": false, "facts": []}.`;

    const apiKey = process.env.GROQ_API_KEY || GROQ_API_KEY;
    if (!apiKey) {
      console.warn("⚠️ [GROQ WORKER] GROQ_API_KEY not configured, skipping.");
      return;
    }

    const userMessage = `User: "${q}"\nAssistant: "${(aiResponse || "").slice(0, 200)}"`;

    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 150,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      const errBody = await resp.text();
      console.warn(`⚠️ [GROQ WORKER] API call failed with status ${resp.status}:`, errBody);
      return;
    }

    const data = await resp.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) return;

    const parsed = JSON.parse(rawContent);

    if (parsed.has_memories && Array.isArray(parsed.facts) && parsed.facts.length > 0) {
      const validFacts = parsed.facts.slice(0, 2); // Max 2 per turn

      for (const fact of validFacts) {
        const cleanFact = typeof fact === "string" ? fact.trim() : "";
        if (cleanFact && cleanFact.length > 6 && !isDuplicate(userId, cleanFact)) {
          console.log(`🧠 [GROQ WORKER] Extracted durable memory for "${userId}": "${cleanFact}"`);
          // Save directly to Qdrant semantic cluster
          await memoryService.saveUserMemory(cleanFact, userId).catch((err) => {
            console.warn("⚠️ [GROQ WORKER] Could not persist memory to Qdrant:", err.message);
          });
        }
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      console.warn("⚠️ [GROQ WORKER] Memory extraction error:", err.message);
    }
  }
}

export default {
  extractMemoriesAsync,
};
