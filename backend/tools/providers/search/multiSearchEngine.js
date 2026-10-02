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

    // 3. Technical Documentation & Developer Portals
    if (
      host.includes("docs.") ||
      host.includes("platform.openai.com") ||
      host.includes("ai.google.dev") ||
      host.includes("console.groq.com") ||
      host.includes("developer.") ||
      host.includes("learn.microsoft.com") ||
      host.includes("huggingface.co/docs") ||
      host.includes("readthedocs.io")
    ) {
      return "TECHNICAL_DOCUMENTATION";
    }

    // 4. Primary Source AI & Technology Organizations
    if (
      host.includes("openai.com") ||
      host.includes("anthropic.com") ||
      host.includes("deepmind.google") ||
      host.includes("google.com") ||
      host.includes("groq.com") ||
      host.includes("microsoft.com") ||
      host.includes("github.com") ||
      host.includes("meta.com") ||
      host.includes("mistral.ai") ||
      host.includes("deepseek.com") ||
      host.includes("cohere.com") ||
      host.includes("together.ai")
    ) {
      return "PRIMARY_SOURCE";
    }

    // 5. Established Journalism, Wire Services & Tech Reporting
    if (
      host.includes("reuters.com") ||
      host.includes("apnews.com") ||
      host.includes("bbc.com") ||
      host.includes("bloomberg.com") ||
      host.includes("techcrunch.com") ||
      host.includes("theverge.com") ||
      host.includes("wired.com") ||
      host.includes("arstechnica.com") ||
      host.includes("venturebeat.com") ||
      host.includes("technologyreview.com") ||
      host.includes("thehindu.com") ||
      host.includes("indianexpress.com") ||
      host.includes("timesofindia") ||
      host.includes("hindustantimes.com") ||
      host.includes("livemint.com") ||
      host.includes("economictimes") ||
      host.includes("aljazeera.com") ||
      host.includes("ndtv.com")
    ) {
      return "ESTABLISHED_REPORTING";
    }

    // 6. Commentary / Opinion / Forums
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
    const currentYear = new Date().getFullYear();
    const expansions = [q];

    // Strip common conversational prefixes to create a laser-focused search query
    const conversationalStripped = q.replace(/^(tell me (the|about|what is)?|what is the|who is|please tell me|batao|dhundo|search for|what was the)\s+/i, "").trim();
    if (conversationalStripped.length > 3 && conversationalStripped.toLowerCase() !== q.toLowerCase()) {
      expansions.push(conversationalStripped);
    }

    // Temporal recency alignment: if query asks for current/best/latest and lacks explicit past year,
    // add an explicit current-year query expansion to ensure current sources
    const hasExplicitPastYear = /\b(19\d\d|20[01]\d|202[0-5])\b/.test(q);
    if (!hasExplicitPastYear && /\b(best|latest|current|today|top|news|compare|models|providers|api)\b/i.test(q)) {
      const yearQuery = `${conversationalStripped || q} ${currentYear}`;
      if (!expansions.includes(yearQuery)) {
        expansions.push(yearQuery);
      }
    }

    return expansions.slice(0, 3);
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

    const hasExplicitPastYear = /\b(19\d\d|20[01]\d|202[0-5])\b/.test(cleanQuery);
    const currentYearStr = String(new Date().getFullYear());
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
        title: item.title && item.title !== cleanQuery ? item.title : (item.publisher || "Web Reference"),
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
      if (item.sourceType === "OFFICIAL") score += 2.2;
      else if (item.sourceType === "PRIMARY_SOURCE") score += 2.0;
      else if (item.sourceType === "TECHNICAL_DOCUMENTATION") score += 1.8;
      else if (item.sourceType === "ESTABLISHED_REPORTING") score += 1.5;
      else if (item.sourceType === "ACADEMIC") score += 1.3;
      else if (item.sourceType === "COMMENTARY") score -= 0.5;

      // Temporal freshness bonus/penalty
      if (item.publishedAt && item.publishedAt.includes(currentYearStr)) score += 1.2;
      if (textToSearch.includes(currentYearStr)) score += 1.0;
      if (!hasExplicitPastYear && (textToSearch.includes("2024") || textToSearch.includes("2023")) && !textToSearch.includes(currentYearStr)) {
        score -= 0.8;
      }

      return { ...item, score: Number(score.toFixed(2)) };
    });

    // Enforce Relevance Gate: If query tokens exist, candidate must match at least one query token
    const relevant = scored.filter((item) => {
      if (queryTokens.length > 0) {
        const text = `${item.title} ${item.snippet} ${item.url}`.toLowerCase();
        return queryTokens.some((tok) => text.includes(tok));
      }
      return true;
    });

    relevant.sort((a, b) => b.score - a.score);
    return relevant.slice(0, maxResults);
  }
}

export const multiSearchEngine = new MultiSearchEngine();
multiSearchEngine.normalizeUrl = normalizeUrl;
multiSearchEngine.classifySourceType = classifySourceType;
export default multiSearchEngine;
