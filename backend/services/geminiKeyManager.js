import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

/**
 * Intelligent Multi-Key Manager for Google Gemini API
 * Automatically detects GEMINI_API_KEY, GEMINI_API_KEY2, GEMINI_API_KEY3, ...
 * Provides Round-Robin load distribution and instant 429 quota failover.
 */

class GeminiKeyManager {
  constructor() {
    this.keyPool = [];
    this.clientCache = new Map();
    this.keyStatus = new Map(); // key -> { rateLimitedUntil: timestamp, failureCount: number }
    this.currentIndex = 0;
    this.refreshKeys();
  }

  /**
   * Scan process.env for all GEMINI_API_KEY variants
   */
  refreshKeys() {
    const detected = [];
    
    // Primary key
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
      detected.push(process.env.GEMINI_API_KEY.trim());
    }

    // Numbered keys (e.g., GEMINI_API_KEY2, GEMINI_API_KEY3, ... GEMINI_API_KEY10)
    for (let i = 2; i <= 20; i++) {
      const val = process.env[`GEMINI_API_KEY${i}`] || process.env[`GEMINI_API_KEY_${i}`];
      if (val && val.trim() && !detected.includes(val.trim())) {
        detected.push(val.trim());
      }
    }

    this.keyPool = detected;
    console.log(`🔑 [GEMINI KEY POOL] Loaded ${this.keyPool.length} active Gemini API key(s) for load balancing & failover`);
  }

  /**
   * Get all active keys
   */
  getKeys() {
    if (this.keyPool.length === 0) {
      this.refreshKeys();
    }
    return this.keyPool;
  }

  /**
   * Pick next eligible key (Round-Robin with cooldown awareness)
   */
  getNextKey() {
    const keys = this.getKeys();
    if (keys.length === 0) return null;
    if (keys.length === 1) return keys[0];

    const now = Date.now();

    // Find next key that is not in 429 rate-limit cooldown
    for (let attempts = 0; attempts < keys.length; attempts++) {
      const candidate = keys[this.currentIndex % keys.length];
      this.currentIndex = (this.currentIndex + 1) % keys.length;

      const status = this.keyStatus.get(candidate);
      if (!status || status.rateLimitedUntil <= now) {
        return candidate;
      }
    }

    // If all keys are currently cooling down, return the one with the earliest expiry
    let bestKey = keys[0];
    let earliestCooldown = Infinity;
    for (const k of keys) {
      const s = this.keyStatus.get(k);
      const expiry = s?.rateLimitedUntil || 0;
      if (expiry < earliestCooldown) {
        earliestCooldown = expiry;
        bestKey = k;
      }
    }
    return bestKey;
  }

  /**
   * Mark a key as rate-limited (429) for a cooldown duration
   */
  markRateLimited(apiKey, cooldownSeconds = 60) {
    if (!apiKey) return;
    const masked = apiKey.slice(0, 6) + "..." + apiKey.slice(-4);
    const until = Date.now() + cooldownSeconds * 1000;
    const current = this.keyStatus.get(apiKey) || { failureCount: 0 };
    this.keyStatus.set(apiKey, {
      rateLimitedUntil: until,
      failureCount: current.failureCount + 1,
    });
    console.warn(`⏳ [GEMINI RATE-LIMIT] Key (${masked}) rate-limited (429). Cooled down for ${cooldownSeconds}s. Other keys will take traffic.`);
  }

  /**
   * Get or create a GoogleGenAI SDK client instance for a key
   */
  getClient(apiKey) {
    const key = apiKey || this.getNextKey();
    if (!key) return null;

    if (!this.clientCache.has(key)) {
      try {
        const client = new GoogleGenAI({ apiKey: key });
        this.clientCache.set(key, client);
      } catch (err) {
        console.warn("⚠️ Failed to initialize GoogleGenAI client:", err.message);
        return null;
      }
    }
    return {
      client: this.clientCache.get(key),
      apiKey: key,
    };
  }

  /**
   * Execute an operation with automatic multi-key failover
   */
  async executeWithFailover(operationFn) {
    const keys = this.getKeys();
    if (keys.length === 0) {
      throw new Error("No Gemini API keys available in environment.");
    }

    // Try keys in sequence starting from next round-robin key
    const startingIndex = this.currentIndex;
    let lastError = null;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[(startingIndex + i) % keys.length];
      const masked = key.slice(0, 6) + "..." + key.slice(-4);
      const status = this.keyStatus.get(key);

      // Skip keys cooling down unless it's our last remaining option
      if (status && status.rateLimitedUntil > Date.now() && keys.length > 1 && i < keys.length - 1) {
        continue;
      }

      try {
        const { client } = this.getClient(key);
        if (!client) continue;

        const result = await operationFn(client, key);
        this.currentIndex = (startingIndex + i + 1) % keys.length;
        return result;
      } catch (err) {
        lastError = err;
        const msg = String(err?.message || "");
        const isRateLimit = msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota");

        if (isRateLimit) {
          this.markRateLimited(key, 60);
          console.warn(`🔄 [GEMINI FAILOVER] Key (${masked}) hit quota limit. Automatically switching to next available key...`);
        } else {
          console.warn(`⚠️ [GEMINI KEY ERROR] Key (${masked}) error:`, msg);
        }
      }
    }

    throw lastError || new Error("All Gemini API keys failed.");
  }
}

export const geminiKeyManager = new GeminiKeyManager();
export default geminiKeyManager;
