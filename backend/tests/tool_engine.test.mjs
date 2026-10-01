/**
 * Automated Test Suite for Chatly Modular AI Tool Engine
 * backend/tests/tool_engine.test.mjs
 */

import { toolRegistry } from "../tools/toolRegistry.js";
import { toolExecutor } from "../tools/toolExecutor.js";
import { toolRouter } from "../tools/toolRouter.js";
import { toolCache } from "../tools/caching/toolCache.js";

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
    console.error(`  ❌ FAIL (Exception): ${name}`, err.message);
    failedTests++;
  }
}

async function runToolEngineSuite() {
  console.log("================================================================================");
  console.log("🧪 CHATLY MODULAR TOOL ENGINE TEST SUITE");
  console.log("================================================================================\n");

  // 1. Tool Registration & Schema Generation
  console.log("🔹 1. Tool Registration & Schema Mapping");
  await test("Tool Registry contains all core production tools", () => {
    const expected = [
      "web_search",
      "news_search",
      "open_url",
      "extract_webpage",
      "search_and_read",
      "calculate_expression",
      "get_current_time",
      "get_weather",
      "currency_conversion",
    ];
    return expected.every((name) => toolRegistry.has(name));
  });

  await test("Legacy tool alias 'scrape_web_page' resolves to 'extract_webpage'", () => {
    return toolRegistry.resolveName("scrape_web_page") === "extract_webpage";
  });

  await test("Groq tool schema generation outputs valid OpenAI-compatible tools", () => {
    const groqTools = toolRegistry.getGroqTools();
    return (
      Array.isArray(groqTools) &&
      groqTools.length >= 9 &&
      groqTools.every((t) => t.type === "function" && t.function.name && t.function.parameters)
    );
  });

  await test("Gemini function declarations format matches Google GenAI specification", () => {
    const geminiDeclarations = toolRegistry.getGeminiFunctionDeclarations();
    return (
      Array.isArray(geminiDeclarations) &&
      geminiDeclarations.length >= 9 &&
      geminiDeclarations.every((d) => d.name && d.description && d.parameters)
    );
  });

  // 2. Schema Validation & Argument Guarding
  console.log("\n🔹 2. Schema Validation & Argument Guarding");
  await test("Missing required argument returns structured INVALID_ARGUMENTS error", async () => {
    const res = await toolExecutor.executeTool("calculate_expression", {});
    return res.ok === false && res.error?.code === "INVALID_ARGUMENTS";
  });

  await test("Unknown tool returns structured UNKNOWN_TOOL error without crashing", async () => {
    const res = await toolExecutor.executeTool("non_existent_fake_tool", {});
    return res.ok === false && res.error?.code === "UNKNOWN_TOOL";
  });

  // 3. Normalized Return Contract
  console.log("\n🔹 3. Normalized Result Contract");
  await test("Successful tool execution returns valid normalized contract", async () => {
    const res = await toolExecutor.executeTool("calculate_expression", { expression: "25 * 4" });
    return (
      res.ok === true &&
      res.tool === "calculate_expression" &&
      res.data &&
      res.data.numericResult === 100 &&
      Array.isArray(res.sources) &&
      typeof res.metadata === "object" &&
      typeof res.voiceSummary === "string"
    );
  });

  await test("Current time tool returns valid timezone-aware time contract", async () => {
    const res = await toolExecutor.executeTool("get_current_time", { location: "Tokyo" });
    return res.ok === true && res.data?.location === "Tokyo" && res.voiceSummary.includes("Tokyo");
  });

  await test("Currency conversion tool converts values using live/bridge rates", async () => {
    const res = await toolExecutor.executeTool("currency_conversion", { amount: 100, from: "USD", to: "EUR" });
    return res.ok === true && res.data?.from === "USD" && res.data?.to === "EUR" && res.data?.convertedAmount > 0;
  });

  // 4. Timeout, Retry, and Backoff Policies
  console.log("\n🔹 4. Timeout & Retry Resilience");
  await test("Tool exceeding timeout terminates cleanly with TIMEOUT error", async () => {
    // Register temporary mock slow tool
    toolRegistry.register({
      name: "mock_slow_tool",
      description: "Test slow tool",
      category: "test",
      risk: "low",
      timeoutMs: 80,
      retryPolicy: { maxRetries: 0, backoffMs: 0 },
      parameters: { type: "object", properties: {} },
      async execute() {
        await new Promise((r) => setTimeout(r, 300));
        return { ok: true, data: "finished" };
      },
      formatVoiceSummary: () => "Done",
    });

    const res = await toolExecutor.executeTool("mock_slow_tool", {});
    return res.ok === false && res.error?.code === "TIMEOUT";
  });

  await test("Failing tool with retry policy retries and succeeds", async () => {
    let attempts = 0;
    toolRegistry.register({
      name: "mock_retry_tool",
      description: "Test retry tool",
      category: "test",
      risk: "low",
      timeoutMs: 1000,
      retryPolicy: { maxRetries: 2, backoffMs: 20 },
      parameters: { type: "object", properties: {} },
      async execute() {
        attempts++;
        if (attempts < 2) {
          throw new Error("Temporary network glitch");
        }
        return { ok: true, tool: "mock_retry_tool", data: { attempts } };
      },
      formatVoiceSummary: () => "Recovered",
    });

    const res = await toolExecutor.executeTool("mock_retry_tool", {});
    return res.ok === true && attempts === 2 && res.data.attempts === 2;
  });

  // 5. Parallel Execution & Partial Failure
  console.log("\n🔹 5. Parallel Execution & Partial Failure Resilience");
  await test("executeToolsParallel executes independent tools concurrently", async () => {
    const t0 = performance.now();
    const calls = [
      { toolName: "calculate_expression", args: { expression: "100 + 200" } },
      { toolName: "get_current_time", args: { location: "London" } },
      { toolName: "currency_conversion", args: { amount: 50, from: "EUR", to: "USD" } },
    ];

    const results = await toolExecutor.executeToolsParallel(calls, { timeoutMs: 5000 });
    const duration = performance.now() - t0;

    const allOk = results.every((r) => r.ok === true);
    const orderPreserved =
      results[0].tool === "calculate_expression" &&
      results[1].tool === "get_current_time" &&
      results[2].tool === "currency_conversion";

    return allOk && orderPreserved && duration < 3000;
  });

  await test("Partial failure does not crash parallel batch", async () => {
    const calls = [
      { toolName: "calculate_expression", args: { expression: "50 * 2" } },
      { toolName: "calculate_expression", args: {} }, // Invalid: missing expression
      { toolName: "get_current_time", args: { location: "New York" } },
    ];

    const results = await toolExecutor.executeToolsParallel(calls, { timeoutMs: 3000 });
    return (
      results.length === 3 &&
      results[0].ok === true &&
      results[1].ok === false &&
      results[1].error?.code === "INVALID_ARGUMENTS" &&
      results[2].ok === true
    );
  });

  // 6. Duplicate Call Dropping & Tool Budget
  console.log("\n🔹 6. Budget & Deduplication Guard");
  await test("executeToolsParallel deduplicates identical simultaneous tool calls", async () => {
    const calls = [
      { toolName: "calculate_expression", args: { expression: "42 * 2" } },
      { toolName: "calculate_expression", args: { expression: "42 * 2" } }, // Duplicate!
    ];

    const results = await toolExecutor.executeToolsParallel(calls);
    return results.length === 2 && results[0].ok === true && results[1].ok === true;
  });

  // 7. Scoped Cache Isolation
  console.log("\n🔹 7. Scoped Cache Partitioning");
  await test("Cache segregates entries by namespace and key", () => {
    toolCache.set("weather", "jaipur", { temp: 32 });
    toolCache.set("search", "jaipur", { query: "jaipur" });

    const wItem = toolCache.get("weather", "jaipur");
    const sItem = toolCache.get("search", "jaipur");
    const cItem = toolCache.get("currency", "jaipur");

    return wItem?.temp === 32 && sItem?.query === "jaipur" && cItem === null;
  });

  // 8. Deterministic Pre-Router
  console.log("\n🔹 8. Deterministic Tool Pre-Router");
  await test("Router fast-tracks math expressions", () => {
    const route = toolRouter.route("what is 45 * 12 + 10");
    return route.shouldRoute && route.toolName === "calculate_expression";
  });

  await test("Router fast-tracks current time queries", () => {
    const route = toolRouter.route("what time is it in Tokyo right now?");
    return route.shouldRoute && route.toolName === "get_current_time" && route.args.location === "Tokyo";
  });

  await test("Router fast-tracks weather questions", () => {
    const route = toolRouter.route("how is the weather in Paris today?");
    return route.shouldRoute && route.toolName === "get_weather" && route.args.location === "Paris";
  });

  await test("Router fast-tracks currency conversion questions", () => {
    const route = toolRouter.route("convert 100 USD to INR");
    return (
      route.shouldRoute &&
      route.toolName === "currency_conversion" &&
      route.args.amount === 100 &&
      route.args.from === "USD" &&
      route.args.to === "INR"
    );
  });

  await test("Router routes deep research query to search_and_read", () => {
    const route = toolRouter.route("search and read the latest research on solid state batteries");
    return route.shouldRoute && route.toolName === "search_and_read";
  });

  await test("Router leaves general conversational turns for model", () => {
    const route = toolRouter.route("hello how was your day?");
    return route.shouldRoute === false;
  });

  console.log("\n================================================================================");
  console.log(`TOTAL TESTS: ${totalTests}`);
  console.log(`PASSED:      ${passedTests}`);
  console.log(`FAILED:      ${failedTests}`);
  console.log("================================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runToolEngineSuite().catch((err) => {
  console.error("Fatal suite crash:", err);
  process.exit(1);
});
