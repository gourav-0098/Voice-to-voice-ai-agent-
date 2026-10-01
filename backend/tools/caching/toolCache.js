/**
 * Production-Grade Scoped In-Memory LRU Cache for External Tool Invocations
 * Strictly caches public stateless data (search, public web pages, weather, rates).
 * NEVER caches user-specific private history or tenant memory.
 */

class ScopedToolCache {
  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
    this.cache = new Map(); // key -> { data, expiresAt }
  }

  /**
   * Build a standardized namespaced cache key
   * @param {string} namespace - e.g., 'search', 'weather', 'scrape', 'currency'
   * @param {string} rawKey - Query string, location, or URL
   * @returns {string}
   */
  buildKey(namespace, rawKey) {
    const cleanKey = String(rawKey || "").trim().toLowerCase().slice(0, 300);
    return `${namespace}:${cleanKey}`;
  }

  /**
   * Retrieve cached result if unexpired
   * @param {string} namespace
   * @param {string} rawKey
   * @returns {any|null}
   */
  get(namespace, rawKey) {
    const key = this.buildKey(namespace, rawKey);
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Refresh LRU order
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }

  /**
   * Set cache entry with TTL
   * @param {string} namespace
   * @param {string} rawKey
   * @param {any} data
   * @param {number} [ttlSeconds=300]
   */
  set(namespace, rawKey, data, ttlSeconds = 300) {
    if (!data) return;
    const key = this.buildKey(namespace, rawKey);

    // Evict oldest if full
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000,
    });
  }

  /**
   * Invalidate specific key or namespace
   * @param {string} [namespace]
   */
  clear(namespace = null) {
    if (!namespace) {
      this.cache.clear();
      return;
    }
    const prefix = `${namespace}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  size() {
    return this.cache.size;
  }
}

export const toolCache = new ScopedToolCache();
export default toolCache;
