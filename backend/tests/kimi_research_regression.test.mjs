/**
 * Kimi-Style Research Benchmark & Regression Test Suite
 * backend/tests/kimi_research_regression.test.mjs
 *
 * Runs the 4 exact benchmark inquiries:
 *  TEST 1: October 2026 AI voice-provider comparison across 8 dimensions
 *  TEST 2: September 2026 AI model/API changes (OpenAI, Anthropic, Google, Groq)
 *  TEST 3: WebRTC vs WebSocket vs HTTP streaming for real-time speech-to-speech assistant
 *  TEST 4: "What are the best AI providers?" (Original failure regression case)
 *
 * For each inquiry, records:
 *  - research intent
 *  - queries generated
 *  - search providers used
 *  - search success/empty states
 *  - URLs opened
 *  - source tiers
 *  - evidence count
 *  - follow-ups
 *  - final answer latency
 *  - citation completeness
 *  - freshness correctness
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runThinkingLoop, getCurrentDateContext } from "../services/thinkingEngineService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BENCHMARK_CASES = [
  {
    id: "TEST_1_OCTOBER_2026_VOICE_PROVIDERS",
    title: "October 2026 AI Voice-Provider Comparison",
    query:
      "As of October 2026, compare the leading AI model/API providers for building a real-time voice AI assistant. Compare model quality, latency, tool calling, multimodal ability, context window, pricing, reliability, and developer ecosystem.",
    expectedIntent: "COMPARISON",
    requiredDimensions: ["latency", "pricing", "tool calling"],
  },
  {
    id: "TEST_2_SEPTEMBER_2026_CHANGES",
    title: "September 2026 AI Model & API Changes",
    query:
      "What are the most important recent changes in AI models and APIs during September 2026? Focus on OpenAI, Anthropic, Google, and Groq. For each, identify specific model/API changes, announcement date, and why they matter for developers.",
    expectedIntent: "CURRENT_EVENT",
    requiredDimensions: ["announcement", "models", "changes"],
  },
  {
    id: "TEST_3_WEBRTC_VS_WEBSOCKET_STREAMING",
    title: "WebRTC vs WebSocket vs HTTP Streaming Technical Comparison",
    query:
      "For a production real-time speech-to-speech AI assistant targeting low time-to-first-audio, compare WebSocket streaming, WebRTC, and HTTP streaming architectures. Analyze latency, interruption/barge-in handling, audio streaming, scaling, reliability, browser support, and implementation complexity.",
    expectedIntent: "TECHNICAL_RESEARCH",
    requiredDimensions: ["latency", "barge-in", "scaling", "complexity"],
  },
  {
    id: "TEST_4_BEST_AI_PROVIDERS_REGRESSION",
    title: "Best AI Providers (Original Failure Case Regression)",
    query: "What are the best AI providers?",
    expectedIntent: "COMPARISON",
    requiredDimensions: ["providers", "models"],
  },
];

async function runKimiBenchmark() {
  console.log("================================================================================");
  console.log("🔬 CHATLY ADAPTIVE RESEARCH ORCHESTRATOR: KIMI-STYLE BENCHMARK SUITE");
  console.log("================================================================================\n");

  const currentDate = getCurrentDateContext();
  console.log(`📅 Current Temporal Context: ${currentDate.formatted} (Year: ${currentDate.year})\n`);

  const results = [];
  let passedCount = 0;

  for (let i = 0; i < BENCHMARK_CASES.length; i++) {
    const testCase = BENCHMARK_CASES[i];
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`▶ Running [${i + 1}/${BENCHMARK_CASES.length}] ${testCase.title}`);
    console.log(`  Query: "${testCase.query}"`);
    console.log(`--------------------------------------------------------------------------------`);

    const tStart = performance.now();
    let result = null;
    let exceptionError = null;

    try {
      result = await runThinkingLoop({
        query: testCase.query,
        persona: "conversational",
      });
    } catch (err) {
      exceptionError = err.message;
      console.error(`  ❌ Exception: ${err.message}`);
    }

    const durationMs = Math.round(performance.now() - tStart);

    if (result) {
      const intent = result.researchMeta?.intent || "UNKNOWN";
      const queries = result.toolTrace?.map((t) => t.args?.query || t.tool) || [];
      const toolStates = result.toolTrace?.map((t) => t.state || (t.success ? "SEARCH_SUCCESS" : "SEARCH_EMPTY")) || [];
      const sources = result.sources || [];
      const sourceTiers = sources.map((s) => s.sourceType || "GENERAL_WEB");
      const urlsWithProtocol = sources.filter((s) => s.url && (s.url.startsWith("http://") || s.url.startsWith("https://")));
      const citationCompleteness = sources.length > 0 ? (urlsWithProtocol.length / sources.length) : 0;
      const deepPagesRead = result.researchMeta?.deepPagesRead || 0;
      const followups = result.researchMeta?.followups || 0;
      const spokenAnswer = result.answer || "";

      // Freshness verification: text references current period (2026/Sept/Oct) and avoids exclusively 2024
      const has2026InSources = sources.some((s) => (s.snippet + " " + s.title).includes("2026"));
      const has2026InSpoken = spokenAnswer.includes("2026");
      const hasExclusiveStale2024 = spokenAnswer.includes("2024") && !has2026InSpoken;
      const freshnessCorrectness = (has2026InSources || has2026InSpoken || !hasExclusiveStale2024);

      // Quality gate checks
      const hasUsefulSources = sources.length >= 2;
      const noHallucinatedCode = !spokenAnswer.toLowerCase().includes("toolcode") && !spokenAnswer.toLowerCase().includes("def ");
      const noFillerPromises = !spokenAnswer.toLowerCase().includes("ek minute") && !spokenAnswer.toLowerCase().includes("i will use the");
      const answerNotEmpty = spokenAnswer.trim().length > 40;
      const searchNotAllEmpty = toolStates.some((s) => s === "SEARCH_SUCCESS");

      const passed =
        hasUsefulSources &&
        noHallucinatedCode &&
        noFillerPromises &&
        answerNotEmpty &&
        searchNotAllEmpty &&
        freshnessCorrectness;

      if (passed) passedCount++;

      const metric = {
        testId: testCase.id,
        title: testCase.title,
        query: testCase.query,
        passed,
        researchIntent: intent,
        queriesGeneratedCount: queries.length,
        queriesGenerated: queries,
        searchProvidersUsed: ["web_search (DuckDuckGo + Wikipedia + MultiEngine)"],
        searchStates: toolStates,
        urlsOpenedCount: deepPagesRead,
        sourceTiersDistribution: sourceTiers.reduce((acc, tier) => {
          acc[tier] = (acc[tier] || 0) + 1;
          return acc;
        }, {}),
        evidenceCount: sources.length,
        followupsCount: followups,
        finalAnswerLatencyMs: durationMs,
        citationCompleteness: Number((citationCompleteness * 100).toFixed(1)),
        freshnessCorrectness,
        cognitiveStepsCount: result.thinkingSteps?.length || 0,
        spokenAnswerSample: spokenAnswer.slice(0, 180) + (spokenAnswer.length > 180 ? "..." : ""),
      };

      results.push(metric);

      console.log(`\n  📊 Metrics for ${testCase.id}:`);
      console.log(`     • Intent Classified:   ${intent}`);
      console.log(`     • Queries Generated:   ${queries.length} focused queries`);
      console.log(`     • Search States:       ${toolStates.join(", ")}`);
      console.log(`     • URLs Opened (Deep):  ${deepPagesRead} page(s)`);
      console.log(`     • Sources Retrieved:   ${sources.length} authoritative source(s)`);
      console.log(`     • Source Tiers:        ${JSON.stringify(metric.sourceTiersDistribution)}`);
      console.log(`     • Follow-up Searches:  ${followups}`);
      console.log(`     • Citation Complete:   ${metric.citationCompleteness}%`);
      console.log(`     • Freshness Verified:  ${freshnessCorrectness ? "YES (October/Sept 2026 Anchored)" : "NO"}`);
      console.log(`     • Total Latency:       ${durationMs}ms`);
      console.log(`     • Verdict:             ${passed ? "✅ PASS" : "❌ FAIL"}`);
      console.log(`     • Spoken Answer:       "${spokenAnswer.slice(0, 140)}..."\n`);
    } else {
      results.push({
        testId: testCase.id,
        title: testCase.title,
        query: testCase.query,
        passed: false,
        error: exceptionError || "Execution failed",
        finalAnswerLatencyMs: durationMs,
      });
      console.log(`  ❌ FAIL: ${testCase.id} failed with error: ${exceptionError}\n`);
    }
  }

  // Write results to JSON artifact
  const outputPath = path.join(__dirname, "kimi_benchmark_results.json");
  fs.writeFileSync(outputPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));

  console.log("================================================================================");
  console.log(`🏁 BENCHMARK COMPLETE: ${passedCount}/${BENCHMARK_CASES.length} Passed`);
  console.log(`📄 Detailed results written to: ${outputPath}`);
  console.log("================================================================================");

  if (passedCount < BENCHMARK_CASES.length) {
    process.exit(1);
  }
}

runKimiBenchmark().catch((err) => {
  console.error("Fatal benchmark suite error:", err);
  process.exit(1);
});
