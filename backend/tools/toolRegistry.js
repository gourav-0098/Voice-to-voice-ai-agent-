import { webSearchTool } from "./modules/web/webSearchTool.js";
import { newsSearchTool } from "./modules/web/newsSearchTool.js";
import { openUrlTool } from "./modules/web/openUrlTool.js";
import { extractWebpageTool } from "./modules/web/extractWebpageTool.js";
import { searchAndReadTool } from "./modules/web/searchAndReadTool.js";
import { calculatorTool } from "./modules/utility/calculatorTool.js";
import { currentTimeTool } from "./modules/utility/currentTimeTool.js";
import { weatherTool } from "./modules/utility/weatherTool.js";
import { currencyTool } from "./modules/utility/currencyTool.js";
import { stockMarketTool } from "./modules/utility/stockMarketTool.js";
import { marketCapTool } from "./modules/utility/marketCapTool.js";

/**
 * Production-Grade Tool Registry
 * Manages tool definitions, JSON schema validation, risk tiers, and model bindings.
 */
export class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.aliases = new Map([
      ["scrape_web_page", "extract_webpage"],
      ["search_web", "web_search"],
      ["live_search", "web_search"],
      ["calc", "calculate_expression"],
      ["calculator", "calculate_expression"],
      ["time", "get_current_time"],
      ["weather", "get_weather"],
      ["exchange_rate", "currency_conversion"],
      ["stock", "get_stock_quote"],
      ["stock_price", "get_stock_quote"],
      ["share_price", "get_stock_quote"],
      ["market_cap", "get_market_cap"],
      ["market_capitalization", "get_market_cap"],
      ["get_market_capitalization", "get_market_cap"],
      ["company_value", "get_market_cap"],
      ["valuation", "get_market_cap"],
      ["crypto", "get_stock_quote"],
    ]);
    this.registerDefaults();
  }

  /**
   * Resolve tool alias to canonical name
   * @param {string} name
   * @returns {string}
   */
  resolveName(name) {
    if (!name) return "";
    const clean = String(name).trim();
    return this.aliases.get(clean) || clean;
  }

  /**
   * Register a new tool with contract validation
   * @param {Object} tool
   */
  register(tool) {
    if (!tool || !tool.name || typeof tool.name !== "string") {
      throw new Error("Tool registration failed: 'name' is required.");
    }
    if (!tool.description || typeof tool.description !== "string") {
      throw new Error(`Tool registration failed for '${tool.name}': 'description' is required.`);
    }
    if (typeof tool.execute !== "function") {
      throw new Error(`Tool registration failed for '${tool.name}': 'execute' must be an async function.`);
    }

    const definition = {
      name: tool.name,
      description: tool.description,
      category: tool.category || "general",
      risk: tool.risk || "low",
      timeoutMs: tool.timeoutMs || 5000,
      cacheTtlMs: tool.cacheTtlMs || 0,
      retryPolicy: tool.retryPolicy || { maxRetries: 0, backoffMs: 0 },
      authPolicy: tool.authPolicy || "public",
      parameters: tool.parameters || { type: "object", properties: {} },
      execute: tool.execute,
      formatVoiceSummary: tool.formatVoiceSummary || ((res) => JSON.stringify(res.data || res)),
    };

    this.tools.set(tool.name, definition);
  }

  /**
   * Register default tools
   */
  registerDefaults() {
    this.register(webSearchTool);
    this.register(newsSearchTool);
    this.register(openUrlTool);
    this.register(extractWebpageTool);
    this.register(searchAndReadTool);
    this.register(calculatorTool);
    this.register(currentTimeTool);
    this.register(weatherTool);
    this.register(currencyTool);
    this.register(stockMarketTool);
    this.register(marketCapTool);
  }

  get(name) {
    const canonical = this.resolveName(name);
    return this.tools.get(canonical) || null;
  }

  has(name) {
    const canonical = this.resolveName(name);
    return this.tools.has(canonical);
  }

  list() {
    return Array.from(this.tools.values());
  }

  /**
   * Export all tools formatted for OpenAI / Groq tool_calls
   * @returns {Array}
   */
  getGroqTools() {
    return this.list().map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Export all tools formatted for Google Gemini functionDeclarations
   * @returns {Array}
   */
  getGeminiFunctionDeclarations() {
    return this.list().map((tool) => {
      const geminiProps = {};
      const required = tool.parameters?.required || [];

      if (tool.parameters?.properties) {
        for (const [key, prop] of Object.entries(tool.parameters.properties)) {
          const type = (prop.type || "STRING").toUpperCase();
          geminiProps[key] = {
            type,
            description: prop.description || "",
          };
          if (type === "ARRAY") {
            geminiProps[key].items = {
              type: (prop.items?.type || "STRING").toUpperCase(),
            };
          }
        }
      }

      return {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "OBJECT",
          properties: geminiProps,
          ...(required.length > 0 ? { required } : {}),
        },
      };
    });
  }
}

export const toolRegistry = new ToolRegistry();
export default toolRegistry;
