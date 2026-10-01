import { BaseSearchProvider } from "./searchProvider.js";
import { safeOutboundRequest } from "../../network/safeHttpClient.js";

export class DuckDuckGoProvider extends BaseSearchProvider {
  constructor() {
    super("duckduckgo");
  }

  isAvailable() {
    return true;
  }

  async search(query, options = {}) {
    const { limit = 5, timeoutMs = 4000 } = options;
    const cleanQuery = String(query || "").trim();
    if (!cleanQuery) return [];

    const results = [];

    // 1. DuckDuckGo Instant Answer API
    try {
      const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1&skip_disambig=1`;
      const res = await safeOutboundRequest(apiUrl, { timeoutMs });
      if (res && res.ok) {
        const data = await res.json();
        if (data.AbstractText && data.AbstractURL) {
          results.push({
            title: data.Heading || cleanQuery,
            url: data.AbstractURL,
            snippet: data.AbstractText,
            publisher: data.AbstractSource || "DuckDuckGo",
            sourceType: "GENERAL_WEB",
          });
        }

        if (Array.isArray(data.RelatedTopics)) {
          for (const item of data.RelatedTopics) {
            if (item.Text && item.FirstURL && results.length < limit) {
              results.push({
                title: item.Text.slice(0, 80),
                url: item.FirstURL,
                snippet: item.Text,
                publisher: "DuckDuckGo Topic",
                sourceType: "GENERAL_WEB",
              });
            }
          }
        }
      }
    } catch (_) {}

    if (results.length >= limit) {
      return results.slice(0, limit);
    }

    // 2. DuckDuckGo HTML Lite Web Search Fallback
    try {
      const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;
      const res = await safeOutboundRequest(htmlUrl, {
        timeoutMs,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
      });

      if (res && res.ok) {
        const html = await res.text();

        // Extract result blocks
        const linkRegex = /<a\s+class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        const snippetRegex = /<a\s+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
        const titleRegex = /<a\s+class="result__title"[^>]*>([\s\S]*?)<\/a>/gi;

        const links = [];
        let match;
        while ((match = linkRegex.exec(html)) !== null && links.length < limit) {
          let rawHref = match[1];
          // DuckDuckGo redirects through //duckduckgo.com/l/?uddg=URL
          if (rawHref.includes("uddg=")) {
            const uddg = rawHref.split("uddg=")[1]?.split("&")[0];
            if (uddg) rawHref = decodeURIComponent(uddg);
          }
          if (rawHref.startsWith("http")) {
            links.push(rawHref);
          }
        }

        const titles = [];
        while ((match = titleRegex.exec(html)) !== null && titles.length < links.length) {
          titles.push(match[1].replace(/<[^>]+>/g, "").trim());
        }

        const snippets = [];
        while ((match = snippetRegex.exec(html)) !== null && snippets.length < links.length) {
          snippets.push(match[1].replace(/<[^>]+>/g, "").trim());
        }

        for (let i = 0; i < links.length; i++) {
          const url = links[i];
          if (!results.some((r) => r.url === url)) {
            let publisher = "Web";
            try {
              publisher = new URL(url).hostname.replace(/^www\./, "");
            } catch (_) {}

            results.push({
              title: titles[i] || cleanQuery,
              url,
              snippet: snippets[i] || "Relevant web result.",
              publisher,
              sourceType: "GENERAL_WEB",
            });
          }
        }
      }
    } catch (_) {}

    return results.slice(0, limit);
  }
}

export const duckDuckGoProvider = new DuckDuckGoProvider();
export default duckDuckGoProvider;
