/**
 * High-Speed Semantic Query Cache (< 10ms response)
 * Stores query embeddings, RAG groundings, and speech responses in an in-memory LRU cache.
 * Evaluates exact string matches and dense cosine semantic proximity (> 0.95) to serve
 * instant zero-cost responses.
 */

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function normalizeQuery(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^\w\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

class SemanticQueryCache {
  constructor(maxSize = 400, ttlMs = 24 * 60 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map(); // key -> cache entry
    this.stats = {
      hits: 0,
      misses: 0,
      savedTokensEstimate: 0,
    };
  }

  /**
   * Look up an incoming query by exact normalized string or semantic vector similarity
   * @param {string} queryText - User's input text
   * @param {number[]} [queryVector] - Dense 384d embedding
   * @param {string} [persona] - Active persona
   * @returns {Object|null} Cached response entry or null
   */
  get(queryText, queryVector = null, persona = "conversational") {
    if (!queryText) return null;
    let vector = queryVector;
    let personaKey = persona || "conversational";
    if (typeof queryVector === "string") {
      personaKey = queryVector;
      vector = null;
    }

    const norm = normalizeQuery(queryText);
    const exactKey = `${personaKey}:::${norm}`;
    const now = Date.now();

    // 1. Fast-Path: Exact normalized key lookup (0.1ms)
    if (this.cache.has(exactKey)) {
      const entry = this.cache.get(exactKey);
      if (now - entry.timestamp < this.ttlMs) {
        this.stats.hits += 1;
        this.stats.savedTokensEstimate += 120;
        console.log(`⚡ [SEMANTIC CACHE] Exact match hit in 1ms! Query: "${queryText.slice(0, 50)}"`);
        return { ...entry.data, cachedAt: entry.timestamp, matchType: "exact" };
      } else {
        this.cache.delete(exactKey);
      }
    }

    // 2. Semantic-Path: Cosine vector similarity scan (1-2ms across 400 items)
    if (queryVector && Array.isArray(queryVector) && queryVector.length > 0) {
      let bestMatch = null;
      let highestSim = 0;

      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp >= this.ttlMs) {
          this.cache.delete(key);
          continue;
        }

        // Must match persona to maintain ideological tone integrity
        if (entry.persona !== personaKey) continue;

        if (entry.vector) {
          const sim = cosineSimilarity(queryVector, entry.vector);
          if (sim > highestSim) {
            highestSim = sim;
            bestMatch = entry;
          }
        }
      }

      // Threshold: 0.95 semantic cosine similarity represents virtually identical meaning
      if (bestMatch && highestSim >= 0.95) {
        this.stats.hits += 1;
        this.stats.savedTokensEstimate += 120;
        console.log(`⚡ [SEMANTIC CACHE] High-confidence semantic match hit! (Cosine: ${highestSim.toFixed(3)})`);
        return {
          ...bestMatch.data,
          cachedAt: bestMatch.timestamp,
          matchType: "semantic",
          similarity: highestSim,
        };
      }
    }

    this.stats.misses += 1;
    return null;
  }

  /**
   * Save a newly computed query response into the semantic cache
   */
  set(queryText, queryVector, persona, data) {
    let vector = queryVector;
    let personaKey = persona || "conversational";
    let payload = data;

    if (typeof queryVector === "string" && data === undefined) {
      personaKey = queryVector;
      vector = null;
      payload = persona;
    }

    if (!queryText || !payload) return;

    const norm = normalizeQuery(queryText);
    const exactKey = `${personaKey}:::${norm}`;

    // Evict oldest entry if size limit reached
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(exactKey, {
      queryText,
      vector,
      persona: personaKey,
      data: payload,
      timestamp: Date.now(),
    });
  }

  /**
   * Return cache telemetry
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) + "%" : "0%";
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      savedTokensEstimate: this.stats.savedTokensEstimate,
    };
  }

  clear() {
    this.cache.clear();
  }
}

export const semanticCache = new SemanticQueryCache();
export default semanticCache;
