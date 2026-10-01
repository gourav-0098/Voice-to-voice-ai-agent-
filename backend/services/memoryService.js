import { QdrantClient } from "@qdrant/js-client-rest";
import { GoogleGenAI } from "@google/genai";
import { geminiKeyManager } from "./geminiKeyManager.js";
import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const qdrantUrl = process.env.QDRANT_URL;
if (!qdrantUrl) console.warn('[memoryService] QDRANT_URL not set');

const qdrantApiKey = process.env.QDRANT_API_KEY || process.env.Qdrant_api;
if (!qdrantApiKey) console.warn('[memoryService] QDRANT_API_KEY not set');

let qdrantClient = null;

try {
  if (qdrantUrl && qdrantApiKey) {
    qdrantClient = new QdrantClient({
      url: qdrantUrl,
      apiKey: qdrantApiKey,
      checkCompatibility: false,
    });
  }
} catch (err) {
  console.warn("⚠️ Qdrant client initialization warning:", err.message);
}

/**
 * Generate 3072-dimensional vector embedding using Gemini
 */
export async function getEmbedding(text) {
  if (!text || !text.trim()) return null;

  try {
    return await geminiKeyManager.executeWithFailover(async (client) => {
      const res = await client.models.embedContent({
        model: "gemini-embedding-001",
        contents: text.trim(),
      });

      const values = res.embeddings?.[0]?.values || res.embedding?.values;
      return values || null;
    });
  } catch (err) {
    console.warn("⚠️ Embedding generation error across keys:", err.message);
    return null;
  }
}

/**
 * Search Qdrant 'first_cluster' for relevant user context and memories
 * Supports per-user memory isolation and shared knowledge
 */
export async function searchUserMemory(queryText, userId = null, limit = 2) {
  if (!qdrantClient || !queryText) return [];

  // Reject unauthenticated or guest memory retrieval to prevent cross-tenant exposure
  if (!userId || String(userId).trim() === "" || userId === "guest_user" || String(userId).startsWith("guest_")) {
    return [];
  }

  try {
    const vector = await getEmbedding(queryText);
    if (!vector) return [];

    const queryOptions = {
      query: vector,
      limit,
      with_payload: true,
      filter: {
        must: [
          {
            key: "user_id",
            match: { value: String(userId) },
          },
        ],
      },
    };

    const res = await qdrantClient.query("first_cluster", queryOptions);

    if (!res || !res.points || res.points.length === 0) return [];

    const contextSnippets = [];
    for (const point of res.points) {
      if (point.score && point.score >= 0.62) {
        const text =
          point.payload?.page_content ||
          point.payload?.data ||
          point.payload?.text;

        if (text && typeof text === "string") {
          contextSnippets.push(text.trim().substring(0, 300));
        }
      }
    }

    return contextSnippets;
  } catch (err) {
    console.warn("⚠️ Qdrant search warning:", err.message);
    return [];
  }
}

/**
 * Save new memory into Qdrant 'first_cluster' for any authenticated user
 */
export async function saveUserMemory(text, userId = null) {
  if (!qdrantClient || !text || text.length < 5) return false;
  if (!userId || String(userId).trim() === "" || userId === "guest_user" || String(userId).startsWith("guest_")) {
    return false; // Do not persist unauthenticated or guest memories
  }

  try {
    const vector = await getEmbedding(text);
    if (!vector) return false;

    const pointId = crypto.randomUUID();
    await qdrantClient.upsert("first_cluster", {
      points: [
        {
          id: pointId,
          vector,
          payload: {
            user_id: String(userId),
            page_content: text.trim(),
            created_at: new Date().toISOString(),
            source: "voice_conversation",
          },
        },
      ],
    });

    console.log(`🧠 [QDRANT MEMORY] Saved memory for user: "${userId}" (${text.slice(0, 60)}...)`);
    return true;
  } catch (err) {
    console.warn("⚠️ Qdrant save memory warning:", err.message);
    return false;
  }
}

export const searchAdminKnowledge = searchUserMemory;
export const saveAdminMemory = saveUserMemory;

export default {
  getEmbedding,
  searchUserMemory,
  saveUserMemory,
  searchAdminKnowledge,
  saveAdminMemory,
};
