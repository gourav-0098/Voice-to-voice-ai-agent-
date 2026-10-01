import { BaseSearchProvider } from "./searchProvider.js";
import { safeOutboundRequest } from "../../network/safeHttpClient.js";

export class WikipediaProvider extends BaseSearchProvider {
  constructor() {
    super("wikipedia");
  }

  isAvailable() {
    return true;
  }

  async search(query, options = {}) {
    const { limit = 3, timeoutMs = 4000 } = options;
    const cleanQuery = String(query || "").trim();
    if (!cleanQuery) return [];

    const results = [];

    // 1. Wikipedia Summary REST API (Fastest exact or near-match)
    try {
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanQuery.replace(/\s+/g, "_"))}`;
      const res = await safeOutboundRequest(summaryUrl, { timeoutMs });
      if (res && res.ok) {
        const data = await res.json();
        if (data.extract && data.content_urls?.desktop?.page) {
          results.push({
            title: data.title || cleanQuery,
            url: data.content_urls.desktop.page,
            snippet: data.extract,
            publisher: "Wikipedia",
            sourceType: "ACADEMIC",
          });
        }
      }
    } catch (_) {}

    // 2. Wikipedia Opensearch API (Broad keyword search across encyclopedia)
    if (results.length < limit) {
      try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(cleanQuery)}&limit=${limit}&namespace=0&format=json`;
        const res = await safeOutboundRequest(searchUrl, { timeoutMs });
        if (res && res.ok) {
          const [searchQuery, titles, descriptions, urls] = await res.json();
          if (Array.isArray(titles) && Array.isArray(urls)) {
            for (let i = 0; i < titles.length; i++) {
              const url = urls[i];
              if (url && !results.some((r) => r.url === url)) {
                results.push({
                  title: titles[i],
                  url,
                  snippet: descriptions[i] || `Encyclopedia entry for ${titles[i]} on Wikipedia.`,
                  publisher: "Wikipedia",
                  sourceType: "ACADEMIC",
                });
              }
            }
          }
        }
      } catch (_) {}
    }

    return results.slice(0, limit);
  }
}

export const wikipediaProvider = new WikipediaProvider();
export default wikipediaProvider;
