/**
 * Targeted Reliability & Audit Regression Test Suite
 * backend/tests/targeted_reliability_fixes.test.mjs
 *
 * Verifies the 6 audit failure categories:
 * 1. Conversational capability questions without search
 * 2. Language-switch instructions without search & persistence logic
 * 3. Date formulations routed to deterministic tool & time-zone preservation
 * 4. Weather router matching fix
 * 5. Current officeholders freshness & rejection of stale evidence
 * 6. Diagnostics isolation (no validator strings in search queries)
 * 7. Conversational challenges invalidating previous hypothesis without treating normal follow-up as challenge
 * 8. Deterministic results receive distinct deterministic fact-check status
 */

import assert from "node:assert/strict";
import { classifyResearchIntent, RESEARCH_INTENTS } from "../services/research/researchIntentClassifier.js";
import { toolRouter } from "../tools/toolRouter.js";
import { evaluateEvidenceDeterministic } from "../services/research/researchEvidenceGate.js";
import { detectUserCorrection, resolveTopicContinuity } from "../services/research/researchTopicMemory.js";
import { buildSearchRecoveryQuery } from "../services/research/researchQueryPlanner.js";
import { analyzeTurnFactCheck } from "../services/factCheckService.js";

async function runTargetedReliabilitySuite() {
  console.log("================================================================================");
  console.log("🧪 RUNNING TARGETED RELIABILITY & AUDIT FIXES REGRESSION SUITE");
  console.log("================================================================================\n");

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✅ PASS: ${name}`);
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  // 1. Conversational capability questions without search
  console.log("🔹 1. Capability & Conversational Routing (Zero Search)");
  await test("Colloquial capability question routes to CAPABILITY_INQUIRY with requiresSearch: false", () => {
    const q1 = "what u can do now for me";
    const res1 = classifyResearchIntent(q1);
    assert.equal(res1.intent, RESEARCH_INTENTS.CAPABILITY_INQUIRY);
    assert.equal(res1.requiresSearch, false);
    assert.equal(res1.requiresDeepResearch, false);

    const q2 = "what can you do for me";
    const res2 = classifyResearchIntent(q2);
    assert.equal(res2.intent, RESEARCH_INTENTS.CAPABILITY_INQUIRY);
    assert.equal(res2.requiresSearch, false);

    const q3 = "supported languages";
    const res3 = classifyResearchIntent(q3);
    assert.equal(res3.intent, RESEARCH_INTENTS.CAPABILITY_INQUIRY);
    assert.equal(res3.requiresSearch, false);
  });

  // 2. Language-switch instructions without search
  console.log("\n🔹 2. Language-Switch Instructions (Fast-Path Control)");
  await test("Language switch commands route to CONVERSATIONAL_CONTROL with action and target language", () => {
    const q1 = "talk to me in english";
    const res1 = classifyResearchIntent(q1);
    assert.equal(res1.intent, RESEARCH_INTENTS.CONVERSATIONAL_CONTROL);
    assert.equal(res1.requiresSearch, false);
    assert.equal(res1.control?.action, "CHANGE_LANGUAGE");
    assert.equal(res1.control?.language, "english");

    const q2 = "speak in hindi";
    const res2 = classifyResearchIntent(q2);
    assert.equal(res2.intent, RESEARCH_INTENTS.CONVERSATIONAL_CONTROL);
    assert.equal(res2.requiresSearch, false);
    assert.equal(res2.control?.language, "hindi");

    const q3 = "switch to english";
    const res3 = classifyResearchIntent(q3);
    assert.equal(res3.intent, RESEARCH_INTENTS.CONVERSATIONAL_CONTROL);
    assert.equal(res3.requiresSearch, false);
  });

  // 3. Date formulations routed to deterministic tool
  console.log("\n🔹 3. Deterministic Date / Time Formulations & Weather");
  await test("Common date formulations route to get_current_time tool", () => {
    const dateQueries = [
      "what is today's date",
      "today's date",
      "what date is today",
      "todays date",
      "current date",
    ];

    for (const dq of dateQueries) {
      const route = toolRouter.route(dq);
      assert.equal(route.shouldRoute, true, `Should route: ${dq}`);
      assert.equal(route.directExecution, true, `Direct execution: ${dq}`);
      assert.equal(route.toolName, "get_current_time", `Tool name: ${dq}`);
    }
  });

  await test("Weather routing handles prefix, suffix, and 'how is the weather in Paris'", () => {
    const route1 = toolRouter.route("how is the weather in Paris today?");
    assert.equal(route1.shouldRoute, true);
    assert.equal(route1.toolName, "get_weather");
    assert.equal(route1.args.location, "Paris");

    const route2 = toolRouter.route("Jaipur ka weather kaisa hai");
    assert.equal(route2.shouldRoute, true);
    assert.equal(route2.toolName, "get_weather");
    assert.equal(route2.args.location, "Jaipur");

    const route3 = toolRouter.route("weather in Tokyo");
    assert.equal(route3.shouldRoute, true);
    assert.equal(route3.toolName, "get_weather");
    assert.equal(route3.args.location, "Tokyo");
  });

  // 4. Deterministic fact-check status
  console.log("\n🔹 4. Deterministic Fact-Check Distinction");
  await test("Date / Time queries receive DETERMINISTIC_VERIFIED verdict without misleading ordinary confidence scores", async () => {
    const fc = await analyzeTurnFactCheck({
      query: "what is today's date",
      evidencePack: null,
      isDeterministicTool: true,
    });
    assert.equal(fc.verdict, "DETERMINISTIC_VERIFIED");
    assert.equal(fc.verdictLabel, "Deterministic Fact");
    assert.equal(fc.credibilityScore, null);
  });

  // 5. Current officeholders vs historical and evidence gating
  console.log("\n🔹 5. Current Officeholder Classification & Stale Evidence Rejection");
  await test("Officeholder query requires current date and rejects stale past snippets", () => {
    const cmQuery = "what is the cm of rajasthan";
    const intent = classifyResearchIntent(cmQuery);
    assert.equal(intent.intent, RESEARCH_INTENTS.CURRENT_FACT);
    assert.equal(intent.requiresCurrentDate, true);

    // Stale evidence citing only Ashok Gehlot must be rejected
    const staleObs = [
      {
        success: true,
        summary: "Chief Minister Ashok Gehlot of Rajasthan announced budget schemes for education in Jaipur.",
      },
    ];
    const staleCitations = [
      {
        title: "Rajasthan CM Portal",
        url: "https://rajasthan.gov.in/news",
        snippet: "Ashok Gehlot served as chief minister.",
      },
    ];

    const gateResult = evaluateEvidenceDeterministic({
      query: cmQuery,
      observations: staleObs,
      citations: staleCitations,
      currentYear: 2026,
      intent: intent.intent,
      requiresCurrentDate: true,
    });

    assert.equal(gateResult.passed, false, "Stale Gehlot evidence must fail quality gate");
    assert.equal(gateResult.sufficient, false);
    assert.ok(
      gateResult.reason.includes("Ashok Gehlot") || gateResult.reason.includes("outdated"),
      "Reason must note outdated officeholder"
    );

    // Fresh evidence citing Bhajan Lal Sharma passes
    const freshObs = [
      {
        success: true,
        summary: "Bhajan Lal Sharma is the current Chief Minister of Rajasthan, assuming office in December 2023.",
      },
    ];
    const freshCitations = [
      {
        title: "Government of Rajasthan Official Portal",
        url: "https://rajasthan.gov.in/cm",
        snippet: "Chief Minister Bhajan Lal Sharma 2026 initiatives.",
      },
    ];

    const freshGate = evaluateEvidenceDeterministic({
      query: cmQuery,
      observations: freshObs,
      citations: freshCitations,
      currentYear: 2026,
      intent: intent.intent,
      requiresCurrentDate: true,
    });

    assert.equal(freshGate.passed, true, "Fresh Bhajan Lal Sharma evidence must pass");
    assert.equal(freshGate.sufficient, true);
  });

  await test("Historical officeholder query preserves historical context without current date force", () => {
    const histQuery = "who was the first cm of rajasthan";
    const intent = classifyResearchIntent(histQuery);
    assert.equal(intent.requiresCurrentDate, false);
  });

  // 6. Diagnostics isolation (no internal diagnostic messages in recovery queries)
  console.log("\n🔹 6. Query Recovery & Diagnostic Isolation");
  await test("Recovery queries do not append generic spam suffixes or internal labels", () => {
    const rec1 = buildSearchRecoveryQuery({
      originalQuery: "what is the cm of rajasthan",
      intent: "CURRENT_FACT",
      currentYear: 2026,
      requiresCurrentDate: true,
    });

    assert.ok(!rec1.includes("verified facts overview"), "Must not contain 'verified facts overview'");
    assert.ok(!rec1.includes("definitional_explanation"), "Must not contain 'definitional_explanation'");
    assert.ok(rec1.includes("rajasthan") && rec1.includes("cm"), "Preserves original query keywords");
  });

  // 7. Conversational challenges & user corrections
  console.log("\n🔹 7. Conversational Challenges & Active Topic Memory");
  await test("Conversational challenges ('WTF man who is the cm') trigger isCorrection and invalidate previous hypothesis", () => {
    const disputeQuery = "WTF man who is the cm of rajasthan";
    const currentTopic = "Rajasthan Chief Minister";
    const detected = detectUserCorrection(disputeQuery, currentTopic);
    assert.equal(detected.isCorrection, true);
    assert.equal(detected.isDisputedClaim, true);
    assert.equal(detected.invalidatedTopic, currentTopic);

    // Resolve topic continuity
    const continuity = resolveTopicContinuity(disputeQuery, { activeTopic: currentTopic, topicConfidence: 0.9 }, []);
    assert.equal(continuity.isCorrection, true);
    assert.equal(continuity.isDisputedClaim, true);
    assert.ok(!continuity.resolvedQuery.includes("WTF"), "Strips emotion from search keyword");
    assert.ok(continuity.resolvedQuery.includes("rajasthan"), "Maintains inquiry subject");
  });

  await test("Normal follow-ups are NOT classified as corrections", () => {
    const followUp = "tell me the full story";
    const detected = detectUserCorrection(followUp, "World War II");
    assert.equal(detected.isCorrection, false);
    assert.equal(detected.isDisputedClaim, false);

    const cont = resolveTopicContinuity(followUp, { activeTopic: "World War II", topicConfidence: 0.95 }, []);
    assert.equal(cont.isFollowUp, true);
    assert.equal(cont.isCorrection, false);
    assert.equal(cont.requiresClarification, false);
  });

  // 8. Standalone "What happened" questions vs empty follow-up
  console.log("\n🔹 8. Standalone 'What happened' Entity Queries vs Bare Follow-ups");
  await test("Standalone entity questions starting with 'What happened' do NOT trigger Hinglish clarification", () => {
    const q1 = "What happened to the missing radioactive capsule in Australia?";
    const cont1 = resolveTopicContinuity(q1, null, []);
    assert.equal(cont1.requiresClarification, false, "Must not require clarification for full query");
    assert.equal(cont1.isFollowUp, false, "Must not be classified as follow-up");

    const q2 = "What happened on Oct 31 in France?";
    const cont2 = resolveTopicContinuity(q2, null, []);
    assert.equal(cont2.requiresClarification, false, "Must not require clarification for dated query");
    assert.equal(cont2.isFollowUp, false, "Must not be classified as follow-up");

    const q3 = "what happened";
    const cont3 = resolveTopicContinuity(q3, null, []);
    assert.equal(cont3.requiresClarification, true, "Empty 'what happened' with no topic requires clarification");
  });

  // 9. Weather location cleaner
  console.log("\n🔹 9. Weather Location Cleaner ('right now' / 'now' stripping)");
  await test("Weather location cleaner strips temporal words ('right now', 'now', 'today')", () => {
    const r1 = toolRouter.route("weather in Tokyo right now");
    assert.equal(r1.shouldRoute, true);
    assert.equal(r1.toolName, "get_weather");
    assert.equal(r1.args.location, "Tokyo", "Location must be 'Tokyo', not 'Tokyo right now'");

    const r2 = toolRouter.route("what is the weather in New York right now");
    assert.equal(r2.shouldRoute, true);
    assert.equal(r2.toolName, "get_weather");
    assert.equal(r2.args.location, "New York", "Location must be 'New York', not 'New York right now'");

    const r3 = toolRouter.route("Paris ka weather kaisa hai now");
    assert.equal(r3.shouldRoute, true);
    assert.equal(r3.toolName, "get_weather");
    assert.equal(r3.args.location, "Paris", "Location must be 'Paris'");
  });

  // 10. Crypto coin mapping & 24h change routing
  console.log("\n🔹 10. Crypto Mapping & 24-Hour Change Routing");
  await test("Crypto router recognizes SOL/Solana and 24-hour change keywords", () => {
    const r1 = toolRouter.route("What is Solana's 24-hour change?");
    assert.equal(r1.shouldRoute, true);
    assert.equal(r1.toolName, "get_stock_quote");
    assert.equal(r1.args.symbol.toLowerCase(), "solana");

    const r2 = toolRouter.route("SOL price right now");
    assert.equal(r2.shouldRoute, true);
    assert.equal(r2.toolName, "get_stock_quote");
    assert.equal(r2.args.symbol.toLowerCase(), "sol");
  });

  // 11. Tokenizer punctuation stripping in evidence gate
  console.log("\n🔹 11. Tokenizer Punctuation Stripping in Evidence Gate");
  await test("Evidence gate strips punctuation so tokens with ?, quotes, hyphens match plain text", () => {
    const query = "What did Donald Tusk say about the Polish constitutional court shake-up?";
    const gateResult = evaluateEvidenceDeterministic({
      query,
      observations: [
        {
          tool: "web_search",
          task: "Polish court crisis",
          query: "Donald Tusk Polish constitutional court",
          success: true,
          summary: "Donald Tusk defended the overhaul of Poland constitutional court despite protests, stating it was vital.",
        }
      ],
      citations: [
        {
          title: "Tusk Defends Poland Constitutional Court Overhaul",
          publisher: "The Guardian",
          url: "https://www.theguardian.com/world/2026/oct/31/donald-tusk-defends-overhaul-poland-constitutional-court-despite-protests",
          snippet: "Donald Tusk defended the court shake-up in a prime-time address to the nation.",
          sourceType: "TIER_1_PRIMARY",
        }
      ],
      currentYear: 2026,
      intent: "POLITICS",
      requiresCurrentDate: true,
    });

    assert.ok(gateResult.relevance > 0.5, `Relevance score (${gateResult.relevance}) should be > 0.5`);
  });

  // 12. Conversational Small-talk (Zero Search Routing)
  console.log("\n🔹 12. Conversational Small-Talk Routing ('or kya hal h')");
  await test("Colloquial greetings ('or kya hal h', 'aur bhai kya scene hai') route to CHITCHAT with zero search", () => {
    const res1 = classifyResearchIntent("or kya hal h");
    assert.equal(res1.intent, "CHITCHAT");
    assert.equal(res1.requiresSearch, false);
    assert.equal(res1.requiresDeepResearch, false);

    const res2 = classifyResearchIntent("aur kya hal h");
    assert.equal(res2.intent, "CHITCHAT");
    assert.equal(res2.requiresSearch, false);

    const res3 = classifyResearchIntent("aur bhai kya scene hai");
    assert.equal(res3.intent, "CHITCHAT");
    assert.equal(res3.requiresSearch, false);
  });

  // 13. Deterministic Day of Week & Citation Stripping
  console.log("\n🔹 13. Deterministic Day of Week & Citation Stripping");
  await test("getCurrentDateContext includes dayOfWeek and sanitizeSpokenReply strips bracketed citations", async () => {
    const { getCurrentDateContext, sanitizeSpokenReply } = await import("../services/thinkingEngineService.js");
    const dateCtx = getCurrentDateContext();
    assert.ok(dateCtx.dayOfWeek, "dayOfWeek must be present");
    assert.ok(dateCtx.formatted.includes(dateCtx.dayOfWeek), "formatted string must include dayOfWeek");

    const raw1 = "According to records 【Source 1】, Donald Trump said he accepts results [Source 2].";
    const cleaned = sanitizeSpokenReply(raw1);
    assert.ok(!cleaned.includes("【Source 1】"));
    assert.ok(!cleaned.includes("[Source 2]"));
    assert.ok(cleaned.includes("According to records"));
  });

  // 14. 3-Letter Crypto Tickers Preserved in Evidence Gate
  console.log("\n🔹 14. 3-Letter Crypto Ticker Preservation in Evidence Gate");
  await test("Evidence gate retains BTC, ETH, and SOL tickers in relevance scoring", () => {
    const gateRes = evaluateEvidenceDeterministic({
      query: "What are BTC, ETH and SOL trading at right now?",
      observations: [
        {
          tool: "get_stock_quote",
          task: "BTC quote",
          query: "BTC",
          success: true,
          summary: "Bitcoin (CRYPTO: BTC-USD) is currently trading at USD 80244.95 (+3.47% today).",
        }
      ],
      citations: [
        {
          title: "Bitcoin (BTC-USD) Live Market Feed",
          publisher: "Yahoo Finance",
          url: "https://finance.yahoo.com/quote/BTC-USD",
          snippet: "Bitcoin (BTC-USD) is currently trading at USD 80244.95 with daily change +3.47%.",
          sourceType: "TIER_1_PRIMARY",
        }
      ],
      currentYear: 2026,
      intent: "FINANCIAL_CURRENT",
      requiresCurrentDate: true,
    });

    assert.ok(gateRes.relevance > 0.2, "Relevance should capture 3-letter tickers");
  });

  // 15. Article Extraction Lead Fallback & Banned Placeholders
  console.log("\n🔹 15. Article Extraction Lead Fallback & Banned Placeholders");
  await test("extractKeyPassages falls back to lead sentences and sanitizePlannerQuery bans placeholders", async () => {
    const { extractKeyPassages } = await import("../services/research/researchOrchestrator.js");
    const { sanitizePlannerQuery } = await import("../services/research/researchQueryPlanner.js");

    const articleText = "Colorado voters rejected Proposition 138 with 52 percent against. The measure would have changed voting rules statewide. Supporters had poured millions into advertising.";
    const passages = extractKeyPassages(articleText, "Colorado Proposition 138 outcome", [], 3);
    assert.ok(passages.length > 0, "Must extract passages from article text");
    assert.ok(passages.some(p => p.includes("52 percent") || p.includes("Proposition 138")));

    const cleanedPlaceholder = sanitizePlannerQuery("Primary topic inquiry", "Who won the race in Arizona?", 2026);
    assert.ok(!cleanedPlaceholder.includes("Primary topic inquiry"), "Must ban 'Primary topic inquiry'");
    assert.ok(cleanedPlaceholder.includes("Arizona"), "Should fall back to user query");
  });

  console.log("\n================================================================================");
  console.log(`TOTAL TARGETED TESTS: ${total}`);
  console.log(`PASSED:               ${passed}`);
  console.log(`FAILED:               ${total - passed}`);
  console.log("================================================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runTargetedReliabilitySuite().catch((err) => {
  console.error("Fatal test crash:", err);
  process.exit(1);
});

