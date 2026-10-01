import { duckDuckGoProvider } from "./duckDuckGoProvider.js";
import { wikipediaProvider } from "./wikipediaProvider.js";
import { newsProvider } from "./newsProvider.js";
import { isUrlSafe } from "../../network/safeHttpClient.js";

/**
 * Domain Quality & Authority Classifier
 * Maps domains to authority tiers (PRIMARY_SOURCE, ESTABLISHED_REPORTING, OFFICIAL, ACADEMIC, COMMENTARY, GENERAL_WEB)
 */
export function classifySourceType(url, publisher = "") {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    // 1. Official Government & International Agencies
    if (
      host.endsWith(".gov") ||
      host.endsWith(".gov.in") ||
      host.endsWith(".nic.in") ||
      host.endsWith(".mil") ||
      host.includes("who.int") ||
      host.includes("un.org") ||
      host.includes("worldbank.org") ||
      host.includes("imf.org") ||
      host.includes("rbi.org.in") ||
      host.includes("pib.gov.in") ||
      host.includes("isro.gov.in")
    ) {
      return "OFFICIAL";
    }

    // 2. Academic & Scientific Repositories
    if (
      host.endsWith(".edu") ||
      host.endsWith(".ac.in") ||
      host.includes("arxiv.org") ||
      host.includes("nature.com") ||
      host.includes("sciencedirect.com") ||
      host.includes("ieee.org") ||
      host.includes("springer.com") ||
      host.includes("wikipedia.org")
    ) {
      return "ACADEMIC";
    }

    // 3. Established Journalism & Wire Services
    if (
      host.includes("reuters.com") ||
      host.includes("apnews.com") ||
      host.includes("bbc.com") ||
      host.includes("thehindu.com") ||
      host.includes("indianexpress.com") ||
      host.includes("timesofindia") ||
      host.includes("hindustantimes.com") ||
      host.includes("livemint.com") ||
      host.includes("economictimes") ||
      host.includes("bloomberg.com") ||
      host.includes("aljazeera.com") ||
      host.includes("ndtv.com")
    ) {
      return "ESTABLISHED_REPORTING";
    }

    // 4. Primary Source Organizations
    if (
      host.includes("openai.com") ||
      host.includes("google.com") ||
      host.includes("microsoft.com") ||
      host.includes("github.com")
    ) {
      return "PRIMARY_SOURCE";
    }

    // 5. Commentary / Opinion / Forums
    if (
      host.includes("medium.com") ||
      host.includes("substack.com") ||
      host.includes("reddit.com") ||
      host.includes("quora.com") ||
      host.includes("twitter.com") ||
      host.includes("x.com")
    ) {
      return "COMMENTARY";
    }

    return "GENERAL_WEB";
  } catch (_) {
    return "GENERAL_WEB";
  }
}

/**
 * Clean and canonicalize URLs (strips tracking, UTM parameters, and fragment anchors)
 */
export function normalizeUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    // Strip common tracking query parameters
    const paramsToDrop = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "fbclid", "gclid", "ref", "source", "ref_src",
    ];
    for (const p of paramsToDrop) {
      parsed.searchParams.delete(p);
    }
    parsed.hash = ""; // Drop URL anchor fragments
    return parsed.toString();
  } catch (_) {
    return rawUrl;
  }
}

/**
 * Multi-Stage Research & Search Engine
 */
export class MultiSearchEngine {
  constructor() {
    this.providers = [
      duckDuckGoProvider,
      wikipediaProvider,
      newsProvider,
    ];
  }

  /**
   * Expand raw query into complementary research angles
   * @param {string} query
   * @returns {string[]}
   */
  expandQuery(query) {
    const q = query.trim();
    const expansions = [q];

    // If query has recency intent ("latest", "today", "news"), create a clean entity query
    if (/\b(today|latest|breaking|recent|news|update)\b/i.test(q)) {
      const stripped = q.replace(/\b(today|latest|breaking|recent|news|update|tell me about|what is the)\b/gi, "").trim();
      if (stripped.length > 3 && !expansions.includes(stripped)) {
        expansions.push(stripped);
      }
    }

    return expansions.slice(0, 2);
  }

  /**
   * Execute multi-stage search with parallel provider execution,
   * URL deduplication, SSRF gating, and relevance scoring.
   * 
   * @param {string} query
   * @param {Object} [options]
   * @param {number} [options.maxResults=6]
   * @param {boolean} [options.isNews=false]
   * @param {number} [options.timeoutMs=5000]
   * @returns {Promise<Array<Object>>}
   */
  async search(query, options = {}) {
    const { maxResults = 6, isNews = false, timeoutMs = 5000 } = options;
    const cleanQuery = String(query || "").trim();
    if (!cleanQuery) return [];

    const queries = this.expandQuery(cleanQuery);
    const searchTasks = [];

    // Prioritize news provider if user requested news
    if (isNews) {
      searchTasks.push(newsProvider.search(cleanQuery, { limit: maxResults, timeoutMs }));
      searchTasks.push(duckDuckGoProvider.search(`${cleanQuery} news`, { limit: 3, timeoutMs }));
    } else {
      for (const q of queries) {
        searchTasks.push(duckDuckGoProvider.search(q, { limit: 4, timeoutMs }));
        searchTasks.push(wikipediaProvider.search(q, { limit: 2, timeoutMs }));
      }
      searchTasks.push(newsProvider.search(cleanQuery, { limit: 2, timeoutMs }));
    }

    const taskResults = await Promise.allSettled(searchTasks);
    const rawCandidates = [];

    for (const r of taskResults) {
      if (r.status === "fulfilled" && Array.isArray(r.value)) {
        rawCandidates.push(...r.value);
      }
    }

    // Deduplicate URLs and validate security
    const seenUrls = new Set();
    const validatedResults = [];

    for (const item of rawCandidates) {
      if (!item || !item.url || typeof item.url !== "string") continue;
      const canonical = normalizeUrl(item.url);
      if (seenUrls.has(canonical)) continue;

      // Ensure valid public http/https scheme
      if (!canonical.startsWith("http://") && !canonical.startsWith("https://")) continue;

      seenUrls.add(canonical);
      const sourceType = item.sourceType || classifySourceType(canonical, item.publisher);

      validatedResults.push({
        title: item.title || cleanQuery,
        url: canonical,
        snippet: item.snippet || "",
        publisher: item.publisher || "Web",
        publishedAt: item.publishedAt || null,
        sourceType,
      });
    }

    // Rank results based on query term overlap, authority tier, and presence of snippet
    const queryTokens = cleanQuery.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

    const scored = validatedResults.map((item) => {
      let score = 0;
      const textToSearch = `${item.title} ${item.snippet} ${item.publisher}`.toLowerCase();

      // Token overlap score
      for (const token of queryTokens) {
        if (textToSearch.includes(token)) score += 1.5;
      }

      // Source tier weighting
      if (item.sourceType === "OFFICIAL") score += 2.0;
      else if (item.sourceType === "PRIMARY_SOURCE") score += 1.8;
      else if (item.sourceType === "ESTABLISHED_REPORTING") score += 1.5;
      else if (item.sourceType === "ACADEMIC") score += 1.3;

      if (item.publishedAt) score += 0.5; // Recency bonus

      return { ...item, score: Number(score.toFixed(2)) };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults);
  }
}

export const multiSearchEngine = new MultiSearchEngine();
multiSearchEngine.normalizeUrl = normalizeUrl;
multiSearchEngine.classifySourceType = classifySourceType;
export default multiSearchEngine;
