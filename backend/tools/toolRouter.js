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
    const cleanQ = q.replace(/[?.,!]+$/, "").trim();
    const lower = cleanQ.toLowerCase();

    // 1. Explicit Arithmetic or Percentage: "2+2", "18% of 4500", "What is 17 percent of 850?", "what is 45 * 12 + 10?"
    if (
      /^(?:what is |calculate |evaluate )?[\d.\s+\-*/()^%x]+$/i.test(cleanQ) ||
      /\b\d+\s*(?:%|percent)\s*of\s*\d+\b/i.test(lower) ||
      /^(?:how much is )?[\d.]+\s*(?:km|miles|kg|lbs|celsius|fahrenheit)\s*(?:to|in)\s*(?:km|miles|kg|lbs|celsius|fahrenheit)$/i.test(lower)
    ) {
      const expr = cleanQ.replace(/^(?:what is |calculate |evaluate |compute |how much is )/i, "").trim();
      return {
        shouldRoute: true,
        directExecution: true,
        toolName: "calculate_expression",
        args: { expression: expr },
      };
    }

    // 2. Current Time / Date: "what time is it", "current date", "what is today's date", "time in London"
    if (
      /\b(what time is it|current time|current date|today'?s date|todays date|what is today'?s date|what date is today|aaj kitni tarikh|aaj kya din|exact time|time now|kya time hua)\b/i.test(lower)
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

    // 3. Currency Conversion: "100 usd to inr", "convert 50 dollars to rupees", "100$ in inr", "convert $50 to euros"
    const CURRENCY_SYMBOLS = ["$", "₹", "€", "£", "¥"];
    const CURRENCY_CODES = new Set([
      "usd", "inr", "eur", "gbp", "jpy", "cad", "aud", "chf", "cny", "nzd", "sgd", "hkd", "krw", "aed", "sar", "sek", "nok", "brl", "zar", "mxn"
    ]);
    const CURRENCY_NAMES = new Set([
      "dollar", "dollars", "cent", "cents", "rupee", "rupees", "rs", "paisa", "paise", "euro", "euros", "pound", "pounds", "yen", "dirham", "dirhams", "riyal", "riyals", "franc", "francs", "yuan", "peso", "pesos", ...CURRENCY_SYMBOLS
    ]);

    const isCurrencyUnit = (tok) => {
      if (!tok) return false;
      const t = tok.trim().toLowerCase();
      return CURRENCY_CODES.has(t) || CURRENCY_NAMES.has(t) || CURRENCY_SYMBOLS.includes(t);
    };

    const currencyMatch = lower.match(/(?:(?:how\s+much\s+is\s+)?(?:convert\s+)?)(?:([$₹€£¥])\s*([\d.]+)|([\d.]+)\s*([a-zA-Z$₹€£¥]+))\s*(?:to|in|into)\s*(?:([$₹€£¥])\s*([a-zA-Z]+)|([a-zA-Z$₹€£¥]+))/i);
    if (currencyMatch) {
      const amountStr = currencyMatch[2] || currencyMatch[3];
      const fromUnit = (currencyMatch[1] || currencyMatch[4] || "").trim();
      const toUnit = (currencyMatch[5] || currencyMatch[6] || currencyMatch[7] || "").trim();
      const amount = parseFloat(amountStr);

      if (!isNaN(amount) && isCurrencyUnit(fromUnit) && isCurrencyUnit(toUnit)) {
        return {
          shouldRoute: true,
          directExecution: true,
          toolName: "currency_conversion",
          args: { amount, from: fromUnit.toUpperCase(), to: toUnit.toUpperCase() },
        };
      }
    }

    // 4. Live Weather: "weather in Jaipur", "how is the weather in Paris today", "Jaipur ka weather kaisa hai", "delhi ka mausam", "temperature in London"
    const isEconomicOrFinancial = /\b(gdp|inflation|cpi|wpi|growth|deficit|economic|economy|fiscal|repo|rbi|ministry|stock|share|market|valuation|revenue|sales|rate|forecast\s+has)\b/i.test(lower);
    if (!isEconomicOrFinancial) {
      let weatherMatch = null;
      const prefixMatch = lower.match(/(?:weather(?:\s+forecast)?|temperature|mausam)\s+(?:in|of|at|for)\s+([a-zA-Z\s]+)/i);
      const suffixMatch = lower.match(/([a-zA-Z\s]+)\s+(?:ka mausam|ka weather|weather)/i);
      const genericPrefix = lower.match(/(?:weather(?:\s+forecast)?|temperature|mausam)\s+([a-zA-Z\s]+)/i);
      weatherMatch = prefixMatch || suffixMatch || genericPrefix;
      if (weatherMatch) {
        let loc = weatherMatch[1].trim().replace(/\b(ka|ki|me|mein|today|aaj|kaisa|kaisi|hai|how is the|what is the|right now|now|currently|current|\?)\b/gi, "").trim();
        if (loc.length > 2) {
          const formattedLoc = loc.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
          return {
            shouldRoute: true,
            directExecution: true,
            toolName: "get_weather",
            args: { location: formattedLoc },
          };
        }
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

    const companyMatch = lower.match(/\b(nvidia|nvda|meta|facebook|fb|apple|aapl|microsoft|msft|google|alphabet|googl|amazon|amzn|tesla|tsla|netflix|nflx|bitcoin|btc|ethereum|eth|solana|sol|doge|dogecoin|cardano|ada|xrp|ripple|reliance|tcs|hdfc|infosys|infy|tata motors|spy|qqq|voo)\b/i);

    // 6a. Market Capitalization / Company Valuation (Total Worth)
    // Matches: "NVIDIA market cap", "Apple company value", "facebook ki market value kya h aaj ki", "valuation of tesla"
    const marketCapKeywords = /\b(market cap|marketcap|market capitalization|market value|company value|company valuation|valuation|total worth)\b/i;
    if (marketCapKeywords.test(lower) && companyMatch) {
      return {
        shouldRoute: true,
        directExecution: true,
        toolName: "get_market_cap",
        args: { symbol: companyMatch[1] },
      };
    }

    // 6b. Live Per-Share Stock / Crypto Quote (Share Price)
    // Matches: "NVIDIA stock price", "Bitcoin price", "tesla share price", "apple stock", "trading at", "24-hour change"
    const stockKeywords = /\b(stock price|share price|stock quote|stock|share|trading at|current price|price of|ka price|ke share ka price|ke stock ka price|ticker|24-hour change|24h change|24 hour change)\b/i;
    const priceKeyword = /\bprice\b/i;
    if ((stockKeywords.test(lower) || priceKeyword.test(lower)) && companyMatch) {
      return {
        shouldRoute: true,
        directExecution: true,
        toolName: "get_stock_quote",
        args: { symbol: companyMatch[1] },
      };
    }

    // 7. Deep Research Intent: "search and read", "compare X and Y", "deep research on", "detailed investigation"
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
