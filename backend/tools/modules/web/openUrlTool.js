import { safeOutboundRequest, isUrlSafe } from "../../network/safeHttpClient.js";

export const openUrlTool = {
  name: "open_url",
  description: "Check, inspect, and verify an external URL's HTTP status, page title, and server headers safely.",
  category: "web",
  risk: "medium",
  timeoutMs: 5000,
  cacheTtlMs: 600000,
  retryPolicy: { maxRetries: 1, backoffMs: 500 },
  authPolicy: "public",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The HTTP/HTTPS URL to open and inspect",
      },
    },
    required: ["url"],
  },

  async execute(args, context = {}) {
    const rawUrl = String(args.url || "").trim();
    if (!rawUrl) {
      return {
        ok: false,
        tool: "open_url",
        error: { code: "INVALID_ARGUMENT", message: "URL is required.", retryable: false },
      };
    }

    const isSafe = await isUrlSafe(rawUrl);
    if (!isSafe) {
      return {
        ok: false,
        tool: "open_url",
        error: { code: "SSRF_BLOCKED", message: `URL "${rawUrl}" blocked by safety policy.`, retryable: false },
      };
    }

    try {
      const res = await safeOutboundRequest(rawUrl, { timeoutMs: 5000 });
      const contentType = res.headers.get("content-type") || "unknown";
      const contentLength = res.headers.get("content-length") || null;

      let title = "Web Document";
      if (contentType.includes("html")) {
        const text = await res.text();
        const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch) {
          title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
        }
      }

      const data = {
        url: rawUrl,
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
        title,
        contentType,
        contentLength,
      };

      return {
        ok: true,
        tool: "open_url",
        data,
        sources: [{ title, url: rawUrl, publisher: new URL(rawUrl).hostname }],
        metadata: { status: res.status },
      };
    } catch (err) {
      return {
        ok: false,
        tool: "open_url",
        error: { code: "NETWORK_ERROR", message: err.message, retryable: true },
      };
    }
  },

  formatVoiceSummary(result) {
    if (!result.ok) {
      return `Could not open the requested URL: ${result.error?.message || "connection error"}.`;
    }
    return `Opened "${result.data.title}" at ${result.data.url}. Server responded with status ${result.data.status} (${result.data.contentType}).`;
  },
};

export default openUrlTool;
