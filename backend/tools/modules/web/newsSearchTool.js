import { multiSearchEngine } from "../../providers/search/multiSearchEngine.js";
import { toolCache } from "../../caching/toolCache.js";

export const newsSearchTool = {
  name: "news_search",
  description: "Search live breaking news, press releases, and journalistic reporting with publication dates and sources.",
  category: "research",
  risk: "low",
  timeoutMs: 6000,
  cacheTtlMs: 180000, // 3 minutes for fresh news
  retryPolicy: { maxRetries: 1, backoffMs: 500 },
  authPolicy: "public",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The news topic or headline to search (e.g. 'budget announcement', 'assembly election results')",
      },
      maxResults: {
        type: "number",
        description: "Maximum number of news articles to retrieve (default: 4)",
      },
    },
    required: ["query"],
  },

  async execute(args, context = {}) {
    const query = String(args.query || "").trim();
    if (!query) {
      return {
        ok: false,
        tool: "news_search",
        error: { code: "INVALID_ARGUMENT", message: "News query cannot be empty.", retryable: false },
      };
    }

    const maxResults = Math.min(Math.max(Number(args.maxResults) || 4, 1), 6);

    const cached = toolCache.get("news", query);
    if (cached) {
      return {
        ok: true,
        tool: "news_search",
        data: cached,
        sources: cached.articles || [],
        metadata: { cached: true, resultCount: cached.articles?.length || 0 },
      };
    }

    const results = await multiSearchEngine.search(query, { maxResults, isNews: true });

    const payload = {
      query,
      articles: results,
      retrievedAt: new Date().toISOString(),
    };

    toolCache.set("news", query, payload, 180);

    return {
      ok: true,
      tool: "news_search",
      data: payload,
      sources: results,
      metadata: { cached: false, resultCount: results.length },
    };
  },

  formatVoiceSummary(result) {
    if (!result.ok || !result.data?.articles?.length) {
      return `No recent news articles were found regarding "${result.data?.query || "your query"}".`;
    }

    const articles = result.data.articles.slice(0, 3);
    const summary = articles
      .map((a, i) => `${i + 1}. ${a.title} (reported by ${a.publisher}${a.publishedAt ? " on " + a.publishedAt.slice(0, 16) : ""})`)
      .join("\n");

    return `Recent news reporting on "${result.data.query}":\n${summary}`;
  },
};

export default newsSearchTool;
