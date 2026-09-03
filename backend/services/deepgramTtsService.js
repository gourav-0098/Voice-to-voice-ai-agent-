import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const DEEPGRAM_API_KEY =
  process.env.DEEPGRAM_API_KEY ||
  "910e2755e332885f111ed17c514acb5ba03e81ab";

const MODEL_NAME = "flux-alexis-en";
const MODEL_UUID = "36f312ab-d06a-4c1c-9071-ba18bebb29e9";

/**
 * Generate speech audio from text using Deepgram's Flux TTS (Alexis)
 * @param {string} text - Text to synthesize into speech
 * @returns {Promise<{audioBase64: string, format: string, model: string, modelUuid: string} | null>}
 */
export async function generateSpeech(text) {
  if (!text || typeof text !== "string" || !text.trim()) {
    return null;
  }

  const cleanText = text.replace(/[*_#`~]/g, "").trim();
  if (!cleanText) return null;

  try {
    const url = `https://api.deepgram.com/v2/speak?model=${MODEL_NAME}&encoding=linear16&sample_rate=24000`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: cleanText }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`⚠️ Deepgram TTS error (${response.status}):`, errText);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString("base64");

    const dgModelName = response.headers.get("dg-model-name") || "alexis";
    const dgModelUuid = response.headers.get("dg-model-uuid") || MODEL_UUID;
    const dgRequestId = response.headers.get("dg-request-id") || "";

    return {
      audioBase64,
      format: "audio/wav",
      model: dgModelName,
      modelUuid: dgModelUuid,
      requestId: dgRequestId,
    };
  } catch (error) {
    console.error("Deepgram TTS network failure:", error.message || error);
    return null;
  }
}

export default {
  generateSpeech,
  MODEL_NAME,
  MODEL_UUID,
};
