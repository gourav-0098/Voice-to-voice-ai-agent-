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
      return {
        ok: true,
        tool: "web_search",
        data: cached,
        sources: cached.results || [],
        metadata: { cached: true, resultCount: cached.results?.length || 0 },
      };
    }

    const results = await multiSearchEngine.search(query, { maxResults });

    const payload = {
      query,
      results,
      retrievedAt: new Date().toISOString(),
    };

    toolCache.set("search", query, payload, 300);

    return {
      ok: true,
      tool: "web_search",
      data: payload,
      sources: results,
      metadata: { cached: false, resultCount: results.length },
    };
  },

  formatVoiceSummary(result) {
    if (!result.ok || !result.data?.results?.length) {
      return `No recent web search results were found for "${result.data?.query || "your query"}".`;
    }

    const items = result.data.results.slice(0, 3);
    const summaryLines = items.map((item, i) => `${i + 1}. ${item.title}: ${item.snippet} (${item.publisher})`);
    return `Web search findings for "${result.data.query}":\n${summaryLines.join("\n")}`;
  },
};

export default webSearchTool;
