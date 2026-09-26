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

// Simple transliteration helper for Devanagari Hindi characters to Latin phonetics
function transliterateDevanagariToLatin(text) {
  if (!/[\u0900-\u097F]/.test(text)) return text;

  const wordMap = {
    "नमस्ते": "Namaste",
    "धन्यवाद": "Dhanyawaad",
    "हाँ": "Haan",
    "नहीं": "Nahi",
    "आप": "Aap",
    "कैसे": "kaise",
    "हैं": "hain",
    "क्या": "kya",
    "मदद": "madad",
    "कर": "kar",
    "सकता": "sakta",
    "सकती": "sakti",
    "हूँ": "hoon",
    "मैं": "Main",
    "ठीक": "theek",
    "बहुत": "bahut",
    "अच्छा": "achha",
    "बताइए": "bataiye",
  };

  let result = text;
  for (const [hindi, latin] of Object.entries(wordMap)) {
    result = result.split(hindi).join(latin);
  }

  const charMap = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo",
    "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "क": "k", "ख": "kh",
    "ग": "g", "घ": "gh", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "त": "t", "थ": "th",
    "द": "d", "ध": "dh", "न": "n", "प": "p", "फ": "f", "ब": "b",
    "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v",
    "श": "sh", "ष": "sh", "स": "s", "ह": "h", "ा": "a", "ि": "i",
    "ी": "ee", "ु": "u", "ू": "oo", "े": "e", "ै": "ai", "ो": "o",
    "ौ": "au", "ं": "n", "्": "", "।": "."
  };

  for (const [hindi, latin] of Object.entries(charMap)) {
    result = result.split(hindi).join(latin);
  }

  return result.replace(/[\u0900-\u097F]/g, "").trim();
}

import { generateSarvamSpeech, isHindiOrHinglish as isHindiOrHinglishSarvam } from "./sarvamTtsService.js";
import { generateEdgeSpeech, isHindiOrHinglish as isHindiOrHinglishEdge } from "./edgeTtsService.js";

/**
 * Generate speech audio from text using Sarvam AI Bulbul (for SOTA Hindi/Hinglish),
 * Edge-TTS (as free fallback), or Deepgram TTS (for English).
 * @param {string} text - Text to synthesize into speech
 * @param {string} [voiceModel] - Voice model name (e.g., sarvam-aditya, hi-IN-MadhurNeural, flux-alexis-en)
 * @returns {Promise<{audioBase64: string, format: string, model: string, modelUuid: string} | null>}
 */
export async function generateSpeech(text, voiceModel = MODEL_NAME) {
  if (!text || typeof text !== "string" || !text.trim()) {
    return null;
  }

  const targetModel = (voiceModel && typeof voiceModel === "string") ? voiceModel.trim() : MODEL_NAME;

  const isSarvamVoice = targetModel.startsWith("sarvam-") || ["aditya", "shubh", "priya", "ritu", "ashutosh"].includes(targetModel);
  const isEdgeVoice = targetModel.startsWith("hi-IN-") || targetModel.startsWith("en-IN-");
  const isHindi = isHindiOrHinglishSarvam(text) || isHindiOrHinglishEdge(text);

  // 1. Primary Hindi/Hinglish Engine: Sarvam AI Bulbul (SOTA natural Indian inflection)
  if (isSarvamVoice || (isHindi && (targetModel === MODEL_NAME || targetModel === "sarvam-aditya"))) {
    const speaker = isSarvamVoice ? targetModel.replace(/^sarvam-/, "") : "aditya";
    console.log(`🎙️ [TTS ROUTER] Routing to Sarvam AI Bulbul-v3 (speaker: '${speaker}') for: "${text.slice(0, 40)}..."`);
    const sarvamAudio = await generateSarvamSpeech(text, speaker, "hi-IN");
    if (sarvamAudio && sarvamAudio.audioBase64) {
      return {
        audioBase64: sarvamAudio.audioBase64,
        format: "audio/mp3",
        model: `sarvam-${speaker}`,
        modelUuid: "sarvam-bulbul-v3",
      };
    }
    console.warn("⚠️ [TTS ROUTER] Sarvam failed or timed out, trying Edge-TTS fallback...");
  }

  // 2. Secondary Hindi fallback: Microsoft Edge Neural Hindi
  if (isEdgeVoice || isHindi) {
    const selectedEdgeVoice = isEdgeVoice ? targetModel : "hi-IN-MadhurNeural";
    console.log(`🎙️ [TTS ROUTER] Routing to Microsoft Edge Neural Hindi (${selectedEdgeVoice}) for: "${text.slice(0, 40)}..."`);
    const edgeAudio = await generateEdgeSpeech(text, selectedEdgeVoice);
    if (edgeAudio && edgeAudio.audioBase64) {
      return {
        audioBase64: edgeAudio.audioBase64,
        format: edgeAudio.format || "audio/mp3",
        model: selectedEdgeVoice,
        modelUuid: "edge-neural-hi",
      };
    }
  }

  let cleanText = text.replace(/[*_#`~]/g, "").trim();
  cleanText = transliterateDevanagariToLatin(cleanText);
  if (!cleanText) return null;

  const endpointVersion = targetModel.startsWith("aura-") ? "v1" : "v2";

  try {
    const url = `https://api.deepgram.com/${endpointVersion}/speak?model=${encodeURIComponent(targetModel)}&encoding=linear16&sample_rate=24000`;

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
