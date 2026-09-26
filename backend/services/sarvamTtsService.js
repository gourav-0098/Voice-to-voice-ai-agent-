/**
 * Sarvam AI Bulbul Text-to-Speech (TTS) Service
 * 
 * SOTA Text-to-Speech engine built specifically for Indian languages and code-mixed Hinglish.
 * Model: bulbul:v3
 * 
 * Supported Speakers:
 * - aditya (Male - Confident, energetic, authentic Hindi/Hinglish - Ideal for Saffron Debater)
 * - shubh (Male - Authoritative, clear)
 * - ashutosh (Male - Deep, powerful debate voice)
 * - priya (Female - Natural, conversational, warm)
 * - ritu (Female - Expressive, clear)
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const SARVAM_API_KEY = process.env.SARVAM_API_KEY || "sk_0gdrnoej_SAYp7VZIEvtfix20VrGu2YLt";
const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";

export const SARVAM_SPEAKERS = {
  aditya: { id: "sarvam-aditya", speaker: "aditya", gender: "Male", desc: "Sarvam Aditya (Energetic Hindi Male)" },
  shubh: { id: "sarvam-shubh", speaker: "shubh", gender: "Male", desc: "Sarvam Shubh (Authoritative Hindi Male)" },
  ashutosh: { id: "sarvam-ashutosh", speaker: "ashutosh", gender: "Male", desc: "Sarvam Ashutosh (Deep Hindi Male)" },
  priya: { id: "sarvam-priya", speaker: "priya", gender: "Female", desc: "Sarvam Priya (Warm Hindi Female)" },
  ritu: { id: "sarvam-ritu", speaker: "ritu", gender: "Female", desc: "Sarvam Ritu (Expressive Hindi Female)" },
};

export const DEFAULT_SARVAM_SPEAKER = "aditya";

/**
 * Clean spoken text of markdown artifacts, URLs, and code brackets.
 */
function cleanSpokenText(text) {
  if (!text) return "";
  return text
    .replace(/[*_#`~>]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks if the text contains Devanagari script or strong colloquial Hinglish markers.
 */
export function isHindiOrHinglish(text) {
  if (!text || typeof text !== "string") return false;

  // 1. Devanagari script
  if (/[\u0900-\u097F]/.test(text)) return true;

  // 2. Common Hinglish debate and conversational marker words
  const hinglishMarkers = /\b(arre|bhai|modi|namaste|kya|kyun|kyu|kaise|pehle|aaj|desh|sarkar|bharat|nahi|hum|aap|theek|karega|karenge|yeh|woh|raha|rahe|thi|tha|liye|hoga|chahiye|bolte|sunte|garv|tiranga|mandir|ration|ghotala|crore|lakh|khareeda|bachaya|janta|mumkin|saal|ghuskar)\b/i;
  return hinglishMarkers.test(text);
}

/**
 * Synthesize speech audio using Sarvam AI's Bulbul-v3 API
 * @param {string} text - The input text (Hindi, Hinglish, or Indian English)
 * @param {string} [speakerName] - Voice name (aditya, shubh, priya, ritu, ashutosh)
 * @param {string} [languageCode] - Language code (default 'hi-IN')
 * @returns {Promise<{audioBase64: string, format: string, model: string, latencyMs: number} | null>}
 */
export async function generateSarvamSpeech(text, speakerName = DEFAULT_SARVAM_SPEAKER, languageCode = "hi-IN") {
  const clean = cleanSpokenText(text);
  if (!clean) return null;

  const t0 = Date.now();
  // Strip 'sarvam-' prefix if present (e.g., 'sarvam-aditya' -> 'aditya')
  const rawSpeaker = speakerName.replace(/^sarvam-/, "").toLowerCase();
  const targetSpeaker = SARVAM_SPEAKERS[rawSpeaker] ? rawSpeaker : DEFAULT_SARVAM_SPEAKER;

  try {
    const response = await fetch(SARVAM_TTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": SARVAM_API_KEY,
      },
      body: JSON.stringify({
        text: clean.slice(0, 2400),
        model: "bulbul:v3",
        language_code: languageCode,
        speaker: targetSpeaker,
        pace: 1.0,
        speech_sample_rate: 24000,
        output_audio_codec: "mp3",
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.warn(`⚠️ [SARVAM TTS WARNING] (${response.status}):`, errBody);
      return null;
    }

    const data = await response.json();
    const audioBase64 = data.audios && data.audios[0];

    if (!audioBase64) {
      console.warn("⚠️ [SARVAM TTS WARNING] No audio data in response");
      return null;
    }

    const latencyMs = Date.now() - t0;
    console.log(`✨ [SARVAM TTS] Successfully generated audio via speaker '${targetSpeaker}' in ${latencyMs}ms (${audioBase64.length} chars)`);

    return {
      audioBase64,
      format: "audio/mp3",
      model: `sarvam-${targetSpeaker}`,
      latencyMs,
    };
  } catch (err) {
    console.error("❌ [SARVAM TTS ERROR]:", err.message || err);
    return null;
  }
}

export default {
  SARVAM_SPEAKERS,
  DEFAULT_SARVAM_SPEAKER,
  isHindiOrHinglish,
  generateSarvamSpeech,
};
