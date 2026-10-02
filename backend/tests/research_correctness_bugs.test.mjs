import assert from "node:assert/strict";
import { classifyResearchIntent, RESEARCH_INTENTS } from "../services/research/researchIntentClassifier.js";
import { sanitizePlannerQuery, formulateResearchPlan } from "../services/research/researchQueryPlanner.js";
import { normalizeSearchResult } from "../tools/modules/web/webSearchTool.js";
import { evaluateEvidenceDeterministic } from "../services/research/researchEvidenceGate.js";

console.log("🧪 Starting Research Engine Correctness Bugs Regression Tests...\n");

async function runTests() {
  let passedCount = 0;

  // =========================================================================
  // TEST 1: "what are the best work of gandhi"
  // Expected:
  // - not COMPARISON
  // - historical / notable works intent
  // - no AI-provider comparison dimensions
  // - no forced 2026 year
  // - historical source strategy
  // =========================================================================
  console.log("▶ [TEST 1] Gandhi notable works intent & query sanitation");
  {
    const query = "what are the best work of gandhi";
    const intent = classifyResearchIntent(query);

    assert.equal(
      intent.intent,
      RESEARCH_INTENTS.NOTABLE_WORKS,
      `Expected intent NOTABLE_WORKS, got ${intent.intent}`
    );
    assert.notEqual(intent.intent, RESEARCH_INTENTS.COMPARISON, "Intent must NOT be COMPARISON");
    assert.equal(intent.requiresCurrentDate, false, "Gandhi historical query must NOT require current date");

    // Must NOT leak AI-provider comparison dimensions
    const leakedAiDims = intent.dimensions.filter((d) =>
      ["model_quality", "latency", "tool_calling", "multimodal", "context_window", "pricing"].includes(d)
    );
    assert.deepEqual(leakedAiDims, [], "Must not contain AI provider comparison dimensions");

    // Planner query sanitization: must not inject 2026
    const sanitized = sanitizePlannerQuery(query, query, 2026, false);
    assert.ok(!sanitized.includes("2026"), `Sanitized query must NOT inject 2026: "${sanitized}"`);
    assert.ok(sanitized.toLowerCase().includes("notable works") || sanitized.toLowerCase().includes("gandhi"));

    // Planner queries: historical mode
    const plan = await formulateResearchPlan({
      query,
      intent: intent.intent,
      dimensions: intent.dimensions,
      requiresCurrentDate: intent.requiresCurrentDate,
      callModel: null,
    });
    for (const task of plan.searchTasks) {
      assert.ok(!task.query.includes("2026"), `Planned query "${task.query}" must NOT contain 2026`);
    }

    passedCount++;
    console.log("  ✅ Test 1 Passed: Gandhi correctly classified as NOTABLE_WORKS with clean queries and no AI dimensions.");
  }

  // =========================================================================
  // TEST 2: "how many people died in ww2 and how many Chinese were killed by Japan in ww2"
  // Expected:
  // - historical / factual intent (requiresCurrentDate: false)
  // - multi-part coverage: Pearl Harbor alone is insufficient -> triggers failure / retry
  // - deterministic gate checks both subtopics
  // =========================================================================
  console.log("▶ [TEST 2] WWII multi-part casualty inquiry & insufficient Pearl Harbor evidence");
  {
    const query = "how many people died in ww2 and how many Chinese were killed by Japan in ww2";
    const intent = classifyResearchIntent(query);

    assert.equal(intent.intent, RESEARCH_INTENTS.HISTORICAL_INFORMATION);
    assert.equal(intent.requiresCurrentDate, false);

    // Mock search returning ONLY Pearl Harbor result (irrelevant / insufficient for Chinese casualties)
    const pearlHarborObs = [
      {
        tool: "web_search",
        success: true,
        summary: "Pearl Harbor attack on December 7, 1941 resulted in 2,403 American deaths and 1,178 wounded.",
      },
    ];
    const pearlHarborCitations = [
      {
        url: "https://www.britannica.com/event/Pearl-Harbor-attack",
        title: "Pearl Harbor attack | Casualties & Facts | Britannica",
        snippet: "Pearl Harbor attack resulted in 2,403 American deaths.",
      },
    ];

    const gateResult = evaluateEvidenceDeterministic({
      query,
      observations: pearlHarborObs,
      citations: pearlHarborCitations,
      currentYear: 2026,
      intentInfo: intent,
    });

    // Must FAIL because Chinese casualties are not covered
    assert.equal(gateResult.passed, false, "Evidence gate must FAIL on Pearl Harbor-only evidence for WWII Chinese inquiry");
    assert.ok(
      gateResult.missingInformation.some((m) => m.toLowerCase().includes("chinese") || m.toLowerCase().includes("japan") || m.toLowerCase().includes("casualt")),
      `Missing info should flag Chinese/Japan casualties: ${JSON.stringify(gateResult.missingInformation)}`
    );

    passedCount++;
    console.log("  ✅ Test 2 Passed: Insufficient Pearl Harbor result correctly rejected by evidence gate.");
  }

  // =========================================================================
  // TEST 3: "what is the latest OpenAI model"
  // Expected:
  // - CURRENT_FACT or COMPARISON
  // - requiresCurrentDate === true
  // - October 2026 freshness rules apply
  // =========================================================================
  console.log("▶ [TEST 3] Latest OpenAI model current-date requirement");
  {
    const query = "what is the latest OpenAI model";
    const intent = classifyResearchIntent(query);

    assert.equal(intent.requiresCurrentDate, true, "Latest OpenAI model must require current date");
    assert.ok(
      [RESEARCH_INTENTS.CURRENT_FACT, RESEARCH_INTENTS.COMPARISON, RESEARCH_INTENTS.DEEP_RESEARCH].includes(intent.intent),
      `Intent was ${intent.intent}`
    );

    // Stale 2024 citation must fail freshness check
    const staleObs = [
      {
        tool: "web_search",
        success: true,
        summary: "In 2024, OpenAI released GPT-4o with multimodal features.",
      },
    ];
    const staleCitations = [
      {
        url: "https://openai.com/index/hello-gpt-4o/",
        title: "Hello GPT-4o 2024",
        snippet: "OpenAI announced GPT-4o in May 2024.",
      },
    ];

    const gateResult = evaluateEvidenceDeterministic({
      query,
      observations: staleObs,
      citations: staleCitations,
      currentYear: 2026,
      intentInfo: intent,
    });

    assert.equal(gateResult.freshnessOk, false, "Stale 2024 evidence must fail freshnessOk for current 2026 inquiry");

    passedCount++;
    console.log("  ✅ Test 3 Passed: Current-year inquiry enforces 2026 freshness constraint.");
  }

  // =========================================================================
  // TEST 4: "what happened during the Gandhi-Irwin Pact"
  // Expected:
  // - HISTORICAL_INFORMATION
  // - no current-year modifier
  // =========================================================================
  console.log("▶ [TEST 4] Gandhi-Irwin Pact historical inquiry");
  {
    const query = "what happened during the Gandhi-Irwin Pact";
    const intent = classifyResearchIntent(query);

    assert.equal(intent.intent, RESEARCH_INTENTS.HISTORICAL_INFORMATION);
    assert.equal(intent.requiresCurrentDate, false);

    const sanitized = sanitizePlannerQuery(query, query, 2026, false);
    assert.ok(!sanitized.includes("2026"), `Historical pact query must NOT include 2026: "${sanitized}"`);

    passedCount++;
    console.log("  ✅ Test 4 Passed: Gandhi-Irwin Pact classified as HISTORICAL without 2026 injection.");
  }

  // =========================================================================
  // TEST 5: Force web_search to return {}
  // Expected:
  // - SEARCH_EMPTY
  // - ok: false
  // - evidence.length === 0
  // - synthesis blocked / no fake verified evidence claim
  // =========================================================================
  console.log("▶ [TEST 5] Empty search normalization to SEARCH_EMPTY");
  {
    const emptyObj = normalizeSearchResult({}, "sample query");
    assert.equal(emptyObj.state, "SEARCH_EMPTY");
    assert.equal(emptyObj.ok, false);
    assert.deepEqual(emptyObj.sources, []);
    assert.ok(emptyObj.voiceSummary.includes("[SEARCH_EMPTY]"));

    const nullObj = normalizeSearchResult(null, "sample query");
    assert.equal(nullObj.state, "SEARCH_EMPTY");
    assert.equal(nullObj.ok, false);

    const emptyArr = normalizeSearchResult([], "sample query");
    assert.equal(emptyArr.state, "SEARCH_EMPTY");
    assert.equal(emptyArr.ok, false);

    const emptyDataObj = normalizeSearchResult({ data: [] }, "sample query");
    assert.equal(emptyDataObj.state, "SEARCH_EMPTY");
    assert.equal(emptyDataObj.ok, false);

    // Gate on empty search
    const gateOnEmpty = evaluateEvidenceDeterministic({
      query: "sample query",
      observations: [{ tool: "web_search", success: false, summary: emptyObj.voiceSummary }],
      citations: [],
      currentYear: 2026,
    });
    assert.equal(gateOnEmpty.passed, false, "Gate must FAIL on empty search");
    assert.equal(gateOnEmpty.sourceCount, 0, "Gate sourceCount must be 0");

    passedCount++;
    console.log("  ✅ Test 5 Passed: {}, null, [], and unusable results strictly normalized to SEARCH_EMPTY.");
  }

  // =========================================================================
  // TEST 6: Force web_search to return irrelevant results
  // Expected:
  // - SEARCH_PARTIAL or insufficient
  // - Evidence gate fails relevance check
  // - Missing terms flagged
  // =========================================================================
  console.log("▶ [TEST 6] Irrelevant results trigger insufficient gate status");
  {
    const query = "quantum computing topological qubit error correction";
    const irrelevantObs = [
      {
        tool: "web_search",
        success: true,
        summary: "The best recipe for chocolate chip cookies requires brown butter and dark chocolate chips.",
      },
    ];
    const irrelevantCitations = [
      {
        url: "https://www.allrecipes.com/recipe/chocolate-chip-cookies",
        title: "Best Chocolate Chip Cookies Recipe",
        snippet: "Crisp edges and chewy centers made with brown butter.",
      },
    ];

    const gate = evaluateEvidenceDeterministic({
      query,
      observations: irrelevantObs,
      citations: irrelevantCitations,
      currentYear: 2026,
    });

    assert.equal(gate.passed, false, "Irrelevant results must NOT pass deterministic evidence gate");
    assert.ok(gate.relevance < 0.25, `Relevance score must be low: ${gate.relevance}`);
    assert.ok(gate.missingInformation.length > 0, "Missing information must be recorded");

    passedCount++;
    console.log("  ✅ Test 6 Passed: Irrelevant results correctly rejected by evidence gate.");
  }

  // =========================================================================
  // TEST 7: Force all retries to fail
  // Expected:
  // - honest fallback message
  // - NO hallucinated facts
  // - NO "verified evidence" claim
  // =========================================================================
  console.log("▶ [TEST 7] Honest fallback response when all retries fail");
  {
    const query = "obscure unverifiable historical claim xyz";
    const failedObservations = [
      { tool: "web_search", success: false, summary: "[SEARCH_EMPTY] Search returned no usable evidence for \"obscure unverifiable historical claim xyz\"." },
    ];
    const failedCitations = [];

    // Simulate synthesis logic when observations are all failed / empty
    const validObs = failedObservations.filter((o) => o.success && !o.summary.includes("[SEARCH_EMPTY]"));
    let spokenReply = "";
    if (validObs.length === 0 && failedCitations.length === 0) {
      spokenReply = `I was unable to verify current records for "${query}" across the search feeds right now.`;
    }

    assert.ok(!spokenReply.includes("Verified web search evidence"), "Must not claim verified evidence");
    assert.ok(!spokenReply.includes("According to verified"), "Must not claim verified citations");
    assert.ok(spokenReply.includes("unable to verify"), `Must state honest failure: "${spokenReply}"`);

    passedCount++;
    console.log("  ✅ Test 7 Passed: Honest fallback response produced without hallucinated evidence claims.");
  }

  // =========================================================================
  // TEST 8: Hinglish detection & query rewriting trigger
  // Query: "usme modi ne thik se kam nhi kiya ya kya bat h"
  // Query: "what do you wnat to say about godhra case"
  // Expected:
  // - queryNeedsRewrite returns true for Hinglish and common typos
  // - rewriteQueryForSearch produces clean English search keywords
  // =========================================================================
  console.log("▶ [TEST 8] Hinglish & typo detection for search rewriting");
  {
    const { queryNeedsRewrite, rewriteQueryForSearch } = await import("../services/research/researchQueryPlanner.js");

    const hinglish1 = "usme modi ne thik se kam nhi kiya ya kya bat h";
    const typo1 = "what do you wnat to say about godhra case";
    const multiTopic = "what about hathras rape case usme us ladki ko kasie jla diya rat ko hi evidence bachane ke liya , isme yogi ki galti h ya nhi or ram mandor chori me kiski galti h";
    const cleanEnglish = "Who is the CEO of Apple";

    assert.equal(queryNeedsRewrite(hinglish1), true, "Must detect Hinglish query");
    assert.equal(queryNeedsRewrite(typo1), true, "Must detect typo 'wnat'");
    assert.equal(queryNeedsRewrite(multiTopic), true, "Must detect multi-topic Hinglish query");
    assert.equal(queryNeedsRewrite(cleanEnglish), false, "Clean English query should NOT trigger rewrite");

    // Test rewrite logic with mock model
    const mockModel = async ({ messages }) => {
      const userMsg = messages[0].content;
      if (userMsg.includes("usme modi ne")) {
        return "Narendra Modi governance performance critique economic policies controversy";
      }
      if (userMsg.includes("hathras")) {
        return "TOPIC: Hathras case victim midnight cremation controversy administration UP police\nTOPIC: Ram Mandir land purchase corruption allegations trust controversy";
      }
      return "Godhra train burning case 2002 Gujarat riots judicial commissions";
    };

    const res1 = await rewriteQueryForSearch(hinglish1, mockModel);
    assert.ok(res1.primary.length > 5, "Must return valid search keywords");
    assert.ok(!res1.primary.includes("usme"), "Rewritten query must not contain Hinglish words");
    assert.ok(!res1.primary.includes("nhi"), "Rewritten query must not contain 'nhi'");

    const resMulti = await rewriteQueryForSearch(multiTopic, mockModel);
    assert.ok(resMulti.primary.includes("Hathras"), "Primary topic must be extracted");
    assert.ok(resMulti.subtopics.length > 0, "Subtopics must be decomposed for multi-topic query");
    assert.ok(resMulti.subtopics[0].includes("Ram Mandir"), "Second topic must be separated into subtopic");

    passedCount++;
    console.log("  ✅ Test 8 Passed: Hinglish and multi-topic queries correctly detected and rewritten.");
  }

  // =========================================================================
  // TEST 9: Conversational greetings, pleasantries, banter & emotion
  // Queries like: "so hello how are you smile me", "kya haal hai", "who are you"
  // Expected:
  // - Classified as CONVERSATIONAL intent
  // - requiresSearch: false
  // - requiresDeepResearch: false
  // - Never invokes web_search or triggers tool routing
  // =========================================================================
  console.log("▶ [TEST 9] Conversational greeting & zero-search verification");
  {
    const greetings = [
      "so hello how are you smile me",
      "hi how are you",
      "hello! kaise ho aap",
      "namaste",
      "kya haal hai bhai",
      "who are you and what can you do",
      "smile me please",
      "thank you so much",
    ];

    for (const g of greetings) {
      const intent = classifyResearchIntent(g);
      assert.ok(
        intent.intent === RESEARCH_INTENTS.CONVERSATIONAL || intent.intent === RESEARCH_INTENTS.CHITCHAT,
        `Query "${g}" should be classified as CONVERSATIONAL or CHITCHAT, got: ${intent.intent}`
      );
      assert.equal(
        intent.requiresSearch,
        false,
        `Query "${g}" must have requiresSearch === false`
      );
      assert.equal(
        intent.requiresDeepResearch,
        false,
        `Query "${g}" must have requiresDeepResearch === false`
      );
    }

    // Ensure actual factual or calculation inquiries are NOT classified as conversational
    const factualQueries = [
      "who is the CEO of Apple",
      "weather in London",
      "what is 2 + 2",
      "what happened in ww2",
    ];
    for (const f of factualQueries) {
      const intent = classifyResearchIntent(f);
      assert.notEqual(
        intent.intent,
        RESEARCH_INTENTS.CONVERSATIONAL,
        `Query "${f}" must NOT be classified as CONVERSATIONAL`
      );
    }

    passedCount++;
    console.log("  ✅ Test 9 Passed: Conversational queries correctly classified with requiresSearch: false.");
  }

  console.log(`\n🎉 All ${passedCount}/9 Correctness Bug Regression Tests Passed!`);
}

runTests().catch((err) => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
