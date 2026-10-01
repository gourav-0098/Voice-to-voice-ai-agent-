import { safeOutboundRequest } from "../../network/safeHttpClient.js";
import { toolCache } from "../../caching/toolCache.js";

// Standard fallback rates relative to USD in case network is down
const FALLBACK_USD_RATES = {
  USD: 1.0,
  INR: 86.8,
  EUR: 0.94,
  GBP: 0.79,
  AED: 3.67,
  JPY: 152.4,
  CAD: 1.41,
  AUD: 1.57,
  SGD: 1.34,
};

export const currencyTool = {
  name: "currency_conversion",
  description: "Convert monetary amounts between global currencies (e.g. USD to INR, EUR to USD, GBP to INR) using live exchange rates.",
  category: "utility",
  risk: "low",
  timeoutMs: 4000,
  cacheTtlMs: 3600000, // 1 hour for exchange rates
  retryPolicy: { maxRetries: 1, backoffMs: 500 },
  authPolicy: "public",
  parameters: {
    type: "object",
    properties: {
      amount: {
        type: "number",
        description: "The numerical amount of money to convert (e.g. 100, 50.5)",
      },
      from: {
        type: "string",
        description: "The 3-letter currency code or name converting from (e.g. 'USD', 'dollar', 'EUR')",
      },
      to: {
        type: "string",
        description: "The 3-letter currency code or name converting to (e.g. 'INR', 'rupees', 'GBP')",
      },
    },
    required: ["amount", "from", "to"],
  },

  async execute(args, context = {}) {
    const amount = Number(args.amount);
    if (isNaN(amount) || amount <= 0) {
      return {
        ok: false,
        tool: "currency_conversion",
        error: { code: "INVALID_AMOUNT", message: "Amount must be a positive number.", retryable: false },
      };
    }

    // Currency symbol / word normalization
    const normalizeCurrency = (code) => {
      const c = String(code || "").trim().toUpperCase();
      if (c.includes("RUPEE") || c.includes("INR") || c === "RS") return "INR";
      if (c.includes("DOLLAR") || c.includes("USD") || c === "$") return "USD";
      if (c.includes("EURO") || c.includes("EUR") || c === "€") return "EUR";
      if (c.includes("POUND") || c.includes("GBP") || c === "£") return "GBP";
      if (c.includes("DIRHAM") || c.includes("AED")) return "AED";
      if (c.includes("YEN") || c.includes("JPY") || c === "¥") return "JPY";
      return c.slice(0, 3);
    };

    const fromCurr = normalizeCurrency(args.from);
    const toCurr = normalizeCurrency(args.to);

    if (fromCurr === toCurr) {
      return {
        ok: true,
        tool: "currency_conversion",
        data: {
          amount,
          from: fromCurr,
          to: toCurr,
          convertedAmount: amount,
          rate: 1.0,
        },
      };
    }

    let rates = toolCache.get("currency", "rates_usd");

    if (!rates) {
      try {
        // Free real-time exchange rate API (open.er-api.com)
        const res = await safeOutboundRequest("https://open.er-api.com/v6/latest/USD", { timeoutMs: 3000 });
        if (res && res.ok) {
          const json = await res.json();
          if (json.rates) {
            rates = json.rates;
            toolCache.set("currency", "rates_usd", rates, 3600);
          }
        }
      } catch (_) {}
    }

    if (!rates) {
      rates = FALLBACK_USD_RATES;
    }

    const rateFromUSD = rates[fromCurr] || FALLBACK_USD_RATES[fromCurr] || null;
    const rateToUSD = rates[toCurr] || FALLBACK_USD_RATES[toCurr] || null;

    if (!rateFromUSD || !rateToUSD) {
      return {
        ok: false,
        tool: "currency_conversion",
        error: { code: "UNSUPPORTED_CURRENCY", message: `Could not find exchange rate between ${fromCurr} and ${toCurr}.`, retryable: false },
      };
    }

    // Convert via USD bridge: (amount / rateFromUSD) * rateToUSD
    const amountInUSD = amount / rateFromUSD;
    const convertedAmount = Number((amountInUSD * rateToUSD).toFixed(2));
    const effectiveRate = Number((rateToUSD / rateFromUSD).toFixed(4));

    const data = {
      amount,
      from: fromCurr,
      to: toCurr,
      convertedAmount,
      rate: effectiveRate,
    };

    return {
      ok: true,
      tool: "currency_conversion",
      data,
      metadata: { liveRate: rates !== FALLBACK_USD_RATES },
    };
  },

  formatVoiceSummary(result) {
    if (!result.ok) {
      return `Currency conversion failed: ${result.error?.message || "unsupported currencies"}.`;
    }
    const d = result.data;
    return `${d.amount} ${d.from} is approximately ${d.convertedAmount} ${d.to} (at an exchange rate of ${d.rate}).`;
  },
};

export default currencyTool;
