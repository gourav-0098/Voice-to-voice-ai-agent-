import { multiSearchEngine } from "../../providers/search/multiSearchEngine.js";
import { safeOutboundRequest, isUrlSafe } from "../../network/safeHttpClient.js";
import { extractCleanArticleText } from "./extractWebpageTool.js";
import { toolCache } from "../../caching/toolCache.js";

/**
 * Extract 1-3 compact passages from text that most strongly answer the user query
 */
function extractRelevantPassages(text, query, maxPassages = 2) {
  if (!text || !query) return [];

  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25 && s.length < 350);

  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

  const scoredSentences = sentences.map((sentence) => {
    let score = 0;
    const lower = sentence.toLowerCase();
    for (const term of queryTerms) {
      if (lower.includes(term)) score += 1;
    }
    return { sentence, score };
  });

  scoredSentences.sort((a, b) => b.score - a.score);

  return scoredSentences
    .filter((s) => s.score > 0)
    .slice(0, maxPassages)
    .map((s) => s.sentence);
}

export const searchAndReadTool = {
  name: "search_and_read",
  description: "Execute a multi-stage research pipeline: searches across providers, opens top authoritative pages, extracts key passages and verified evidence, and returns compact structured findings without boilerplate.",
  category: "research",
  risk: "medium",
  timeoutMs: 12000,
  cacheTtlMs: 300000, // 5 minutes
  retryPolicy: { maxRetries: 1, backoffMs: 500 },
  authPolicy: "public",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The research query (e.g. 'OpenAI GPT-5 announcement date and specs')",
      },
      maxResults: {
        type: "number",
        description: "Number of top pages to read and extract evidence from (default: 2, max: 4)",
      },
      recency: {
        type: "string",
        description: "Optional recency filter (e.g. 'day', 'week', 'month', 'year')",
      },
      domains: {
        type: "array",
        items: { type: "string" },
        description: "Optional preferred domains to filter or prioritize (e.g. ['reuters.com', 'pib.gov.in'])",
      },
    },
    required: ["query"],
  },

  async execute(args, context = {}) {
    const query = String(args.query || "").trim();
    if (!query) {
      return {
        ok: false,
        tool: "search_and_read",
        error: { code: "INVALID_ARGUMENT", message: "Query is required.", retryable: false },
      };
    }

    const pagesToRead = Math.min(Math.max(Number(args.maxResults) || 2, 1), 3);

    // Cache check
    const cacheKey = `${query}:${pagesToRead}`;
    const cached = toolCache.get("search_and_read", cacheKey);
    if (cached) {
      return {
        ok: true,
        tool: "search_and_read",
        data: cached,
        sources: cached.results || [],
        metadata: { cached: true, pagesRead: cached.results?.length || 0 },
      };
    }

    // 1. Search multiple providers & deduplicate URLs
    const searchHits = await multiSearchEngine.search(query, { maxResults: 6 });
    if (!searchHits || searchHits.length === 0) {
      return {
        ok: true,
        tool: "search_and_read",
        data: { query, results: [] },
        sources: [],
        metadata: { pagesRead: 0 },
      };
    }

    // 2. Select top authoritative pages to deep-read
    const targetHits = searchHits.slice(0, pagesToRead);

    // 3. Fetch pages in parallel with strict SSRF protection and extract passages
    const readTasks = targetHits.map(async (hit) => {
      try {
        const isSafe = await isUrlSafe(hit.url);
        if (!isSafe) {
          return {
            title: hit.title,
            url: hit.url,
            publisher: hit.publisher,
            publishedAt: hit.publishedAt,
            snippet: hit.snippet,
            relevantPassages: [hit.snippet].filter(Boolean),
            sourceType: hit.sourceType,
            credibilitySignals: { authorityTier: hit.sourceType, isHttps: hit.url.startsWith("https") },
          };
        }

        const res = await safeOutboundRequest(hit.url, { timeoutMs: 5000 });
        if (!res.ok) {
          return {
            title: hit.title,
            url: hit.url,
            publisher: hit.publisher,
            publishedAt: hit.publishedAt,
            snippet: hit.snippet,
            relevantPassages: [hit.snippet].filter(Boolean),
            sourceType: hit.sourceType,
            credibilitySignals: { authorityTier: hit.sourceType, isHttps: hit.url.startsWith("https") },
          };
        }

        const html = await res.text();
        const articleText = extractCleanArticleText(html);
        const passages = extractRelevantPassages(articleText, query, 2);

        return {
          title: hit.title,
          url: hit.url,
          publisher: hit.publisher,
          publishedAt: hit.publishedAt,
          snippet: hit.snippet,
          relevantPassages: passages.length > 0 ? passages : [hit.snippet].filter(Boolean),
          sourceType: hit.sourceType,
          credibilitySignals: {
            authorityTier: hit.sourceType,
            articleWordCount: articleText.split(/\s+/).length,
            isHttps: hit.url.startsWith("https"),
          },
        };
      } catch (err) {
        return {
          title: hit.title,
          url: hit.url,
          publisher: hit.publisher,
          publishedAt: hit.publishedAt,
          snippet: hit.snippet,
          relevantPassages: [hit.snippet].filter(Boolean),
          sourceType: hit.sourceType,
          credibilitySignals: { authorityTier: hit.sourceType, isHttps: hit.url.startsWith("https") },
        };
      }
    });

    const detailedResults = await Promise.all(readTasks);

    const payload = {
      query,
      results: detailedResults,
      retrievedAt: new Date().toISOString(),
    };

    toolCache.set("search_and_read", cacheKey, payload, 300);

    const rawResult = {
      ok: true,
      tool: "search_and_read",
      data: payload,
      sources: detailedResults.map((r) => ({
        title: r.title,
        url: r.url,
        publisher: r.publisher,
        publishedAt: r.publishedAt,
        evidence: r.relevantPassages[0] || r.snippet,
        sourceType: r.sourceType,
      })),
      metadata: { pagesRead: detailedResults.length },
    };
    rawResult.voiceSummary = searchAndReadTool.formatVoiceSummary(rawResult);
    return rawResult;
  },

  formatVoiceSummary(result) {
    if (!result.ok || !result.data?.results?.length) {
      return `I could not find detailed web articles answering "${result.data?.query || "your query"}".`;
    }

    const findings = result.data.results
      .map((r) => {
        const passage = r.relevantPassages[0] || r.snippet;
        return `According to ${r.publisher} ("${r.title}"): "${passage}"`;
      })
      .join("\n\n");

    return `Deep research findings for "${result.data.query}":\n\n${findings}`;
  },
};

export default searchAndReadTool;
