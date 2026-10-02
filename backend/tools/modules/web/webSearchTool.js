import { multiSearchEngine } from "../../providers/search/multiSearchEngine.js";
import { toolCache } from "../../caching/toolCache.js";

/**
 * Standardized search result normalizer (Bug 3)
 * Maps any raw response (null, {}, empty array, or unusable items) into strict states:
 * - SEARCH_SUCCESS (>= 3 usable sources)
 * - SEARCH_PARTIAL (1-2 usable sources)
 * - SEARCH_EMPTY (0 usable sources)
 * - SEARCH_ERROR (network or parsing failure)
 */
export function normalizeSearchResult(rawResult, query = "") {
  if (!rawResult || typeof rawResult !== "object" || Object.keys(rawResult).length === 0) {
    return {
      ok: false,
      tool: "web_search",
      state: "SEARCH_EMPTY",
      data: { query, results: [] },
      sources: [],
      voiceSummary: `[SEARCH_EMPTY] Search returned no usable evidence for "${query}".`,
      metadata: { resultCount: 0, state: "SEARCH_EMPTY" },
    };
  }

  if (rawResult.state === "SEARCH_ERROR") {
    return {
      ok: false,
      tool: "web_search",
      state: "SEARCH_ERROR",
      data: { query, results: [] },
      sources: [],
      error: rawResult.error || { code: "SEARCH_ERROR", message: "Search error occurred." },
      voiceSummary: `Search error occurred for "${query}".`,
      metadata: { resultCount: 0, state: "SEARCH_ERROR" },
    };
  }

  const results = Array.isArray(rawResult.sources)
    ? rawResult.sources
    : Array.isArray(rawResult.data?.results)
    ? rawResult.data.results
    : Array.isArray(rawResult.results)
    ? rawResult.results
    : [];

  const usableResults = results.filter(
    (r) => r && (r.snippet || r.evidence || r.title) && r.url
  );

  if (usableResults.length === 0) {
    return {
      ok: false,
      tool: "web_search",
      state: "SEARCH_EMPTY",
      data: { query, results: [] },
      sources: [],
      error: { code: "SEARCH_EMPTY", message: `Search returned no usable evidence for "${query}".` },
      voiceSummary: `[SEARCH_EMPTY] Search returned no usable evidence for "${query}".`,
      metadata: { resultCount: 0, state: "SEARCH_EMPTY" },
    };
  }

  const state = usableResults.length >= 3 ? "SEARCH_SUCCESS" : "SEARCH_PARTIAL";
  return {
    ok: true,
    tool: "web_search",
    state,
    data: { query, results: usableResults },
    sources: usableResults,
    voiceSummary: webSearchTool.formatVoiceSummary({ ok: true, state, data: { query, results: usableResults } }),
    metadata: { resultCount: usableResults.length, state },
  };
}

export const webSearchTool = {
  name: "web_search",
  description: "Search the live web across multiple search providers for current events, facts, official updates, and real-time knowledge.",
  category: "research",
  risk: "low",
  timeoutMs: 6000,
  cacheTtlMs: 300000, // 5 minutes
  retryPolicy: { maxRetries: 1, backoffMs: 500 },
  authPolicy: "public",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query (e.g. 'latest ISRO missions', 'cricket score today')",
      },
      maxResults: {
        type: "number",
        description: "Maximum number of search results to return (default: 5)",
      },
    },
    required: ["query"],
  },

  async execute(args, context = {}) {
    const query = String(args.query || "").trim();
    if (!query) {
      return normalizeSearchResult({}, "");
    }

    const maxResults = Math.min(Math.max(Number(args.maxResults) || 5, 1), 8);

    // Cache check
    const cached = toolCache.get("search", query);
    if (cached) {
      return normalizeSearchResult({ ok: true, data: cached, sources: cached.results || [] }, query);
    }

    let results = [];
    let activeQuery = query;

    try {
      results = await multiSearchEngine.search(query, { maxResults });

      // Search Quality Gate: If first search is empty, attempt immediate query rewrite & fallback recovery
      if (!results || results.length === 0) {
        const rewritten = query
          .replace(/[?"'.,!]/g, "")
          .replace(/^(what are the|what is the|who is the|tell me about|find|list of|best|current)\s+/i, "")
          .replace(/\b(in \d{4}|\d{4})\b/g, "")
          .trim();

        if (rewritten && rewritten.toLowerCase() !== query.toLowerCase() && rewritten.length > 2) {
          const retryResults = await multiSearchEngine.search(rewritten, { maxResults });
          if (retryResults && retryResults.length > 0) {
            results = retryResults;
            activeQuery = rewritten;
          }
        }
      }
    } catch (err) {
      return normalizeSearchResult({ state: "SEARCH_ERROR", error: { code: "SEARCH_ERROR", message: err.message } }, query);
    }

    if (!results || results.length === 0) {
      const emptyPayload = {
        query,
        results: [],
        retrievedAt: new Date().toISOString(),
      };
      toolCache.set("search", query, emptyPayload, 60);
      return normalizeSearchResult({}, query);
    }

    const payload = {
      query: activeQuery,
      originalQuery: query,
      results,
      retrievedAt: new Date().toISOString(),
    };

    toolCache.set("search", query, payload, 300);

    return normalizeSearchResult({ ok: true, data: payload, sources: results }, query);
  },

  formatVoiceSummary(result) {
    if (!result || !result.ok || result.state === "SEARCH_EMPTY" || !result.data?.results?.length) {
      return `[SEARCH_EMPTY] Search returned no usable evidence for "${result?.data?.query || "the inquiry"}".`;
    }

    const items = result.data.results.slice(0, 5);
    const summaryLines = items.map((item, i) => `${i + 1}. ${item.title}: ${item.snippet} (${item.publisher}, ${item.sourceType || "Web"})`);
    return `Verified web search evidence for "${result.data.query}":\n${summaryLines.join("\n")}`;
  },
};

export default webSearchTool;
