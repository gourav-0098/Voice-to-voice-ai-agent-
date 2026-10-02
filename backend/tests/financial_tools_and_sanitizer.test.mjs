/**
 * Focused Verification Test Suite
 * backend/tests/financial_tools_and_sanitizer.test.mjs
 *
 * Verifies:
 * 1. Router distinction: get_stock_quote (share price) vs get_market_cap (total market cap)
 * 2. Real execution of "NVIDIA stock price", "NVIDIA market cap", "Bitcoin price", "Apple company value"
 * 3. Asset type handling (EQUITY, CRYPTO, ETF, INDEX)
 * 4. Data source, timestamp, and delay transparency
 * 5. Sanitizer preserving normal conversational text with "print" or "search"
 * 6. Sanitizer cleanly stripping code fences and toolcode fallbacks
 */

import { toolRouter } from "../tools/toolRouter.js";
import { toolRegistry } from "../tools/toolRegistry.js";
import { stockMarketTool } from "../tools/modules/utility/stockMarketTool.js";
import { marketCapTool } from "../tools/modules/utility/marketCapTool.js";
import { sanitizeSpokenReply } from "../services/thinkingEngineService.js";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    const res = await fn();
    if (res === false) {
      console.error(`  ❌ FAIL: ${name}`);
      failedTests++;
    } else {
      console.log(`  ✅ PASS: ${name}`);
      passedTests++;
    }
  } catch (err) {
    console.error(`  ❌ FAIL (Exception): ${name} ->`, err.message);
    failedTests++;
  }
}

async function runTestSuite() {
  console.log("================================================================================");
  console.log("🧪 VERIFICATION SUITE: FINANCIAL ROUTING, DISTINCTION & SPEECH SANITIZER");
  console.log("================================================================================\n");

  // SECTION 1: Semantic Routing Distinction
  console.log("🔹 1. Semantic Router Distinction (Stock Quote vs Market Cap vs Normal Speech)");

  await test("Route 'NVIDIA stock price' -> get_stock_quote", () => {
    const route = toolRouter.route("NVIDIA stock price");
    return route.shouldRoute === true && route.toolName === "get_stock_quote" && route.args.symbol.toLowerCase() === "nvidia";
  });

  await test("Route 'NVIDIA market cap' -> get_market_cap", () => {
    const route = toolRouter.route("NVIDIA market cap");
    return route.shouldRoute === true && route.toolName === "get_market_cap" && route.args.symbol.toLowerCase() === "nvidia";
  });

  await test("Route 'Bitcoin price' -> get_stock_quote", () => {
    const route = toolRouter.route("Bitcoin price");
    return route.shouldRoute === true && route.toolName === "get_stock_quote" && route.args.symbol.toLowerCase() === "bitcoin";
  });

  await test("Route 'Apple company value' -> get_market_cap", () => {
    const route = toolRouter.route("Apple company value");
    return route.shouldRoute === true && route.toolName === "get_market_cap" && route.args.symbol.toLowerCase() === "apple";
  });

  await test("Route Hinglish 'facebook ki market value kya h aaj ki' -> get_market_cap", () => {
    const route = toolRouter.route("facebook ki market value kya h aaj ki");
    return route.shouldRoute === true && route.toolName === "get_market_cap" && route.args.symbol.toLowerCase() === "facebook";
  });

  await test("Normal conversational text containing 'print' does NOT trigger financial tools", () => {
    const route = toolRouter.route("Can you print the summary for my meeting tomorrow?");
    return route.toolName !== "get_stock_quote" && route.toolName !== "get_market_cap";
  });

  await test("Normal conversational text containing 'search' does NOT trigger financial tools", () => {
    const route = toolRouter.route("I want to search my memories for what we discussed yesterday.");
    return route.toolName !== "get_stock_quote" && route.toolName !== "get_market_cap";
  });

  // SECTION 2: Tool Registry Canonical Names & Aliases
  console.log("\n🔹 2. Tool Registry Canonical Names & Aliases");

  await test("Tool registry contains 'get_stock_quote' and 'get_market_cap'", () => {
    return toolRegistry.has("get_stock_quote") && toolRegistry.has("get_market_cap");
  });

  await test("Alias 'market_cap' resolves to canonical 'get_market_cap'", () => {
    return toolRegistry.resolveName("market_cap") === "get_market_cap";
  });

  await test("Alias 'company_value' resolves to canonical 'get_market_cap'", () => {
    return toolRegistry.resolveName("company_value") === "get_market_cap";
  });

  await test("Alias 'stock_price' resolves to canonical 'get_stock_quote'", () => {
    return toolRegistry.resolveName("stock_price") === "get_stock_quote";
  });

  // SECTION 3: Live Execution & Semantic Distinction
  console.log("\n🔹 3. Live Tool Execution, Data Sources, Timestamps & Delay Disclosures");

  await test("Execute get_stock_quote for 'NVIDIA stock price' (EQUITY, Per-Share Price, 15m delay)", async () => {
    const res = await stockMarketTool.execute({ symbol: "NVIDIA" });
    if (!res.ok) throw new Error(res.error?.message || "Tool execution failed");
    const d = res.data;
    console.log(`     -> NVDA Share Price: $${d.currentPrice} | Asset: ${d.assetType} | Delayed: ${d.isDelayed} | Source: ${d.source}`);
    return (
      d.symbol === "NVDA" &&
      d.assetType === "EQUITY" &&
      typeof d.currentPrice === "number" &&
      d.currentPrice > 50 &&
      d.currentPrice < 1000 && // Clearly per-share price, not total valuation!
      d.isDelayed === true &&
      typeof d.marketTime === "string" &&
      typeof d.timestamp === "string" &&
      d.source.includes("Yahoo Finance")
    );
  });

  await test("Execute get_market_cap for 'NVIDIA market cap' (EQUITY, Total Market Cap in Trillions)", async () => {
    const res = await marketCapTool.execute({ symbol: "NVIDIA" });
    if (!res.ok) throw new Error(res.error?.message || "Tool execution failed");
    const d = res.data;
    console.log(`     -> NVDA Market Cap: ${d.marketCapFormatted} | Asset: ${d.assetType} | Source: ${d.source}`);
    return (
      d.symbol === "NVDA" &&
      d.assetType === "EQUITY" &&
      typeof d.marketCapFormatted === "string" &&
      d.marketCapFormatted.includes("Trillion") && // Clearly total market cap ($5+ Trillion), NOT share price ($230)!
      d.isDelayed === true &&
      typeof d.timestamp === "string" &&
      d.source.includes("CompaniesMarketCap")
    );
  });

  await test("Execute get_stock_quote for 'Bitcoin price' (CRYPTO, Real-Time 24/7, No Delay)", async () => {
    const res = await stockMarketTool.execute({ symbol: "Bitcoin" });
    if (!res.ok) throw new Error(res.error?.message || "Tool execution failed");
    const d = res.data;
    console.log(`     -> BTC Price: $${d.currentPrice} | Asset: ${d.assetType} | Delayed: ${d.isDelayed} | Source: ${d.source}`);
    return (
      d.assetType === "CRYPTO" &&
      typeof d.currentPrice === "number" &&
      d.currentPrice > 10000 &&
      d.isDelayed === false &&
      d.delayNotice === "Real-time" &&
      d.source.includes("Crypto")
    );
  });

  await test("Execute get_market_cap for 'Apple company value' (EQUITY, Total Valuation in Trillions)", async () => {
    const res = await marketCapTool.execute({ symbol: "Apple" });
    if (!res.ok) throw new Error(res.error?.message || "Tool execution failed");
    const d = res.data;
    console.log(`     -> Apple Market Cap: ${d.marketCapFormatted} | Asset: ${d.assetType} | Source: ${d.source}`);
    return (
      d.symbol === "AAPL" &&
      d.assetType === "EQUITY" &&
      typeof d.marketCapFormatted === "string" &&
      d.marketCapFormatted.includes("Trillion") &&
      d.isDelayed === true &&
      typeof d.timestamp === "string"
    );
  });

  await test("Asset type handling: ETF and INDEX quotes", async () => {
    const spy = await stockMarketTool.execute({ symbol: "SPY" });
    const sp500 = await stockMarketTool.execute({ symbol: "^GSPC" });
    return spy.ok && spy.data.assetType === "ETF" && sp500.ok && sp500.data.assetType === "INDEX";
  });

  // SECTION 4: Regex Sanitizer Speech Integrity & Safety
  console.log("\n🔹 4. Regex Sanitizer Speech Integrity & Last-Resort Safety");

  await test("Sanitizer preserves normal conversational text containing 'print'", () => {
    const input = "Please print the quarterly financial report and share the printed copy with the team.";
    const sanitized = sanitizeSpokenReply(input);
    return sanitized === input;
  });

  await test("Sanitizer preserves normal conversational text containing 'search'", () => {
    const input = "I conducted a thorough search of our archive to find the original design document.";
    const sanitized = sanitizeSpokenReply(input);
    return sanitized === input;
  });

  await test("Sanitizer preserves normal conversational text containing 'print' and 'search' together", () => {
    const input = "You can search the library catalog online and print the borrowing card directly.";
    const sanitized = sanitizeSpokenReply(input);
    return sanitized === input;
  });

  await test("Sanitizer strips code fence markdown blocks without losing surrounding speech", () => {
    const input = "Here is the summary of the stock performance.\n```json\n{\"symbol\": \"NVDA\", \"price\": 230}\n```\nNVIDIA gained 1.09% during the session.";
    const sanitized = sanitizeSpokenReply(input);
    return sanitized === "Here is the summary of the stock performance.\n\nNVIDIA gained 1.09% during the session.";
  });

  await test("Sanitizer strips hallucinated 'toolcode print(web_search(...))' blocks", () => {
    const input = "toolcode\nprint(web_search(query=\"Nvidia stock price\"))";
    const sanitized = sanitizeSpokenReply(input);
    return sanitized === "";
  });

  await test("Sanitizer strips introductory Hindi filler promises ('Ek minute, main abhi check karke batata hoon')", () => {
    const input = "Ek minute, main abhi check karke batata hoon. Nvidia ka current stock price $230.86 hai.";
    const sanitized = sanitizeSpokenReply(input);
    return sanitized === "Nvidia ka current stock price $230.86 hai.";
  });

  await test("Sanitizer strips introductory English tool promises ('I will use the web_search tool')", () => {
    const input = "I will use the web_search tool to look up the quote. Apple is valued at $4.8 Trillion USD.";
    const sanitized = sanitizeSpokenReply(input);
    return sanitized === "Apple is valued at $4.8 Trillion USD.";
  });

  // SUMMARY
  console.log("\n================================================================================");
  console.log(`📊 TEST SUITE SUMMARY: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log("================================================================================");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Fatal Test Suite Error:", err);
  process.exit(1);
});
