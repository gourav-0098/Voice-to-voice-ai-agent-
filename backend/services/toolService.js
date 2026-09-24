/**
 * Tool Service for Chatly Voice AI
 * Implements real-time Web Search, Web Scraping, Live Weather, and Clock/Date
 */

// Simple HTML text cleaner for scraped pages
function sanitizeHtmlToText(html) {
  if (!html || typeof html !== "string") return "";

  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<(div|p|h1|h2|h3|h4|h5|h6|li|tr|article|section)[^>]*>/gi, " ")
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

const WMO_WEATHER_MAP = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snowfall",
  73: "Moderate snowfall",
  75: "Heavy snowfall",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

// =========================================================
// In-Memory TTL Cache for External Tool Invocations
// =========================================================
const toolCache = new Map();

export function getCachedToolResult(key) {
  const cached = toolCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    toolCache.delete(key);
    return null;
  }
  return cached.data;
}

export function setCachedToolResult(key, data, ttlSeconds = 600) {
  toolCache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * 0. Safe Math & Unit Conversion Tool
 */
export function calculateExpression(expression) {
  if (!expression || typeof expression !== "string") {
    return "Error: No mathematical expression provided.";
  }

  let expr = expression.trim();

  try {
    // 1. Unit conversions
    const kmToMiles = expr.match(/^([\d.]+)\s*(?:km|kilometers?)\s*(?:to|in)\s*(?:miles?|mi)$/i);
    if (kmToMiles) {
      const val = parseFloat(kmToMiles[1]);
      return `${val} km is equal to ${(val * 0.621371).toFixed(2)} miles.`;
    }

    const milesToKm = expr.match(/^([\d.]+)\s*(?:miles?|mi)\s*(?:to|in)\s*(?:km|kilometers?)$/i);
    if (milesToKm) {
      const val = parseFloat(milesToKm[1]);
      return `${val} miles is equal to ${(val * 1.60934).toFixed(2)} kilometers.`;
    }

    const cToF = expr.match(/^([\d.-]+)\s*(?:c|celsius)\s*(?:to|in)\s*(?:f|fahrenheit)$/i);
    if (cToF) {
      const val = parseFloat(cToF[1]);
      return `${val}°C is equal to ${((val * 9) / 5 + 32).toFixed(1)}°F.`;
    }

    const fToC = expr.match(/^([\d.-]+)\s*(?:f|fahrenheit)\s*(?:to|in)\s*(?:c|celsius)$/i);
    if (fToC) {
      const val = parseFloat(fToC[1]);
      return `${val}°F is equal to ${(((val - 32) * 5) / 9).toFixed(1)}°C.`;
    }

    const kgToLbs = expr.match(/^([\d.]+)\s*(?:kg|kilograms?)\s*(?:to|in)\s*(?:lbs?|pounds?)$/i);
    if (kgToLbs) {
      const val = parseFloat(kgToLbs[1]);
      return `${val} kg is equal to ${(val * 2.20462).toFixed(2)} pounds.`;
    }

    // 2. Percentages ("18% of 4500" -> "(18 / 100 * 4500)")
    expr = expr.replace(/([\d.]+)%\s*of\s*([\d.]+)/gi, "($1 / 100 * $2)");
    expr = expr.replace(/([\d.]+)%/g, "($1 / 100)");

    // 3. Word transformations
    expr = expr
      .replace(/\bplus\b/gi, "+")
      .replace(/\bminus\b/gi, "-")
      .replace(/\btimes\b|\bmultiplied by\b/gi, "*")
      .replace(/\bdivided by\b|\bover\b/gi, "/")
      .replace(/\^/g, "**")
      .replace(/x/gi, "*")
      .replace(/sqrt\(([^)]+)\)/gi, "Math.sqrt($1)")
      .replace(/abs\(([^)]+)\)/gi, "Math.abs($1)")
      .replace(/round\(([^)]+)\)/gi, "Math.round($1)");

    // 4. Sanitize to strictly allowed mathematical characters
    const sanitized = expr.replace(/[^0-9+\-*/().\s,Math.sqrtabsroundePI]/g, "");
    if (!sanitized.trim()) {
      return `Could not evaluate math expression: "${expression}".`;
    }

    const func = new Function(`"use strict"; return (${sanitized});`);
    const result = func();

    if (result === undefined || result === null || isNaN(result)) {
      return `Expression "${expression}" could not be calculated.`;
    }

    const formatted = Number.isInteger(result) ? result : Number(result.toFixed(4));
    return `Calculation result: ${expression} = ${formatted}`;
  } catch (err) {
    return `Error calculating "${expression}": ${err.message}`;
  }
}

/**
 * 1. Live Weather Tool (Open-Meteo & wttr.in)
 */
export async function getWeather(location) {
  if (!location || typeof location !== "string") {
    return "Error: Location name is required to check weather.";
  }

  const cleanLoc = location.trim();
  const cacheKey = `weather:${cleanLoc.toLowerCase()}`;
  const cached = getCachedToolResult(cacheKey);
  if (cached) {
    console.log(`⚡ [TOOL CACHE HIT] Weather for "${cleanLoc}"`);
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    console.log(`☀️ [TOOL: WEATHER] Fetching live weather for: "${cleanLoc}"...`);

    // Geocode location
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanLoc)}&count=1&language=en&format=json`;
    const geoRes = await fetch(geoUrl, { signal: controller.signal });
    if (geoRes.ok) {
      const geoData = await geoRes.json();
      if (geoData.results && geoData.results.length > 0) {
        const place = geoData.results[0];
        const lat = place.latitude;
        const lon = place.longitude;
        const placeName = `${place.name}${place.admin1 ? ", " + place.admin1 : ""}, ${place.country || ""}`;

        // Fetch current weather
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
        const weatherRes = await fetch(weatherUrl, { signal: controller.signal });
        if (weatherRes.ok) {
          const wData = await weatherRes.json();
          const current = wData.current;
          const condition = WMO_WEATHER_MAP[current.weather_code] || "Clear";
          clearTimeout(timeoutId);
          return `Live weather for ${placeName}: Temperature is ${current.temperature_2m}°C, condition is ${condition}, relative humidity is ${current.relative_humidity_2m}%, and wind speed is ${current.wind_speed_10m} km/h.`;
        }
      }
    }

    // Fallback: wttr.in format
    const wttrUrl = `https://wttr.in/${encodeURIComponent(cleanLoc)}?format=%l:+%C+%t,+Humidity:+%h,+Wind:+%w`;
    const wttrRes = await fetch(wttrUrl, { signal: controller.signal, headers: { "User-Agent": "curl/7.68.0" } });
    if (wttrRes.ok) {
      const text = await wttrRes.text();
      clearTimeout(timeoutId);
      if (text && !text.includes("Unknown location")) {
        return `Current weather in ${cleanLoc}: ${text.trim()}`;
      }
    }

    clearTimeout(timeoutId);
    return `Could not find real-time weather data for "${cleanLoc}".`;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("⚠️ [TOOL: WEATHER] Failed:", err.message);
    return `Weather lookup temporarily failed: ${err.message}`;
  }
}

/**
 * 2. Current Date and Time Tool
 */
export function getCurrentTimeAndDate(location = "") {
  const now = new Date();
  const timeString = now.toLocaleString("en-US", {
    timeZone: "Asia/Kolkata",
    dateStyle: "full",
    timeStyle: "long",
  });
  return `Current exact date and time (India/Asia): ${timeString}. Full ISO timestamp: ${now.toISOString()}`;
}

/**
 * 3. Web Search Tool (DuckDuckGo + Wikipedia)
 */
export async function webSearch(query) {
  if (!query || typeof query !== "string" || !query.trim()) {
    return "Error: A valid search query is required.";
  }

  const cleanQuery = query.trim();
  const cacheKey = `search:${cleanQuery.toLowerCase()}`;
  const cached = getCachedToolResult(cacheKey);
  if (cached) {
    console.log(`⚡ [TOOL CACHE HIT] Search for "${cleanQuery}"`);
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    console.log(`🌐 [TOOL: WEB SEARCH] Searching for: "${cleanQuery}"...`);

    // Strategy A: DuckDuckGo Instant Answer API
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1&skip_disambig=1`;
    const ddgRes = await fetch(ddgUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ChatlyAI/1.0" },
    });

    if (ddgRes.ok) {
      const data = await ddgRes.json();
      const results = [];

      if (data.AbstractText) {
        results.push(`Summary: ${data.AbstractText} (Source: ${data.AbstractSource || "DuckDuckGo"})`);
      }

      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, 3)) {
          if (topic.Text) {
            results.push(`- ${topic.Text}`);
          }
        }
      }

      if (results.length > 0) {
        clearTimeout(timeoutId);
        return results.join("\n\n");
      }
    }

    // Strategy B: Wikipedia Summary API
    const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanQuery.replace(/\s+/g, "_"))}`;
    const wikiRes = await fetch(wikiUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "ChatlyVoiceAI/1.0 (contact@chatly.ai)" },
    });

    if (wikiRes.ok) {
      const wikiData = await wikiRes.json();
      if (wikiData.extract) {
        clearTimeout(timeoutId);
        return `Wikipedia Summary for "${wikiData.title}": ${wikiData.extract}`;
      }
    }

    // Strategy C: DuckDuckGo HTML Lite scraping fallback
    const liteUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;
    const liteRes = await fetch(liteUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (liteRes.ok) {
      const html = await liteRes.text();
      const snippets = [];
      const snippetRegex = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      while ((match = snippetRegex.exec(html)) !== null && snippets.length < 3) {
        const cleanSnippet = match[1].replace(/<[^>]+>/g, "").trim();
        if (cleanSnippet) snippets.push(`- ${cleanSnippet}`);
      }

      clearTimeout(timeoutId);
      if (snippets.length > 0) {
        return `Web Search Results for "${cleanQuery}":\n${snippets.join("\n")}`;
      }
    }

    clearTimeout(timeoutId);
    return `No immediate web search results found for "${cleanQuery}".`;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`⚠️ [TOOL: WEB SEARCH] Search failed:`, err.message);
    return `Web search could not be completed at this moment: ${err.message}`;
  }
}

/**
 * 4. Web Page Scraping Tool
 */
export async function scrapeWebPage(url) {
  if (!url || typeof url !== "string") {
    return "Error: A valid URL is required to scrape.";
  }

  let targetUrl = url.trim();
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    targetUrl = "https://" + targetUrl;
  }

  const cacheKey = `scrape:${targetUrl}`;
  const cached = getCachedToolResult(cacheKey);
  if (cached) {
    console.log(`⚡ [TOOL CACHE HIT] Scraped content for "${targetUrl}"`);
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    console.log(`📄 [TOOL: SCRAPE] Scraping URL: "${targetUrl}"...`);
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return `Failed to scrape page (HTTP status: ${res.status} ${res.statusText}).`;
    }

    const html = await res.text();
    const cleanText = sanitizeHtmlToText(html);

    if (!cleanText || cleanText.length < 50) {
      return "The webpage did not contain readable text content.";
    }

    const trimmed = cleanText.slice(0, 2200);
    return `Content extracted from ${targetUrl}:\n\n${trimmed}${cleanText.length > 2200 ? "\n...[truncated]" : ""}`;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`⚠️ [TOOL: SCRAPE] Scraping failed for ${targetUrl}:`, err.message);
    return `Could not read webpage: ${err.message}`;
  }
}

/**
 * OpenAI / Groq Tool Definitions
 */
export const GROQ_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get real-time live weather conditions, temperature in Celsius, forecast, and humidity for any city, state, or region. ALWAYS call this tool when the user asks about weather.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The city or region name (e.g. 'Rajasthan', 'Jaipur', 'Delhi', 'London')",
          },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Get the exact current real-time date, day of week, and time. ALWAYS call this tool when the user asks what date or time it is today.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "Optional location or timezone",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the live web for current events, breaking news, sports scores, facts, or real-time information beyond your training cutoff.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query (e.g. 'latest tech news', 'cricket match score today')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scrape_web_page",
      description: "Fetch and extract readable text from a specific webpage URL to answer questions about its content or summarize it.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The full URL of the webpage to scrape",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_expression",
      description: "Perform precise arithmetic calculations, percentage computations (e.g. '18% of 5000'), and unit conversions (km to miles, Celsius to Fahrenheit, kg to lbs). ALWAYS call this tool when answering mathematical or conversion questions.",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "The mathematical expression or conversion to evaluate (e.g. '18% of 4500', '(250 * 12) + 300', '100 km to miles')",
          },
        },
        required: ["expression"],
      },
    },
  },
];

/**
 * Google Gemini Tool Function Declarations
 */
export const GEMINI_FUNCTION_DECLARATIONS = [
  {
    name: "get_weather",
    description: "Get real-time live weather conditions, temperature, and forecast for any city or region.",
    parameters: {
      type: "OBJECT",
      properties: {
        location: {
          type: "STRING",
          description: "The city or region name (e.g. 'Rajasthan', 'Jaipur')",
        },
      },
      required: ["location"],
    },
  },
  {
    name: "get_current_time",
    description: "Get the exact current real-time date, day of week, and time.",
    parameters: {
      type: "OBJECT",
      properties: {
        location: {
          type: "STRING",
          description: "Optional location",
        },
      },
    },
  },
  {
    name: "web_search",
    description: "Search the live web for current events, breaking news, sports scores, facts, or real-time information.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: {
          type: "STRING",
          description: "The search query",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "scrape_web_page",
    description: "Fetch and extract readable text from a specific webpage URL.",
    parameters: {
      type: "OBJECT",
      properties: {
        url: {
          type: "STRING",
          description: "The full URL of the webpage to scrape",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "calculate_expression",
    description: "Perform precise arithmetic calculations, percentages, and unit conversions.",
    parameters: {
      type: "OBJECT",
      properties: {
        expression: {
          type: "STRING",
          description: "The math expression or conversion to compute",
        },
      },
      required: ["expression"],
    },
  },
];

/**
 * Master Tool Dispatcher
 */
export async function executeTool(toolName, args = {}) {
  console.log(`⚡ [TOOL EXECUTE] Executing tool: "${toolName}" with args:`, args);

  if (toolName === "get_weather") {
    return await getWeather(args.location || args.city || "");
  }

  if (toolName === "get_current_time") {
    return getCurrentTimeAndDate(args.location || "");
  }

  if (toolName === "web_search") {
    return await webSearch(args.query || args.search_query || "");
  }

  if (toolName === "scrape_web_page") {
    return await scrapeWebPage(args.url || args.target_url || "");
  }

  if (toolName === "calculate_expression") {
    return calculateExpression(args.expression || args.expr || "");
  }

  return `Error: Unknown tool "${toolName}".`;
}

export default {
  getWeather,
  getCurrentTimeAndDate,
  webSearch,
  scrapeWebPage,
  calculateExpression,
  executeTool,
  GROQ_TOOLS,
  GEMINI_FUNCTION_DECLARATIONS,
  getCachedToolResult,
  setCachedToolResult,
};
