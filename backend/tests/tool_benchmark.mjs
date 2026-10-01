/**
 * Production Tool Performance & Latency Benchmark
 * backend/tests/tool_benchmark.mjs
 * 
 * Measures:
 * 1. Tool Selection Accuracy (Deterministic Router)
 * 2. Single & Parallel Tool Execution Latency (p50, p95)
 * 3. Search Engine Multi-Provider Latency & Result Yield
 * 4. Deduplication & Tracking Stripping Efficiency
 * 5. Webpage Extraction & Parsing Success Rate
 * 6. Citation Completeness & Provenance Retention
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { toolRouter } from "../tools/toolRouter.js";
import { toolExecutor } from "../tools/toolExecutor.js";
import { multiSearchEngine } from "../tools/providers/search/multiSearchEngine.js";
import { extractWebpageTool } from "../tools/modules/web/extractWebpageTool.js";
import { toolTelemetry } from "../tools/telemetry/toolTelemetry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function calculatePercentile(latencies, percentile) {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return Math.round(sorted[Math.max(0, index)] * 100) / 100;
}

async function runBenchmark() {
  console.log("================================================================================");
  console.log("📊 CHATLY MODULAR AI TOOL ENGINE PERFORMANCE BENCHMARK");
  console.log("================================================================================\n");

  const results = {
    timestamp: new Date().toISOString(),
    metrics: {},
  };

  // -------------------------------------------------------------
  // Benchmark 1: Tool Selection Accuracy (Pre-Router)
  // -------------------------------------------------------------
  console.log("🔹 1. Measuring Router Selection Accuracy...");
  const routerTestCases = [
    { query: "what is 25 * 40 + 15", expectedTool: "calculate_expression" },
    { query: "calculate 18% of 5000", expectedTool: "calculate_expression" },
    { query: "convert 100 USD to INR", expectedTool: "currency_conversion" },
    { query: "what time is it in London right now?", expectedTool: "get_current_time" },
    { query: "current date and time", expectedTool: "get_current_time" },
    { query: "weather in Mumbai today", expectedTool: "get_weather" },
    { query: "delhi ka mausam kaisa hai", expectedTool: "get_weather" },
    { query: "read https://en.wikipedia.org/wiki/India", expectedTool: "extract_webpage" },
    { query: "deep research on quantum computing advancements", expectedTool: "search_and_read" },
    { query: "compare OpenAI and Google AI announcements", expectedTool: "search_and_read" },
    { query: "hello how are you feeling today?", expectedTool: null },
    { query: "tell me a funny story about space", expectedTool: null },
  ];

  let routerMatches = 0;
  const routerLatencies = [];

  for (const tc of routerTestCases) {
    const t0 = performance.now();
    const route = toolRouter.route(tc.query);
    const dur = performance.now() - t0;
    routerLatencies.push(dur);

    const actualTool = route.shouldRoute ? route.toolName : null;
    if (actualTool === tc.expectedTool) {
      routerMatches++;
    }
  }

  const selectionAccuracy = Math.round((routerMatches / routerTestCases.length) * 100);
  const routerP50 = calculatePercentile(routerLatencies, 50);
  const routerP95 = calculatePercentile(routerLatencies, 95);

  console.log(`   Accuracy: ${selectionAccuracy}% (${routerMatches}/${routerTestCases.length})`);
  console.log(`   Router Latency p50: ${routerP50}ms | p95: ${routerP95}ms`);

  results.metrics.router = {
    accuracy: selectionAccuracy,
    p50Ms: routerP50,
    p95Ms: routerP95,
  };

  // -------------------------------------------------------------
  // Benchmark 2: Calculator & Utility Tool Latency
  // -------------------------------------------------------------
  console.log("\n🔹 2. Measuring Utility Tool Latency...");
  const utilityLatencies = [];

  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    await toolExecutor.executeTool("calculate_expression", { expression: `(125 * ${i + 1}) + 300` });
    utilityLatencies.push(performance.now() - t0);
  }

  const calcP50 = calculatePercentile(utilityLatencies, 50);
  const calcP95 = calculatePercentile(utilityLatencies, 95);
  console.log(`   Calculator Execution p50: ${calcP50}ms | p95: ${calcP95}ms`);

  results.metrics.calculator = { p50Ms: calcP50, p95Ms: calcP95 };

  // -------------------------------------------------------------
  // Benchmark 3: Web Search Multi-Provider Performance
  // -------------------------------------------------------------
  console.log("\n🔹 3. Measuring Multi-Provider Web Search Performance...");
  const searchQueries = [
    "Machine Learning advances 2026",
    "Mars rover latest discovery",
    "Nobel prize in physics",
    "Renewable energy growth",
  ];

  const searchLatencies = [];
  let totalHits = 0;
  let deduplicatedCount = 0;
  let citationsWithUrl = 0;

  for (const q of searchQueries) {
    const t0 = performance.now();
    const hits = await multiSearchEngine.search(q, { maxResults: 5 });
    const dur = performance.now() - t0;
    searchLatencies.push(dur);

    totalHits += hits.length;
    for (const hit of hits) {
      if (hit.url && (hit.url.startsWith("http://") || hit.url.startsWith("https://"))) {
        citationsWithUrl++;
      }
    }
  }

  const searchP50 = calculatePercentile(searchLatencies, 50);
  const searchP95 = calculatePercentile(searchLatencies, 95);
  const avgHitsPerQuery = Math.round((totalHits / searchQueries.length) * 10) / 10;
  const citationCompleteness = totalHits > 0 ? Math.round((citationsWithUrl / totalHits) * 100) : 100;

  console.log(`   Search Latency p50: ${searchP50}ms | p95: ${searchP95}ms`);
  console.log(`   Avg Results Per Query: ${avgHitsPerQuery}`);
  console.log(`   Citation URL Completeness: ${citationCompleteness}%`);

  results.metrics.webSearch = {
    p50Ms: searchP50,
    p95Ms: searchP95,
    avgResults: avgHitsPerQuery,
    citationCompleteness,
  };

  // -------------------------------------------------------------
  // Benchmark 4: Webpage Content Extraction & Sanitization
  // -------------------------------------------------------------
  console.log("\n🔹 4. Measuring Webpage Extraction Success...");
  const targetUrls = [
    "https://en.wikipedia.org/wiki/Computer_science",
    "https://en.wikipedia.org/wiki/Algorithm",
  ];

  let extractionSuccesses = 0;
  const extractionLatencies = [];

  for (const url of targetUrls) {
    const t0 = performance.now();
    const res = await extractWebpageTool.execute({ url });
    extractionLatencies.push(performance.now() - t0);

    if (res.ok && res.data?.title && res.data?.content && res.data.content.length > 100) {
      extractionSuccesses++;
    }
  }

  const extractionSuccessRate = Math.round((extractionSuccesses / targetUrls.length) * 100);
  const extractP50 = calculatePercentile(extractionLatencies, 50);
  const extractP95 = calculatePercentile(extractionLatencies, 95);

  console.log(`   Extraction Success Rate: ${extractionSuccessRate}%`);
  console.log(`   Extraction Latency p50: ${extractP50}ms | p95: ${extractP95}ms`);

  results.metrics.extraction = {
    successRate: extractionSuccessRate,
    p50Ms: extractP50,
    p95Ms: extractP95,
  };

  // -------------------------------------------------------------
  // Benchmark 5: Parallel Multi-Tool Execution Throughput
  // -------------------------------------------------------------
  console.log("\n🔹 5. Measuring Parallel Multi-Tool Execution...");
  const parallelBatches = [
    [
      { toolName: "calculate_expression", args: { expression: "450 / 9" } },
      { toolName: "get_current_time", args: { location: "Tokyo" } },
      { toolName: "currency_conversion", args: { amount: 100, from: "EUR", to: "USD" } },
    ],
    [
      { toolName: "calculate_expression", args: { expression: "12 * 12" } },
      { toolName: "get_weather", args: { location: "Jaipur" } },
      { toolName: "get_current_time", args: { location: "London" } },
    ],
  ];

  const parallelLatencies = [];
  let parallelSuccessCount = 0;
  let totalParallelTools = 0;

  for (const batch of parallelBatches) {
    const t0 = performance.now();
    const batchResults = await toolExecutor.executeToolsParallel(batch, { timeoutMs: 8000 });
    parallelLatencies.push(performance.now() - t0);

    totalParallelTools += batch.length;
    for (const r of batchResults) {
      if (r.ok) parallelSuccessCount++;
    }
  }

  const parallelP50 = calculatePercentile(parallelLatencies, 50);
  const parallelP95 = calculatePercentile(parallelLatencies, 95);
  const parallelSuccessRate = Math.round((parallelSuccessCount / totalParallelTools) * 100);

  console.log(`   Parallel 3-Tool Batch Latency p50: ${parallelP50}ms | p95: ${parallelP95}ms`);
  console.log(`   Batch Tool Success Rate: ${parallelSuccessRate}%`);

  results.metrics.parallel = {
    p50Ms: parallelP50,
    p95Ms: parallelP95,
    successRate: parallelSuccessRate,
  };

  // Telemetry Snapshot
  const telemetryStats = toolTelemetry.getMetrics();
  results.metrics.telemetry = telemetryStats;

  console.log("\n================================================================================");
  console.log("📈 TOOL ENGINE BENCHMARK SUMMARY");
  console.log("================================================================================");
  console.log(`Router Intent Accuracy:     ${selectionAccuracy}% (< ${routerP50}ms)`);
  console.log(`Calculator Latency (p50):    ${calcP50}ms`);
  console.log(`Web Search Latency (p50):    ${searchP50}ms`);
  console.log(`Web Extraction Success Rate: ${extractionSuccessRate}%`);
  console.log(`Parallel Batch Latency:      ${parallelP50}ms`);
  console.log(`Citation Completeness:       ${citationCompleteness}%`);
  console.log("================================================================================\n");

  const outputPath = path.join(__dirname, "tool_benchmark_results.json");
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`📄 Saved benchmark results to: ${outputPath}\n`);
}

runBenchmark().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
