/**
 * Chatly Voice AI - Server-Side Speech-to-Text (STT) Service
 * 
 * Blazing fast, ultra-accurate transcription for Hindi, Hinglish, and Indian English.
 * Primary Engine: Groq Whisper-large-v3-turbo (< 200ms latency)
 * Secondary Engine: Deepgram Nova-2 (< 150ms latency)
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

/**
 * Transcribe an audio Buffer using Groq Whisper (Primary) or Deepgram Nova-2 (Backup)
 * @param {Buffer} audioBuffer - Binary audio data (webm, wav, mp3, ogg, etc.)
 * @param {string} mimeType - e.g. "audio/webm", "audio/wav"
 * @param {string} language - "hi", "en", or "all"
 * @returns {Promise<{text: string, provider: string, latencyMs: number}>}
 */
export async function transcribeAudio(audioBuffer, mimeType = "audio/webm", language = "hi", options = {}) {
  const tStart = performance.now();
  const { forceGroq = false } = options;

  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error("Empty audio buffer provided for transcription");
  }

  // 1. Try Groq Whisper Large v3 Turbo (Primary)
  if (GROQ_API_KEY) {
    try {
      const ext = mimeType.includes("wav") ? "wav" : mimeType.includes("ogg") ? "ogg" : "webm";
      const blob = new Blob([audioBuffer], { type: mimeType });
      const formData = new FormData();
      formData.append("file", blob, `input.${ext}`);
      formData.append("model", "whisper-large-v3-turbo");
      formData.append("response_format", "json");
      if (language && language !== "all") {
        formData.append("language", language);
      }

      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const text = (data.text || "").trim();
        const latencyMs = Math.round(performance.now() - tStart);
        console.log(`🎙️ [STT GROQ WHISPER] Transcribed "${text.slice(0, 50)}..." in ${latencyMs}ms`);
        return {
          text,
          provider: "groq_whisper_turbo",
          latencyMs,
        };
      } else {
        const errText = await res.text();
        console.warn(`⚠️ [STT GROQ WARNING] Status ${res.status}:`, errText);
      }
    } catch (groqErr) {
      console.warn("⚠️ [STT GROQ ERROR] Falling back to Deepgram:", groqErr.message);
    }
  }

  // If strictly restricted to Groq API (Free Tier), do not invoke Deepgram
  if (forceGroq) {
    throw new Error("Groq Whisper transcription failed or timed out.");
  }

  // 2. Try Deepgram Nova-2 (Backup Engine)
  if (DEEPGRAM_API_KEY) {
    try {
      const langParam = language === "en" ? "en-IN" : "hi";
      const url = `https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=${langParam}`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
          "Content-Type": mimeType || "audio/webm",
        },
        body: audioBuffer,
      });

      if (res.ok) {
        const data = await res.json();
        const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
        const latencyMs = Math.round(performance.now() - tStart);
        console.log(`🎙️ [STT DEEPGRAM NOVA-2] Transcribed "${transcript.slice(0, 50)}..." in ${latencyMs}ms`);
        return {
          text: transcript.trim(),
          provider: "deepgram_nova2",
          latencyMs,
        };
      } else {
        const errText = await res.text();
        console.warn(`⚠️ [STT DEEPGRAM WARNING] Status ${res.status}:`, errText);
      }
    } catch (deepgramErr) {
      console.error("❌ [STT DEEPGRAM ERROR]:", deepgramErr.message);
    }
  }

  throw new Error("All speech-to-text providers failed or are unconfigured.");
}

export default {
  transcribeAudio,
};
