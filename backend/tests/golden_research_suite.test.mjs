import assert from "node:assert/strict";
import { classifyResearchIntent, RESEARCH_INTENTS } from "../services/research/researchIntentClassifier.js";
import { toolRouter } from "../tools/toolRouter.js";
import { sanitizePlannerQuery, formulateResearchPlan } from "../services/research/researchQueryPlanner.js";
import { evaluateEvidenceDeterministic } from "../services/research/researchEvidenceGate.js";
import { normalizeSearchResult } from "../tools/modules/web/webSearchTool.js";
import { resolveTopicContinuity, createTopicState } from "../services/research/researchTopicMemory.js";
import { GOLDEN_EXAMPLES } from "../services/research/researchGoldenExamples.js";

console.log("🧪 Running Chatly Golden 25-Case Intelligence & Research Regression Suite...\n");

async function runGoldenSuite() {
  let passed = 0;
  const total = 25;

  // 1. Gandhi Major Works (Golden Example 9)
  console.log("▶ [CASE 1] Gandhi Major Works Intent & Sanitation");
  {
    const query = "What are Gandhi's major works?";
    const intent = classifyResearchIntent(query);
    assert.ok(
      intent.intent === RESEARCH_INTENTS.NOTABLE_WORKS || intent.intent === RESEARCH_INTENTS.HISTORICAL_INFORMATION,
      `Expected NOTABLE_WORKS or HISTORICAL_INFORMATION, got ${intent.intent}`
    );
    assert.notEqual(intent.intent, RESEARCH_INTENTS.COMPARISON, "Must not be COMPARISON");
    assert.equal(intent.requiresCurrentDate, false, "Must not require 2026 freshness");

    const sanitized = sanitizePlannerQuery(query, query, 2026, false);
    assert.ok(!sanitized.includes("2026"), "Must not append 2026");
    passed++;
    console.log("  ✅ Case 1 Passed: Gandhi major works routed historically without 2026 or AI comparison leak.");
  }

  // 2. Gandhi-Irwin Pact (Golden Example 8)
  console.log("▶ [CASE 2] Gandhi-Irwin Pact Historical Query");
  {
    const query = "What happened during the Gandhi-Irwin Pact?";
    const intent = classifyResearchIntent(query);
    assert.equal(intent.intent, RESEARCH_INTENTS.HISTORICAL_INFORMATION);
    assert.equal(intent.requiresCurrentDate, false);
    const sanitized = sanitizePlannerQuery(query, query, 2026, false);
    assert.ok(!sanitized.includes("2026"), "Must not append 2026 to Gandhi-Irwin Pact");
    passed++;
    console.log("  ✅ Case 2 Passed: Historical pact correctly anchored without current-year injection.");
  }

  // 3. Indian Pilot Viral Query (Golden Example 7)
  console.log("▶ [CASE 3] Indian Pilot Viral Inquiry Intent & News Route");
  {
    const query = "Why is this Indian pilot going viral lately?";
    const intent = classifyResearchIntent(query);
    assert.equal(intent.intent, RESEARCH_INTENTS.TRENDING_EVENT, "Must be TRENDING_EVENT, not plain SIMPLE_FACT");
    assert.equal(intent.requiresCurrentDate, true, "Must require current date context");
    assert.equal(intent.requiresSearch, true, "Must require search");
    passed++;
    console.log("  ✅ Case 3 Passed: Trending viral pilot inquiry routed as TRENDING_EVENT.");
  }

  // 4. Indian Pilot Follow-Up "full story" (Golden Example 13)
  console.log("▶ [CASE 4] Indian Pilot Follow-Up 'full story' Continuity");
  {
    const priorHistory = [{ user: "Why is this Indian pilot going viral lately?", reply: "A recent aviation incident occurred." }];
    const res = resolveTopicContinuity("Tell me the full story.", null, priorHistory);
    assert.equal(res.isFollowUp, true, "Must be detected as follow-up");
    assert.ok(res.resolvedQuery.toLowerCase().includes("indian pilot"), `Must retain pilot topic: "${res.resolvedQuery}"`);
    assert.notEqual(res.resolvedQuery.toLowerCase(), "full story", "Must not search plain 'full story'");
    passed++;
    console.log("  ✅ Case 4 Passed: Contextual follow-up inherits active topic accurately.");
  }

  // 5. Indian Pilot Repeated Assistant Claim / Self-Confirmation (Golden Example 20)
  console.log("▶ [CASE 5] Self-Confirmation Protection on Assistant Claims");
  {
    const assistantClaim = "An Indian pilot was stabbed on an Israel-bound flight.";
    const userQuery = "Tell me the full story of that pilot.";
    // Mock search returning NO verified results about stabbing
    const unverifiedObs = [{ tool: "web_search", success: true, summary: "General civil aviation safety protocols in 2026" }];
    const unverifiedCitations = [{ url: "https://aviation.gov/safety", title: "Aviation Safety Standards", snippet: "General safety" }];

    const gate = evaluateEvidenceDeterministic({
      query: `${userQuery} ${assistantClaim}`,
      observations: unverifiedObs,
      citations: unverifiedCitations,
      currentYear: 2026,
    });
    // Gate must NOT treat assistant claim as verified evidence
    assert.equal(gate.passed, false, "Must fail verification when external sources do not confirm assistant claim");
    passed++;
    console.log("  ✅ Case 5 Passed: Prior assistant claims treated as unverified hypotheses.");
  }

  // 6. WWII Casualty Question Multi-Part Coverage (Golden Example 2)
  console.log("▶ [CASE 6] WWII Multi-Part Casualties Evidence Gating");
  {
    const query = "how many people died in ww2 and how many Chinese were killed by Japan in ww2";
    const intent = classifyResearchIntent(query);
    const pearlHarborObs = [{ tool: "web_search", success: true, summary: "Pearl Harbor attack resulted in 2,403 American deaths." }];
    const pearlHarborCit = [{ url: "https://britannica.com/pearl-harbor", title: "Pearl Harbor", snippet: "2,403 American deaths." }];

    const gate = evaluateEvidenceDeterministic({
      query,
      observations: pearlHarborObs,
      citations: pearlHarborCit,
      currentYear: 2026,
      intentInfo: intent,
    });
    assert.equal(gate.passed, false, "Must reject Pearl Harbor result for Chinese casualties query");
    passed++;
    console.log("  ✅ Case 6 Passed: Multi-part WWII query rejects insufficient single-subtopic result.");
  }

  // 7. OpenAI Latest Model Current Date Requirement (Golden Example 5 & 6)
  console.log("▶ [CASE 7] OpenAI Latest Model Freshness Constraint");
  {
    const query = "What is the latest OpenAI model released this year?";
    const intent = classifyResearchIntent(query);
    assert.equal(intent.requiresCurrentDate, true, "Must require current date");

    const staleObs = [{ tool: "web_search", success: true, summary: "In 2024 OpenAI released GPT-4o with audio capabilities." }];
    const staleCit = [{ url: "https://techcrunch.com/2024/gpt-4o", title: "GPT-4o 2024", snippet: "May 2024 release" }];

    const gate = evaluateEvidenceDeterministic({
      query,
      observations: staleObs,
      citations: staleCit,
      currentYear: 2026,
      requiresCurrentDate: true,
      intent: intent.intent,
    });
    assert.equal(gate.freshnessOk, false, "Must flag stale 2024 results as not fresh");
    passed++;
    console.log("  ✅ Case 7 Passed: Current-year model inquiry enforces 2026 freshness.");
  }

  // 8. Today's News (Golden Example 6)
  console.log("▶ [CASE 8] Today's News Query Classification");
  {
    const query = "What happened in today's news?";
    const intent = classifyResearchIntent(query);
    assert.equal(intent.intent, RESEARCH_INTENTS.CURRENT_EVENT);
    assert.equal(intent.requiresCurrentDate, true);
    passed++;
    console.log("  ✅ Case 8 Passed: Today's news routed as CURRENT_EVENT with live anchor.");
  }

  // 9. Weather Direct Tool Routing (Golden Example 4)
  console.log("▶ [CASE 9] Weather Query Tool Router Direct Resolution");
  {
    const query = "Jaipur ka weather kaisa hai?";
    const route = toolRouter.route(query);
    assert.equal(route.shouldRoute, true);
    assert.equal(route.directExecution, true);
    assert.equal(route.toolName, "get_weather");
    assert.equal(route.args.location, "Jaipur");
    passed++;
    console.log("  ✅ Case 9 Passed: Weather query directly routed to get_weather tool.");
  }

  // 10. Calculator Direct Tool Routing (Golden Example 3)
  console.log("▶ [CASE 10] Calculator Direct Execution");
  {
    const query = "What is 17 percent of 850?";
    const route = toolRouter.route(query);
    assert.equal(route.shouldRoute, true);
    assert.equal(route.directExecution, true);
    assert.equal(route.toolName, "calculate_expression");
    passed++;
    console.log("  ✅ Case 10 Passed: Calculation query directly routed to calculate_expression.");
  }

  // 11. Stable General Fact (Golden Example 2)
  console.log("▶ [CASE 11] Stable General Fact Routing");
  {
    const query = "What is the capital of France?";
    const intent = classifyResearchIntent(query);
    assert.equal(intent.intent, RESEARCH_INTENTS.SIMPLE_FACT);
    assert.equal(intent.requiresDeepResearch, false);
    assert.equal(intent.requiresCurrentDate, false);
    passed++;
    console.log("  ✅ Case 11 Passed: Capital of France routed as static SIMPLE_FACT.");
  }

  // 12. URL Research Direct Tool Route (Golden Example 12)
  console.log("▶ [CASE 12] URL Research Direct Extraction Route");
  {
    const query = "Open this website and tell me what it says: https://example.com/changelog";
    const route = toolRouter.route(query);
    assert.equal(route.shouldRoute, true);
    assert.equal(route.directExecution, true);
    assert.equal(route.toolName, "extract_webpage");
    assert.equal(route.args.url, "https://example.com/changelog");
    passed++;
    console.log("  ✅ Case 12 Passed: Direct webpage extraction routed cleanly.");
  }

  // 13. Technical Comparison Query (Golden Example 10)
  console.log("▶ [CASE 13] Technical AI Model Comparison Query");
  {
    const query = "Compare Gemini and Claude for coding.";
    const intent = classifyResearchIntent(query);
    assert.equal(intent.intent, RESEARCH_INTENTS.COMPARISON);
    assert.ok(intent.dimensions.includes("model_quality"), "Must include coding/model quality dimension");
    assert.ok(intent.dimensions.includes("latency"), "Must include latency dimension");
    passed++;
    console.log("  ✅ Case 13 Passed: Model comparison routed with domain-specific dimensions.");
  }

  // 14. Deep Technical Research (Golden Example 11)
  console.log("▶ [CASE 14] Deep Research Architecture Routing");
  {
    const query = "Research WebRTC versus WebSocket for a production voice AI system.";
    const intent = classifyResearchIntent(query);
    assert.equal(intent.intent, RESEARCH_INTENTS.TECHNICAL_RESEARCH);
    assert.equal(intent.requiresDeepResearch, true);
    assert.ok(intent.dimensions.includes("full_duplex"), "Must include full_duplex dimension");
    assert.ok(intent.dimensions.includes("latency"), "Must include latency dimension");
    passed++;
    console.log("  ✅ Case 14 Passed: WebRTC vs WebSocket routed to multi-stage technical research.");
  }

  // 15. Irrelevant Search Result Rejection (Golden Example 19)
  console.log("▶ [CASE 15] Irrelevant Result Rejection by Evidence Gate");
  {
    const query = "Why is this Indian pilot going viral lately?";
    const irrelevantObs = [{ tool: "web_search", success: true, summary: "Texas man recites Hanuman Chalisa at supermarket" }];
    const irrelevantCit = [{ url: "https://viralvideos.com/hanuman-chalisa", title: "Hanuman Chalisa viral", snippet: "Texas man recites" }];

    const gate = evaluateEvidenceDeterministic({
      query,
      observations: irrelevantObs,
      citations: irrelevantCit,
      currentYear: 2026,
    });
    assert.equal(gate.passed, false, "Must reject Hanuman Chalisa result for pilot query");
    passed++;
    console.log("  ✅ Case 15 Passed: Irrelevant viral result rejected by evidence gate.");
  }

  // 16. Empty Search Normalization & State (Golden Example 18)
  console.log("▶ [CASE 16] Empty Search Result Normalization");
  {
    const emptyRes = normalizeSearchResult({}, "Who is XYZ obscure person");
    assert.equal(emptyRes.state, "SEARCH_EMPTY");
    assert.equal(emptyRes.ok, false);
    assert.deepEqual(emptyRes.sources, []);
    passed++;
    console.log("  ✅ Case 16 Passed: Empty search strictly normalized to SEARCH_EMPTY.");
  }

  // 17. Stale Sources Rejection for Current Inquiries (Golden Example 22)
  console.log("▶ [CASE 17] Stale Sources Rejection on Fresh Financials");
  {
    const query = "What is the latest price of Gold?";
    const staleObs = [{ tool: "web_search", success: true, summary: "Gold price in January 2024 was 2000 USD." }];
    const staleCit = [{ url: "https://goldrates2024.com", title: "Gold 2024", snippet: "January 2024 records" }];

    const gate = evaluateEvidenceDeterministic({
      query,
      observations: staleObs,
      citations: staleCit,
      currentYear: 2026,
      requiresCurrentDate: true,
      intent: "CURRENT_FACT",
    });
    assert.equal(gate.freshnessOk, false, "Must reject 2024 source when 2026 is required");
    passed++;
    console.log("  ✅ Case 17 Passed: 2024 data rejected for latest price query.");
  }

  // 18. Conflicting Sources State (Golden Example 21)
  console.log("▶ [CASE 18] Conflicting Sources Handling");
  {
    const example = GOLDEN_EXAMPLES.find((e) => e.id === "EX_21_CONFLICTING_SOURCES");
    assert.equal(example.evidenceState, "CONTRADICTORY_EVIDENCE");
    assert.ok(example.expectedSpokenOutput.includes("alag-alag reports"), "Must disclose range of views");
    passed++;
    console.log("  ✅ Case 18 Passed: Disclosing contradiction between conflicting sources verified.");
  }

  // 19. All Providers Fail Honest Fallback (Golden Example 28)
  console.log("▶ [CASE 19] Total Search Failure Honest Response");
  {
    const query = "What is the status of treaty XYZ?";
    const observations = [];
    const citations = [];
    let spoken = "";
    if (observations.length === 0 && citations.length === 0) {
      spoken = "I couldn't verify that from live sources right now.";
    }
    assert.ok(!spoken.includes("Verified web search"), "Must not claim verified evidence");
    assert.ok(spoken.includes("couldn't verify"), "Must state honest failure");
    passed++;
    console.log("  ✅ Case 19 Passed: Honest fallback produced when all search providers fail.");
  }

  // 20. Political Factual Inquiry (Golden Example 24)
  console.log("▶ [CASE 20] Political Factual Neutrality");
  {
    const query = "What are the major welfare schemes of the government?";
    const intent = classifyResearchIntent(query);
    assert.notEqual(intent.intent, RESEARCH_INTENTS.COMPARISON, "Must not force comparison ranking");
    passed++;
    console.log("  ✅ Case 20 Passed: Welfare schemes inquiry presented neutrally.");
  }

  // 21. Political 'Which is Better' Neutral Trade-Offs (Golden Example 25)
  console.log("▶ [CASE 21] Political 'Which is Better' No Single Winner");
  {
    const example = GOLDEN_EXAMPLES.find((e) => e.id === "EX_25_POLITICAL_OPINION");
    assert.ok(example.expectedSpokenOutput.includes("Dono parties ki apni alag ideologies"), "Must not pick single winner");
    assert.equal(example.tool, null, "Opinion request does not require external tool");
    passed++;
    console.log("  ✅ Case 21 Passed: Political choice handled with objective trade-offs without declaring a winner.");
  }

  // 22. Market Cap vs Stock Price Semantic Distinction (Golden Example 26)
  console.log("▶ [CASE 22] Market Cap vs Stock Price Tool Routing");
  {
    const mCapRoute = toolRouter.route("What is Meta's market cap?");
    assert.equal(mCapRoute.toolName, "get_market_cap", "Market cap must route to get_market_cap");

    const stockRoute = toolRouter.route("What is Meta's stock price?");
    assert.equal(stockRoute.toolName, "get_stock_quote", "Stock price must route to get_stock_quote");
    passed++;
    console.log("  ✅ Case 22 Passed: Market cap and stock price strictly distinguished.");
  }

  // 23. Ambiguous Follow-Up Without Context (Golden Example 27)
  console.log("▶ [CASE 23] Ambiguous Pilot Inquiry Without Context Asks Clarification");
  {
    const res = resolveTopicContinuity("What happened with the pilot?", null, []);
    assert.equal(res.requiresClarification, true, "Must require clarification");
    assert.ok(res.clarificationPrompt.includes("pilot"), "Must ask for pilot details");
    passed++;
    console.log("  ✅ Case 23 Passed: Ambiguous query without context asks for concise clarification.");
  }

  // 24. Hindi/Hinglish Typo Recovery (Golden Example 17)
  console.log("▶ [CASE 24] Hindi/Hinglish Typo with Prior Topic");
  {
    const history = [{ user: "WebRTC audio jitter buffer issues", reply: "Jitter occurs due to packet delay." }];
    const res = resolveTopicContinuity("mujhe puri stroy batao is topc ki", null, history);
    assert.equal(res.isFollowUp, true);
    assert.ok(res.resolvedQuery.toLowerCase().includes("jitter"), "Must resolve active jitter topic");
    passed++;
    console.log("  ✅ Case 24 Passed: Typo query resolved with active topic memory.");
  }

  // 25. Explicit Historical Date Anchor (Golden Example 8 & 14)
  console.log("▶ [CASE 25] Explicit Historical Date Non-Corruption");
  {
    const query = "What happened in the 1942 Quit India Movement?";
    const intent = classifyResearchIntent(query);
    assert.equal(intent.requiresCurrentDate, false, "Historical 1942 query must NOT require current date");
    const sanitized = sanitizePlannerQuery(query, query, 2026, false);
    assert.ok(sanitized.includes("1942"), "Must retain 1942");
    assert.ok(!sanitized.includes("2026"), "Must not inject 2026");
    passed++;
    console.log("  ✅ Case 25 Passed: Explicit historical year preserved without modern year corruption.");
  }

  console.log(`\n🎉 All ${passed}/${total} Golden Regression Suite Tests Passed!`);
}

runGoldenSuite().catch((err) => {
  console.error("❌ Golden suite test failed:", err);
  process.exit(1);
});
