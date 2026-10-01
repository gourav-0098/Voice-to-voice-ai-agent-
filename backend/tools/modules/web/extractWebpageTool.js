import { safeOutboundRequest, isUrlSafe } from "../../network/safeHttpClient.js";
import { toolCache } from "../../caching/toolCache.js";

/**
 * Robust HTML sanitizer that preserves article structure while stripping noise
 */
export function extractCleanArticleText(html) {
  if (!html || typeof html !== "string") return "";

  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<(div|p|h1|h2|h3|h4|h5|h6|li|tr|article|section)[^>]*>/gi, "\n")
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

export const extractWebpageTool = {
  name: "extract_webpage",
  description: "Extract the core readable article text and facts from a webpage URL without ads, menus, or boilerplate.",
  category: "web",
  risk: "medium",
  timeoutMs: 7000,
  cacheTtlMs: 600000,
  retryPolicy: { maxRetries: 1, backoffMs: 500 },
  authPolicy: "public",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The webpage URL to read and extract text from",
      },
      maxLength: {
        type: "number",
        description: "Maximum character length of content to extract (default: 2000)",
      },
    },
    required: ["url"],
  },

  async execute(args, context = {}) {
    const rawUrl = String(args.url || "").trim();
    if (!rawUrl) {
      return {
        ok: false,
        tool: "extract_webpage",
        error: { code: "INVALID_ARGUMENT", message: "URL is required.", retryable: false },
      };
    }

    const isSafe = await isUrlSafe(rawUrl);
    if (!isSafe) {
      return {
        ok: false,
        tool: "extract_webpage",
        error: { code: "SSRF_BLOCKED", message: `URL "${rawUrl}" blocked by safety policy.`, retryable: false },
      };
    }

    const cached = toolCache.get("scrape", rawUrl);
    if (cached) {
      return {
        ok: true,
        tool: "extract_webpage",
        data: cached,
        sources: [{ title: cached.title, url: rawUrl, publisher: cached.publisher }],
        metadata: { cached: true },
      };
    }

    const maxLength = Math.min(Math.max(Number(args.maxLength) || 2000, 500), 4000);

    try {
      const res = await safeOutboundRequest(rawUrl, { timeoutMs: 6000 });
      if (!res.ok) {
        return {
          ok: false,
          tool: "extract_webpage",
          error: { code: "HTTP_ERROR", message: `Server returned HTTP ${res.status}.`, retryable: false },
        };
      }

      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Article Document";

      let publisher = "Web";
      try {
        publisher = new URL(rawUrl).hostname.replace(/^www\./, "");
      } catch (_) {}

      const cleanText = extractCleanArticleText(html);
      if (!cleanText || cleanText.length < 40) {
        return {
          ok: false,
          tool: "extract_webpage",
          error: { code: "NO_CONTENT", message: "No readable article text found on page.", retryable: false },
        };
      }

      const content = cleanText.slice(0, maxLength);
      const isTruncated = cleanText.length > maxLength;

      const data = {
        title,
        url: rawUrl,
        publisher,
        content: isTruncated ? `${content}\n...[content condensed]` : content,
        text: isTruncated ? `${content}\n...[content condensed]` : content,
        charCount: content.length,
        isTruncated,
      };

      toolCache.set("scrape", rawUrl, data, 600);

      const rawResult = {
        ok: true,
        tool: "extract_webpage",
        data,
        sources: [{ title, url: rawUrl, publisher }],
        metadata: { cached: false, charCount: content.length },
      };
      rawResult.voiceSummary = extractWebpageTool.formatVoiceSummary(rawResult);
      return rawResult;
    } catch (err) {
      return {
        ok: false,
        tool: "extract_webpage",
        error: { code: "EXTRACTION_FAILED", message: err.message, retryable: true },
      };
    }
  },

  formatVoiceSummary(result) {
    if (!result.ok) {
      return `Failed to read article: ${result.error?.message || "could not extract text"}.`;
    }
    return `Extracted from "${result.data.title}" (${result.data.publisher}):\n${result.data.content.slice(0, 400)}...`;
  },
};

export default extractWebpageTool;
