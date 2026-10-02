import { multiSearchEngine } from "../../providers/search/multiSearchEngine.js";
import { toolCache } from "../../caching/toolCache.js";

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
      return {
        ok: false,
        tool: "web_search",
        error: { code: "INVALID_ARGUMENT", message: "Search query cannot be empty.", retryable: false },
      };
    }

    const maxResults = Math.min(Math.max(Number(args.maxResults) || 5, 1), 8);

    // Cache check
    const cached = toolCache.get("search", query);
    if (cached) {
      const state = cached.results?.length >= 3 ? "SEARCH_SUCCESS" : cached.results?.length > 0 ? "SEARCH_PARTIAL" : "SEARCH_EMPTY";
      if (state === "SEARCH_EMPTY") {
        return {
          ok: false,
          tool: "web_search",
          state: "SEARCH_EMPTY",
          error: { code: "SEARCH_EMPTY", message: `No recent web search results found for query: "${query}"` },
          data: cached,
          sources: [],
          metadata: { cached: true, resultCount: 0, state: "SEARCH_EMPTY" },
        };
      }
      return {
        ok: true,
        tool: "web_search",
        state,
        data: cached,
        sources: cached.results || [],
        metadata: { cached: true, resultCount: cached.results?.length || 0, state },
      };
    }

    let results = [];
    let state = "SEARCH_EMPTY";
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
      return {
        ok: false,
        tool: "web_search",
        state: "SEARCH_ERROR",
        error: { code: "SEARCH_ERROR", message: `Search engine failure: ${err.message}` },
        sources: [],
        metadata: { state: "SEARCH_ERROR", error: err.message },
      };
    }

    if (!results || results.length === 0) {
      const emptyPayload = {
        query,
        results: [],
        retrievedAt: new Date().toISOString(),
      };
      toolCache.set("search", query, emptyPayload, 60);

      // Explicit SEARCH_EMPTY contract: An empty result must NEVER be considered successful
      return {
        ok: false,
        tool: "web_search",
        state: "SEARCH_EMPTY",
        error: { code: "SEARCH_EMPTY", message: `No recent web search results found for query: "${query}"` },
        data: emptyPayload,
        sources: [],
        metadata: { cached: false, resultCount: 0, state: "SEARCH_EMPTY" },
      };
    }

    state = results.length >= 3 ? "SEARCH_SUCCESS" : "SEARCH_PARTIAL";
    const payload = {
      query: activeQuery,
      originalQuery: query,
      results,
      retrievedAt: new Date().toISOString(),
    };

    toolCache.set("search", query, payload, 300);

    return {
      ok: true,
      tool: "web_search",
      state,
      data: payload,
      sources: results,
      metadata: { cached: false, resultCount: results.length, state },
    };
  },

  formatVoiceSummary(result) {
    if (!result.ok || result.state === "SEARCH_EMPTY" || !result.data?.results?.length) {
      return `[SEARCH_EMPTY] No verified web search results were found for "${result.data?.query || "the inquiry"}".`;
    }

    const items = result.data.results.slice(0, 5);
    const summaryLines = items.map((item, i) => `${i + 1}. ${item.title}: ${item.snippet} (${item.publisher}, ${item.sourceType || "Web"})`);
    return `Verified web search evidence for "${result.data.query}":\n${summaryLines.join("\n")}`;
  },
};

export default webSearchTool;
