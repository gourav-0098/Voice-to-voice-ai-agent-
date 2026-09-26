/**
 * Microsoft Edge Neural Text-to-Speech (Edge-TTS) Service
 * 
 * Provides 100% Free, zero-API-key, ultra-natural neural speech synthesis
 * specifically optimized for Hindi (hi-IN) and Indian English (en-IN).
 * 
 * Supported Voices:
 * - hi-IN-MadhurNeural (Male - Bold, authoritative, perfect for Saffron Debater)
 * - hi-IN-SwaraNeural (Female - Expressive, clear, warm)
 * - en-IN-PrabhatNeural (Indian English Male)
 * - en-IN-NeerjaNeural (Indian English Female)
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export const EDGE_VOICES = {
  "hi-IN-MadhurNeural": { id: "hi-IN-MadhurNeural", name: "Madhur", lang: "hi-IN", gender: "Male" },
  "hi-IN-SwaraNeural": { id: "hi-IN-SwaraNeural", name: "Swara", lang: "hi-IN", gender: "Female" },
  "en-IN-PrabhatNeural": { id: "en-IN-PrabhatNeural", name: "Prabhat", lang: "en-IN", gender: "Male" },
  "en-IN-NeerjaNeural": { id: "en-IN-NeerjaNeural", name: "Neerja", lang: "en-IN", gender: "Female" },
};

export const DEFAULT_HINDI_VOICE = "hi-IN-MadhurNeural";

/**
 * Checks if the text contains Devanagari script or strong Hinglish keywords.
 */
export function isHindiOrHinglish(text) {
  if (!text || typeof text !== "string") return false;

  // 1. Check for native Devanagari characters
  if (/[\u0900-\u097F]/.test(text)) return true;

  // 2. Check for common colloquial Hinglish markers
  const hinglishMarkers = /\b(arre|bhai|modi|namaste|kya|kyun|kyu|kaise|pehle|aaj|desh|sarkar|bharat|nahi|hum|aap|theek|karega|karenge|yeh|woh|raha|rahe|thi|tha|liye|hoga|chahiye|bolte|sunte|garv|tiranga|mandir|ration|ghotala|crore|lakh|khareeda|bachaya|janta)\b/i;
  return hinglishMarkers.test(text);
}

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
 * Synthesize speech audio using Microsoft Edge Neural TTS.
 * @param {string} text - The input text (Hindi, Hinglish, or English)
 * @param {string} [voiceName] - Voice name, defaults to 'hi-IN-MadhurNeural'
 * @returns {Promise<{audioBase64: string, format: string, voice: string, latencyMs: number} | null>}
 */
export async function generateEdgeSpeech(text, voiceName = DEFAULT_HINDI_VOICE) {
  const clean = cleanSpokenText(text);
  if (!clean) return null;

  const t0 = Date.now();
  const targetVoice = EDGE_VOICES[voiceName] ? voiceName : DEFAULT_HINDI_VOICE;

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(targetVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const { audioStream } = tts.toStream(clean);
    const chunks = [];

    for await (const chunk of audioStream) {
      chunks.push(chunk);
    }

    tts.close();

    if (chunks.length === 0) return null;

    const buffer = Buffer.concat(chunks);
    const latencyMs = Date.now() - t0;

    return {
      audioBase64: buffer.toString("base64"),
      format: "audio/mp3",
      voice: targetVoice,
      latencyMs,
    };
  } catch (err) {
    console.error(`❌ [EDGE-TTS ERROR] Failed to synthesize with ${targetVoice}:`, err.message);
    return null;
  }
}

export default {
  EDGE_VOICES,
  DEFAULT_HINDI_VOICE,
  isHindiOrHinglish,
  generateEdgeSpeech,
};
