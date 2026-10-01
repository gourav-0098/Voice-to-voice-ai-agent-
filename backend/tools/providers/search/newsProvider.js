import { BaseSearchProvider } from "./searchProvider.js";
import { safeOutboundRequest } from "../../network/safeHttpClient.js";

export class NewsProvider extends BaseSearchProvider {
  constructor() {
    super("news_rss");
  }

  isAvailable() {
    return true;
  }

  async search(query, options = {}) {
    const { limit = 4, timeoutMs = 4000 } = options;
    const cleanQuery = String(query || "").trim();
    if (!cleanQuery) return [];

    const results = [];

    // Google News RSS Search (Free, open XML feed with timestamps and sources)
    try {
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(cleanQuery)}&hl=en-IN&gl=IN&ceid=IN:en`;
      const res = await safeOutboundRequest(rssUrl, { timeoutMs });

      if (res && res.ok) {
        const xml = await res.text();
        const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
        let itemMatch;

        while ((itemMatch = itemRegex.exec(xml)) !== null && results.length < limit) {
          const itemContent = itemMatch[1];

          const titleMatch = itemContent.match(/<title>([\s\S]*?)<\/title>/i);
          const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/i);
          const pubDateMatch = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
          const sourceMatch = itemContent.match(/<source[^>]*>([\s\S]*?)<\/source>/i);

          let title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : cleanQuery;
          let link = linkMatch ? linkMatch[1].trim() : "";
          let pubDate = pubDateMatch ? pubDateMatch[1].trim() : new Date().toISOString();
          let publisher = sourceMatch ? sourceMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "News Publisher";

          // If title includes "- Publisher", separate them
          if (title.includes(" - ")) {
            const parts = title.split(" - ");
            title = parts.slice(0, -1).join(" - ").trim();
            if (!publisher || publisher === "News Publisher") {
              publisher = parts[parts.length - 1].trim();
            }
          }

          if (link && link.startsWith("http")) {
            results.push({
              title,
              url: link,
              snippet: `Recent reporting on ${cleanQuery} by ${publisher} (${pubDate}).`,
              publisher,
              publishedAt: pubDate,
              sourceType: "ESTABLISHED_REPORTING",
            });
          }
        }
      }
    } catch (_) {}

    return results.slice(0, limit);
  }
}

export const newsProvider = new NewsProvider();
export default newsProvider;
