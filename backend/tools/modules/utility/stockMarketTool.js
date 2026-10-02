/**
 * Stock & Crypto Live Market Quote Tool
 * Fetches real-time market prices, day range, changes, and exchange data
 * via public financial exchange feeds (zero API key required).
 *
 * Distinct from get_market_cap (total company valuation):
 *  - get_stock_quote = share price (e.g. $230.86/share)
 *  - get_market_cap  = total company valuation (e.g. $5.57 Trillion USD)
 */

import { toolCache } from "../../caching/toolCache.js";

// Common corporate name to ticker symbol mapping
const COMPANY_TICKER_MAP = {
  nvidia: "NVDA",
  nvda: "NVDA",
  meta: "META",
  facebook: "META",
  fb: "META",
  apple: "AAPL",
  aapl: "AAPL",
  microsoft: "MSFT",
  msft: "MSFT",
  google: "GOOGL",
  alphabet: "GOOGL",
  googl: "GOOGL",
  goog: "GOOGL",
  amazon: "AMZN",
  amzn: "AMZN",
  tesla: "TSLA",
  tsla: "TSLA",
  netflix: "NFLX",
  nflx: "NFLX",
  bitcoin: "BTC-USD",
  btc: "BTC-USD",
  ethereum: "ETH-USD",
  eth: "ETH-USD",
  reliance: "RELIANCE.NS",
  tcs: "TCS.NS",
  hdfc: "HDFCBANK.NS",
  infosys: "INFY.NS",
  tata: "TATAMOTORS.NS",
  spy: "SPY",
  qqq: "QQQ",
  voo: "VOO",
  iwm: "IWM",
  sp500: "^GSPC",
};

function resolveTicker(input = "") {
  const clean = String(input).trim().toLowerCase().replace(/[^a-zA-Z0-9.-]/g, "");
  if (COMPANY_TICKER_MAP[clean]) {
    return COMPANY_TICKER_MAP[clean];
  }
  return input.trim().toUpperCase();
}

function resolveAssetType(instrumentType, ticker) {
  const raw = String(instrumentType || "").toUpperCase();
  if (raw === "EQUITY") return "EQUITY";
  if (raw === "CRYPTOCURRENCY" || ticker.includes("-USD") || ticker === "BTC" || ticker === "ETH") return "CRYPTO";
  if (raw === "ETF" || ["SPY", "QQQ", "VOO", "IWM"].includes(ticker)) return "ETF";
  if (raw === "INDEX" || ticker.startsWith("^")) return "INDEX";
  return "EQUITY";
}

export const stockMarketTool = {
  name: "get_stock_quote",
  description: "Get real-time per-share stock and crypto trading prices, daily changes, and 52-week ranges for public companies (e.g. Nvidia, Meta, Apple, Tesla, Reliance, Bitcoin).",
  category: "finance",
  risk: "low",
  timeoutMs: 4000,
  cacheTtlMs: 60000, // 1 minute live market cache
  retryPolicy: { maxRetries: 1, backoffMs: 300 },
  authPolicy: "public",
  parameters: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        description: "Ticker symbol or company name (e.g. 'NVDA', 'Nvidia', 'META', 'Facebook', 'AAPL', 'BTC-USD')",
      },
    },
    required: ["symbol"],
  },

  async execute(args) {
    const rawSymbol = String(args.symbol || "").trim();
    if (!rawSymbol) {
      return {
        ok: false,
        tool: "get_stock_quote",
        error: { code: "INVALID_ARGUMENT", message: "Stock symbol or company name is required." },
      };
    }

    const ticker = resolveTicker(rawSymbol);

    // Cache check
    const cached = toolCache.get("stock", ticker);
    if (cached) {
      return {
        ok: true,
        tool: "get_stock_quote",
        data: cached,
        metadata: { cached: true },
      };
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Market feed HTTP ${res.status}`);
      }

      const json = await res.json();
      const meta = json.chart?.result?.[0]?.meta;

      if (!meta || typeof meta.regularMarketPrice !== "number") {
        throw new Error(`No market data found for ticker '${ticker}'`);
      }

      const price = meta.regularMarketPrice;
      const currency = meta.currency || "USD";
      const changePct = meta.regularMarketChangePercent != null ? Number(meta.regularMarketChangePercent.toFixed(2)) : 0;
      const prevClose = meta.previousClose || meta.chartPreviousClose || price;
      const dayHigh = meta.regularMarketDayHigh || price;
      const dayLow = meta.regularMarketDayLow || price;
      const yearHigh = meta.fiftyTwoWeekHigh || null;
      const yearLow = meta.fiftyTwoWeekLow || null;
      const companyName = meta.longName || meta.shortName || ticker;
      const assetType = resolveAssetType(meta.instrumentType, ticker);
      const isCrypto = assetType === "CRYPTO";

      const marketTimestamp = meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString();

      const payload = {
        symbol: meta.symbol || ticker,
        companyName,
        assetType,
        currentPrice: price,
        currency,
        changePercent: changePct,
        previousClose: prevClose,
        dayRange: `${dayLow} - ${dayHigh}`,
        fiftyTwoWeekRange: yearLow && yearHigh ? `${yearLow} - ${yearHigh}` : null,
        exchange: meta.fullExchangeName || meta.exchangeName || "Exchange",
        source: isCrypto ? "Live 24/7 Crypto Feed" : "Exchange Feed (Yahoo Finance)",
        isDelayed: !isCrypto, // Standard 15-minute public exchange delay for equities
        delayNotice: isCrypto ? "Real-time" : "15-minute exchange delay during trading hours",
        marketTime: marketTimestamp,
        timestamp: new Date().toISOString(),
      };

      toolCache.set("stock", ticker, payload, 60);

      return {
        ok: true,
        tool: "get_stock_quote",
        data: payload,
        metadata: { cached: false },
      };
    } catch (err) {
      return {
        ok: false,
        tool: "get_stock_quote",
        error: { code: "FEED_ERROR", message: `Could not fetch live market data for '${ticker}': ${err.message}` },
      };
    } finally {
      clearTimeout(timeout);
    }
  },

  formatVoiceSummary(result) {
    if (!result.ok || !result.data) {
      return result.error?.message || "Market data is currently unavailable.";
    }

    const d = result.data;
    const sign = d.changePercent >= 0 ? "+" : "";
    const delayText = d.isDelayed ? " (Subject to standard 15-minute exchange delay)" : "";
    const unit = d.assetType === "CRYPTO" ? "" : d.assetType === "INDEX" ? " points" : " per share";

    let summary = `${d.companyName} (${d.assetType}: ${d.symbol}) is currently trading at ${d.currency} ${d.currentPrice}${unit} (${sign}${d.changePercent}% today). Day range is ${d.dayRange} ${d.currency}${delayText}.`;
    if (d.fiftyTwoWeekRange) {
      summary += ` 52-week range is ${d.fiftyTwoWeekRange} ${d.currency}.`;
    }
    return summary;
  },
};

export default stockMarketTool;
