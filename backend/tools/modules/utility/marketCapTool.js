/**
 * Market Capitalization & Company Valuation Tool
 * Fetches total company market cap and asset valuations for public equities and cryptocurrencies.
 *
 * Distinct from get_stock_quote (per-share price):
 *  - get_stock_quote = share price (e.g. $230.86/share)
 *  - get_market_cap  = total company valuation (e.g. $5.57 Trillion USD)
 */

import { toolCache } from "../../caching/toolCache.js";

const COMPANY_SLUG_MAP = {
  nvidia: { slug: "nvidia", symbol: "NVDA", name: "NVIDIA Corporation", assetType: "EQUITY" },
  nvda: { slug: "nvidia", symbol: "NVDA", name: "NVIDIA Corporation", assetType: "EQUITY" },
  meta: { slug: "meta-platforms", symbol: "META", name: "Meta Platforms (Facebook)", assetType: "EQUITY" },
  facebook: { slug: "meta-platforms", symbol: "META", name: "Meta Platforms (Facebook)", assetType: "EQUITY" },
  fb: { slug: "meta-platforms", symbol: "META", name: "Meta Platforms (Facebook)", assetType: "EQUITY" },
  apple: { slug: "apple", symbol: "AAPL", name: "Apple Inc.", assetType: "EQUITY" },
  aapl: { slug: "apple", symbol: "AAPL", name: "Apple Inc.", assetType: "EQUITY" },
  microsoft: { slug: "microsoft", symbol: "MSFT", name: "Microsoft Corporation", assetType: "EQUITY" },
  msft: { slug: "microsoft", symbol: "MSFT", name: "Microsoft Corporation", assetType: "EQUITY" },
  google: { slug: "alphabet-google", symbol: "GOOGL", name: "Alphabet (Google)", assetType: "EQUITY" },
  alphabet: { slug: "alphabet-google", symbol: "GOOGL", name: "Alphabet (Google)", assetType: "EQUITY" },
  googl: { slug: "alphabet-google", symbol: "GOOGL", name: "Alphabet (Google)", assetType: "EQUITY" },
  amazon: { slug: "amazon", symbol: "AMZN", name: "Amazon.com Inc.", assetType: "EQUITY" },
  amzn: { slug: "amazon", symbol: "AMZN", name: "Amazon.com Inc.", assetType: "EQUITY" },
  tesla: { slug: "tesla", symbol: "TSLA", name: "Tesla Inc.", assetType: "EQUITY" },
  tsla: { slug: "tesla", symbol: "TSLA", name: "Tesla Inc.", assetType: "EQUITY" },
  netflix: { slug: "netflix", symbol: "NFLX", name: "Netflix Inc.", assetType: "EQUITY" },
  nflx: { slug: "netflix", symbol: "NFLX", name: "Netflix Inc.", assetType: "EQUITY" },
  bitcoin: { coinId: "bitcoin", symbol: "BTC", name: "Bitcoin", assetType: "CRYPTO" },
  btc: { coinId: "bitcoin", symbol: "BTC", name: "Bitcoin", assetType: "CRYPTO" },
  ethereum: { coinId: "ethereum", symbol: "ETH", name: "Ethereum", assetType: "CRYPTO" },
  eth: { coinId: "ethereum", symbol: "ETH", name: "Ethereum", assetType: "CRYPTO" },
  reliance: { slug: "reliance-industries", symbol: "RELIANCE.NS", name: "Reliance Industries", assetType: "EQUITY" },
  tcs: { slug: "tata-consultancy-services", symbol: "TCS.NS", name: "Tata Consultancy Services", assetType: "EQUITY" },
  spy: { slug: "spdr-s-p-500-etf-trust", symbol: "SPY", name: "SPDR S&P 500 ETF Trust", assetType: "ETF" },
  qqq: { slug: "invesco-qqq-trust", symbol: "QQQ", name: "Invesco QQQ Trust", assetType: "ETF" },
  voo: { slug: "vanguard-s-p-500-etf", symbol: "VOO", name: "Vanguard S&P 500 ETF", assetType: "ETF" },
  sp500: { slug: "sp500", symbol: "^GSPC", name: "S&P 500 Index", assetType: "INDEX" },
};

function formatTrillions(rawNumber) {
  if (typeof rawNumber !== "number") return null;
  if (rawNumber >= 1e12) {
    return `$${(rawNumber / 1e12).toFixed(2)} Trillion`;
  }
  if (rawNumber >= 1e9) {
    return `$${(rawNumber / 1e9).toFixed(2)} Billion`;
  }
  return `$${rawNumber.toLocaleString()}`;
}

export const marketCapTool = {
  name: "get_market_cap",
  description: "Get total market capitalization and global valuation for public companies and cryptocurrencies (e.g. Nvidia, Meta, Apple, Microsoft, Bitcoin, Reliance).",
  category: "finance",
  risk: "low",
  timeoutMs: 4500,
  cacheTtlMs: 300000, // 5 minutes cache
  retryPolicy: { maxRetries: 1, backoffMs: 300 },
  authPolicy: "public",
  parameters: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        description: "Company name or ticker symbol (e.g. 'NVIDIA', 'Meta', 'Facebook', 'Apple', 'Bitcoin', 'Microsoft')",
      },
    },
    required: ["symbol"],
  },

  async execute(args) {
    const rawInput = String(args.symbol || "").trim().toLowerCase().replace(/[^a-zA-Z0-9.-]/g, "");
    if (!rawInput) {
      return {
        ok: false,
        tool: "get_market_cap",
        error: { code: "INVALID_ARGUMENT", message: "Company name or ticker is required." },
      };
    }

    const cached = toolCache.get("market_cap", rawInput);
    if (cached) {
      return {
        ok: true,
        tool: "get_market_cap",
        data: cached,
        metadata: { cached: true },
      };
    }

    const mapping = COMPANY_SLUG_MAP[rawInput] || {
      slug: rawInput,
      symbol: rawInput.toUpperCase(),
      name: rawInput.charAt(0).toUpperCase() + rawInput.slice(1),
      assetType: "EQUITY",
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      // 1. Crypto Market Cap via CoinGecko
      if (mapping.assetType === "CRYPTO" || mapping.coinId) {
        const coinId = mapping.coinId || (rawInput.includes("btc") ? "bitcoin" : "ethereum");
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_market_cap=true`, {
          signal: controller.signal,
        });

        if (res.ok) {
          const json = await res.json();
          const capRaw = json[coinId]?.usd_market_cap;
          if (capRaw) {
            const payload = {
              companyName: mapping.name,
              symbol: mapping.symbol,
              assetType: "CRYPTO",
              marketCapFormatted: formatTrillions(capRaw),
              marketCapRaw: capRaw,
              currency: "USD",
              source: "CoinGecko Real-Time Crypto Data",
              isDelayed: false,
              delayNotice: "Real-time 24/7 crypto data",
              timestamp: new Date().toISOString(),
            };
            toolCache.set("market_cap", rawInput, payload, 300);
            return { ok: true, tool: "get_market_cap", data: payload };
          }
        }
      }

      // 2. Public Equity Market Cap via CompaniesMarketCap
      const slug = mapping.slug || rawInput;
      const res = await fetch(`https://companiesmarketcap.com/${encodeURIComponent(slug)}/marketcap/`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: controller.signal,
      });

      if (res.ok) {
        const html = await res.text();
        const match = html.match(/<div class="line1">([$0-9.,\s]+[TBM])<\/div>/i);
        if (match && match[1]) {
          const capStr = match[1].trim().replace(/\s+/g, " ");
          const trimmedCap = capStr.slice(0, -1).trim();
          const expandedCap = capStr.endsWith("T")
            ? `${trimmedCap} Trillion USD`
            : capStr.endsWith("B")
            ? `${trimmedCap} Billion USD`
            : capStr;

          const payload = {
            companyName: mapping.name,
            symbol: mapping.symbol,
            assetType: mapping.assetType || "EQUITY",
            marketCapFormatted: expandedCap,
            currency: "USD",
            source: "CompaniesMarketCap (Public Financial Reporting)",
            isDelayed: true,
            delayNotice: "Standard public financial reporting delay",
            timestamp: new Date().toISOString(),
          };

          toolCache.set("market_cap", rawInput, payload, 300);
          return { ok: true, tool: "get_market_cap", data: payload };
        }
      }

      throw new Error(`Market cap data could not be parsed for '${mapping.name}'`);
    } catch (err) {
      return {
        ok: false,
        tool: "get_market_cap",
        error: { code: "FEED_ERROR", message: `Could not fetch market cap for '${mapping.name}': ${err.message}` },
      };
    } finally {
      clearTimeout(timeout);
    }
  },

  formatVoiceSummary(result) {
    if (!result.ok || !result.data) {
      return result.error?.message || "Market capitalization data is currently unavailable.";
    }

    const d = result.data;
    const delayNotice = d.isDelayed ? " (Subject to standard market reporting delay)" : "";
    return `${d.companyName} (${d.assetType}: ${d.symbol}) has a total market capitalization of approximately ${d.marketCapFormatted}. Source: ${d.source}${delayNotice}.`;
  },
};

export default marketCapTool;
