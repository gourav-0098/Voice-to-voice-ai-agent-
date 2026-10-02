/**
 * Tool Service for Chatly Voice AI
 * Modular AI Tool Engine Bridge (Production-Grade)
 *
 * Fully preserves backward compatibility for legacy callers (voice.js, voiceWebSocketService.js, aiService.js)
 * while routing all calls through the modular Tool Registry, Safe HTTP Client, Scoped Cache, and Tool Executor.
 */

import { toolRegistry } from "../tools/toolRegistry.js";
import { toolExecutor } from "../tools/toolExecutor.js";
import { toolRouter } from "../tools/toolRouter.js";
import { toolCache } from "../tools/caching/toolCache.js";
import { isIpPrivateOrReserved, isUrlSafe, safeOutboundRequest } from "../tools/network/safeHttpClient.js";

// Re-export core SSRF security primitives for tests and benchmark suites
export { isIpPrivateOrReserved, isUrlSafe, safeOutboundRequest };

// Legacy In-Memory Cache Bridge
export function getCachedToolResult(key) {
  const item = toolCache.get("legacy", key);
  return item !== undefined ? item : null;
}

export function setCachedToolResult(key, data, ttlSeconds = 600) {
  toolCache.set("legacy", key, data, ttlSeconds * 1000);
}

/**
 * Backward-compatible getWeather
 */
export async function getWeather(location = "") {
  const result = await toolExecutor.executeTool("get_weather", { location });
  if (result.ok) {
    return result.voiceSummary || result.data?.report || "Weather information obtained.";
  }
  return `Error: ${result.error?.message || "Failed to retrieve weather data."}`;
}

/**
 * Backward-compatible getCurrentTimeAndDate
 */
export async function getCurrentTimeAndDate(location = "") {
  const result = await toolExecutor.executeTool("get_current_time", { location });
  if (result.ok) {
    return result.voiceSummary || result.data?.formatted || "Time obtained.";
  }
  return `Error: ${result.error?.message || "Failed to retrieve current time."}`;
}

/**
 * Backward-compatible webSearch
 */
export async function webSearch(query = "") {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return "Please specify what you would like to search for.";

  const result = await toolExecutor.executeTool("web_search", { query: cleanQuery });
  if (result.ok) {
    return result.data?.markdown || result.data?.summary || result.voiceSummary || "No search results found.";
  }
  return `Web search could not be completed: ${result.error?.message || "Search failed."}`;
}

/**
 * Detailed web search returning structured sources alongside voice summary
 */
export async function searchWebDetailed(query = "") {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return { text: "Please specify what you would like to search for.", results: [] };

  const result = await toolExecutor.executeTool("web_search", { query: cleanQuery });
  if (result.ok) {
    const rawResults = Array.isArray(result.sources) && result.sources.length > 0
      ? result.sources
      : (Array.isArray(result.data?.results) ? result.data.results : []);
    return {
      text: result.voiceSummary || "Search completed.",
      results: rawResults,
    };
  }
  return {
    text: `Web search could not be completed: ${result.error?.message || "Search failed."}`,
    results: [],
  };
}

/**
 * Backward-compatible scrapeWebPage
 */
export async function scrapeWebPage(url = "") {
  const cleanUrl = String(url || "").trim();
  if (!cleanUrl) return "Please specify a URL to scrape.";

  const result = await toolExecutor.executeTool("extract_webpage", { url: cleanUrl });
  if (result.ok) {
    return result.data?.text || result.voiceSummary || "Extracted webpage content.";
  }
  return `Webpage extraction failed: ${result.error?.message || "Unable to scrape webpage."}`;
}

import { computeExpression, safeEvaluate } from "../tools/modules/utility/calculatorTool.js";
export { safeEvaluate };

/**
 * Backward-compatible calculateExpression
 */
export function calculateExpression(expression = "") {
  try {
    const res = computeExpression(expression);
    if (res.ok) {
      return res.data.result;
    }
    return `Could not evaluate math expression "${expression}": ${res.error?.message || "Invalid expression"}`;
  } catch (err) {
    return `Could not evaluate math expression "${expression}": ${err.message}`;
  }
}

/**
 * Master Tool Dispatcher (returns string or formatted object for model)
 */
export async function executeTool(toolName, args = {}, context = {}) {
  console.log(`⚡ [TOOL EXECUTE] Dispatching: "${toolName}" with args:`, args);

  // Map legacy names to registry names
  const canonicalName = toolRegistry.resolveName(toolName);
  const result = await toolExecutor.executeTool(canonicalName, args, context);

  if (result.ok) {
    // Return structured data with voice summary and raw data
    return result.voiceSummary || JSON.stringify(result.data);
  }

  return `Error executing tool "${toolName}": ${result.error?.message || "Unknown error"}`;
}

/**
 * Tool Schemas for Model Calling
 */
export const GROQ_TOOLS = toolRegistry.getGroqTools();
export const GEMINI_FUNCTION_DECLARATIONS = toolRegistry.getGeminiFunctionDeclarations();

export default {
  getWeather,
  getCurrentTimeAndDate,
  webSearch,
  searchWebDetailed,
  scrapeWebPage,
  calculateExpression,
  executeTool,
  GROQ_TOOLS,
  GEMINI_FUNCTION_DECLARATIONS,
  getCachedToolResult,
  setCachedToolResult,
  isIpPrivateOrReserved,
  isUrlSafe,
  safeOutboundRequest,
  toolRegistry,
  toolExecutor,
  toolRouter,
  toolCache,
};
