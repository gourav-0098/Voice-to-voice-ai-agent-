import { QdrantClient } from "@qdrant/js-client-rest";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const qdrantUrl =
  process.env.QDRANT_URL ||
  process.env.cluster_endpoint ||
  "https://a2528ffa-9391-47df-ae3c-e4a0ad004f76.eu-central-1-0.aws.cloud.qdrant.io";

const qdrantApiKey =
  process.env.QDRANT_API_KEY ||
  process.env.Qdrant_api;

const geminiApiKey = process.env.GEMINI_API_KEY;

let qdrantClient = null;
let aiClient = null;

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

try {
  if (geminiApiKey) {
    aiClient = new GoogleGenAI({ apiKey: geminiApiKey });
  }
} catch (err) {
  console.warn("⚠️ Gemini embedding client warning:", err.message);
}

/**
 * Generate 3072-dimensional vector embedding using Gemini
 */
export async function getEmbedding(text) {
  if (!aiClient || !text || !text.trim()) return null;

  try {
    const res = await aiClient.models.embedContent({
      model: "gemini-embedding-001",
      contents: text.trim(),
    });

    const values = res.embeddings?.[0]?.values || res.embedding?.values;
    return values || null;
  } catch (err) {
    console.warn("⚠️ Embedding generation error:", err.message);
    return null;
  }
}

/**
 * Search Qdrant 'first_cluster' for relevant context and memories
 * Only called for Admin (r19216871@gamil.com)
 */
export async function searchAdminKnowledge(queryText, limit = 2) {
  if (!qdrantClient || !queryText) return [];

  try {
    const vector = await getEmbedding(queryText);
    if (!vector) return [];

    const res = await qdrantClient.query("first_cluster", {
      query: vector,
      limit,
      with_payload: true,
    });

    if (!res || !res.points || res.points.length === 0) return [];

    const contextSnippets = [];
    for (const point of res.points) {
      // Score threshold to ensure high relevance
      if (point.score && point.score >= 0.65) {
        const text =
          point.payload?.page_content ||
          point.payload?.data ||
          point.payload?.text;

        if (text && typeof text === "string") {
          // Truncate snippet to 300 chars for concise spoken context
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
 * Save new memory into Qdrant 'first_cluster'
 */
export async function saveAdminMemory(text, userId = "r19216871@gamil.com") {
  if (!qdrantClient || !text || text.length < 5) return false;

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
            user_id: userId,
            page_content: text.trim(),
            created_at: new Date().toISOString(),
            source: "voice_conversation",
          },
        },
      ],
    });

    return true;
  } catch (err) {
    console.warn("⚠️ Qdrant save memory warning:", err.message);
    return false;
  }
}

export default {
  getEmbedding,
  searchAdminKnowledge,
  saveAdminMemory,
};
