import SystemSetting from "../models/SystemSetting.js";
import { geminiKeyManager } from "./geminiKeyManager.js";

/**
 * Service to manage global system configurations with zero-latency in-memory cache
 */
class SystemSettingsService {
  constructor() {
    this.cache = {
      primaryModel: "gemini", // default to 'gemini' for superior reasoning & 3-key pool
      geminiModelName: "gemini-flash-latest",
      groqModelName: "qwen/qwen3.8-27b",
    };
    this.initialized = false;
    this.loadSettings();
  }

  async loadSettings() {
    try {
      const savedPrimary = await SystemSetting.getSetting("primary_llm_model", "gemini");
      if (savedPrimary && ["gemini", "groq"].includes(savedPrimary)) {
        this.cache.primaryModel = savedPrimary;
      }
      this.initialized = true;
      console.log(`⚙️ [SYSTEM SETTINGS] Primary LLM Engine active: "${this.cache.primaryModel.toUpperCase()}"`);
    } catch (err) {
      console.warn("⚠️ SystemSettings load warning:", err.message);
    }
  }

  getPrimaryModel() {
    return this.cache.primaryModel || "gemini";
  }

  async setPrimaryModel(model, userId = null) {
    if (!["gemini", "groq"].includes(model)) {
      throw new Error("Invalid model. Primary engine must be 'gemini' or 'groq'.");
    }

    this.cache.primaryModel = model;

    try {
      await SystemSetting.setSetting(
        "primary_llm_model",
        model,
        "Active primary LLM reasoning engine for voice and chat",
        userId
      );
      console.log(`✅ [SYSTEM SETTINGS] Primary LLM updated to: ${model.toUpperCase()}`);
    } catch (err) {
      console.warn("⚠️ SystemSetting persist warning:", err.message);
    }

    return this.getConfig();
  }

  getConfig() {
    const geminiKeys = geminiKeyManager.getKeys();
    return {
      primaryModel: this.getPrimaryModel(),
      geminiKeysCount: geminiKeys.length,
      groqAvailable: !!process.env.GROQ_API_KEY,
      models: {
        gemini: {
          name: "Google Gemini",
          defaultModel: "gemini-flash-latest",
          keysActive: geminiKeys.length,
          totalRpm: geminiKeys.length * 15,
          totalRpd: geminiKeys.length * 1500,
          strengths: "Deep reasoning, 1M context, superior Hindi/Hinglish fluency, flawless RAG & tool execution.",
        },
        groq: {
          name: "Groq Cloud LPU",
          defaultModel: "qwen/qwen3.8-27b",
          keysActive: process.env.GROQ_API_KEY ? 1 : 0,
          totalRpm: 30,
          totalRpd: 14400,
          strengths: "Ultra-low latency (~80ms first token), optimized for quick conversational chit-chat.",
        },
      },
    };
  }
}

export const systemSettingsService = new SystemSettingsService();
export default systemSettingsService;
