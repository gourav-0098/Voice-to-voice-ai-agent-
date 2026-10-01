/**
 * Fast Deterministic Tool Router (< 2ms)
 * Classifies obvious user intents (math, time, weather, currency, URL extraction, deep research)
 * before calling LLMs to save tokens and achieve sub-100ms response times.
 */

export class ToolRouter {
  /**
   * Evaluate a user query and determine if it can be directly routed to a tool
   * @param {string} queryText
   * @returns {{ shouldRoute: boolean, directExecution: boolean, toolName: string|null, args: Object }}
   */
  route(queryText) {
    if (!queryText || typeof queryText !== "string") {
      return { shouldRoute: false, directExecution: false, toolName: null, args: {} };
    }

    const q = queryText.trim();
    const lower = q.toLowerCase();

    // 1. Explicit Arithmetic or Percentage: "2+2", "18% of 4500", "what is 45 * 12 + 10"
    if (
      /^(?:what is |calculate |evaluate )?[\d.\s+\-*/()^%x]+$/i.test(q) ||
      /\b\d+\s*%\s*of\s*\d+\b/i.test(lower) ||
      /^(?:how much is )?[\d.]+\s*(?:km|miles|kg|lbs|celsius|fahrenheit)\s*(?:to|in)\s*(?:km|miles|kg|lbs|celsius|fahrenheit)$/i.test(lower)
    ) {
      const expr = q.replace(/^(?:what is |calculate |evaluate |compute |how much is )/i, "").trim();
      return {
        shouldRoute: true,
        directExecution: true,
        toolName: "calculate_expression",
        args: { expression: expr },
      };
    }

    // 2. Current Time / Date: "what time is it", "current date", "time in London"
    if (
      /\b(what time is it|current time|current date|aaj kitni tarikh|aaj kya din|exact time|time now|kya time hua)\b/i.test(lower)
    ) {
      let locFormatted = "";
      const locMatch = lower.match(/\b(?:in|for|at)\s+([a-zA-Z\s]+)/i);
      if (locMatch) {
        const cleanedLoc = locMatch[1]
          .replace(/\b(right now|now|today|please|\?)\b/gi, "")
          .trim();
        if (cleanedLoc) {
          locFormatted = cleanedLoc.charAt(0).toUpperCase() + cleanedLoc.slice(1);
        }
      }
      return {
        shouldRoute: true,
        directExecution: true,
        toolName: "get_current_time",
        args: { location: locFormatted },
      };
    }

    // 3. Currency Conversion: "100 usd to inr", "convert 50 dollars to rupees"
    const currencyMatch = lower.match(/(?:convert\s+)?([\d.]+)\s*([a-zA-Z$€£¥]+)\s*(?:to|in|into)\s*([a-zA-Z$€£¥]+)/i);
    if (currencyMatch) {
      const amount = parseFloat(currencyMatch[1]);
      const from = currencyMatch[2].trim().toUpperCase();
      const to = currencyMatch[3].trim().toUpperCase();
      if (!isNaN(amount)) {
        return {
          shouldRoute: true,
          directExecution: true,
          toolName: "currency_conversion",
          args: { amount, from, to },
        };
      }
    }

    // 4. Live Weather: "weather in Jaipur", "delhi ka mausam", "temperature in London", "how is the weather in Paris"
    const weatherMatch = lower.match(/(?:weather|temperature|forecast|mausam)\s+(?:in|of|at|for)?\s*([a-zA-Z\s]+)/i) ||
      lower.match(/([a-zA-Z\s]+)\s+(?:ka mausam|weather)/i);
    if (weatherMatch) {
      const loc = weatherMatch[1].trim().replace(/\b(ka|ki|me|mein|today|aaj|\?)\b/gi, "").trim();
      if (loc.length > 2) {
        return {
          shouldRoute: true,
          directExecution: true,
          toolName: "get_weather",
          args: { location: loc.charAt(0).toUpperCase() + loc.slice(1) },
        };
      }
    }

    // 5. Explicit Webpage Read: "read https://...", "summarize this page https://..."
    const urlMatch = q.match(/https?:\/\/[^\s]+/i);
    if (urlMatch && /\b(read|extract|summarize|content|open|scrape)\b/i.test(lower)) {
      return {
        shouldRoute: true,
        directExecution: true,
        toolName: "extract_webpage",
        args: { url: urlMatch[0] },
      };
    }

    // 6. Deep Research Intent: "search and read", "compare X and Y", "deep research on", "detailed investigation"
    if (/\b(compare|deep research|search and read|detailed analysis of|official announcements from)\b/i.test(lower)) {
      return {
        shouldRoute: true,
        directExecution: false,
        toolName: "search_and_read",
        args: { query: q, maxResults: 3 },
      };
    }

    return {
      shouldRoute: false,
      directExecution: false,
      toolName: null,
      args: {},
    };
  }
}

export const toolRouter = new ToolRouter();
export default toolRouter;
