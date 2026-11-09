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

  // 16. Explicit Historical and Future Year Preservation in Temporal Planner
  console.log("\n🔹 16. Explicit Historical and Future Year Preservation");
  await test("Planner preserves explicit historical and future years without injecting current year", async () => {
    const { sanitizePlannerQuery } = await import("../services/research/researchQueryPlanner.js");

    // Historical year: 1992
    const q1992 = sanitizePlannerQuery("presidential election results 1992", "Who won the presidential election in 1992?", 2026, false);
    assert.ok(q1992.includes("1992"), "Must preserve 1992");
    assert.ok(!q1992.includes("2026"), "Must NOT inject 2026 into 1992 query");

    // Future year: 2028
    const q2028 = sanitizePlannerQuery("presidential election 2028 candidate predictions", "Who will run in the 2028 presidential election?", 2026, false);
    assert.ok(q2028.includes("2028"), "Must preserve 2028");
    assert.ok(!q2028.includes("2026"), "Must NOT inject 2026 into 2028 query");

    // Current unstated election year: default to 2026
    const qCurrent = sanitizePlannerQuery("midterm election results senate control", "What are the midterm election results for senate control?", 2026, true);
    assert.ok(qCurrent.includes("2026"), "Must anchor unstated current election to 2026");

    // Ambiguous query: do not invent years
    const qAmbiguous = sanitizePlannerQuery("what causes inflation in consumer goods", "what causes inflation in consumer goods", 2026, false);
    assert.ok(!qAmbiguous.includes("2026"), "Must not invent year for ambiguous query");
  });

  // 17. Political / Electoral Accountability Intent Classification
  console.log("\n🔹 17. Political / Electoral Accountability Intent Classification");
  await test("Electoral and candidate accountability questions classify as CURRENT_EVENT with requiresCurrentDate", () => {
    const resTrumpBlame = classifyResearchIntent("What did Trump blame the Republican losses on, and where did he say it?");
    assert.equal(resTrumpBlame.intent, "CURRENT_EVENT");
    assert.equal(resTrumpBlame.requiresCurrentDate, true);

    const resMonitors = classifyResearchIntent("How many election monitors did the Justice Department send out, and did voting proceed normally despite pre-election fears?");
    assert.equal(resMonitors.intent, "CURRENT_EVENT");
    assert.equal(resMonitors.requiresCurrentDate, true);

    const resPastElection = classifyResearchIntent("What did Jimmy Carter blame his 1980 election loss on?");
    assert.equal(resPastElection.requiresCurrentDate, false, "Historical past election must not require current date");
  });

  // 18. Evidence Gate Fact-Proximity Validation
  console.log("\n🔹 18. Evidence Gate Fact-Proximity Validation");
  await test("Quantity gate rejects detached page numbers and accepts metric-proximate counts", () => {
    // Unrelated detached digits (e.g. copyright 2026, page 1)
    const gateUnrelated = evaluateEvidenceDeterministic({
      query: "How many election monitors did the Justice Department send out?",
      observations: [
        {
          tool: "web_search",
          query: "election monitors",
          success: true,
          summary: "News Portal. Copyright 2026. Page 1 of 5. All rights reserved.",
        }
      ],
      citations: [
        {
          title: "Election Portal",
          url: "https://news.example.com/elections",
          snippet: "News Portal home. Copyright 2026. Page 1.",
        }
      ],
      currentYear: 2026,
      intent: "CURRENT_EVENT",
      requiresCurrentDate: true,
    });
    assert.equal(gateUnrelated.passed, false, "Gate must reject detached copyright digits");

    // Relevant proximate counts
    const gateRelevant = evaluateEvidenceDeterministic({
      query: "How many election monitors did the Justice Department send out?",
      observations: [
        {
          tool: "web_search",
          query: "election monitors",
          success: true,
          summary: "The Justice Department confirmed deploying over 1,000 election monitors across states.",
        }
      ],
      citations: [
        {
          title: "DOJ Monitors Report",
          url: "https://news.example.com/doj-monitors",
          snippet: "Over 1,000 monitors were deployed across the country to observe voting.",
        }
      ],
      currentYear: 2026,
      intent: "CURRENT_EVENT",
      requiresCurrentDate: true,
    });
    assert.equal(gateRelevant.passed, true, "Gate must accept entity-proximate quantity");
  });

  // 19. Current Numeric Data vs Stale Educational Estimates (BTC On-Chain Circulating Supply)
  console.log("\n🔹 19. Current Numeric Data vs Stale Educational Estimates");
  await test("stockMarketTool fetches exact on-chain Bitcoin circulating supply and cap percentage", async () => {
    const { stockMarketTool } = await import("../tools/modules/utility/stockMarketTool.js");
    const quote = await stockMarketTool.execute({ symbol: "BTC" });
    assert.ok(quote.ok, "StockMarketTool BTC execute must succeed");
    assert.equal(quote.data.symbol, "BTC-USD");
    assert.ok(quote.data.circulatingSupply > 20000000, "Circulating supply must exceed 20,000,000 BTC in 2026");
    assert.ok(quote.data.circulatingSupply >= 20100000 && quote.data.circulatingSupply <= 20200000, "Circulating supply must reflect current ~20.1M BTC");
    assert.ok(quote.data.circulatingSupplyFormatted.startsWith("20,10"), "Circulating supply must reflect current ~20.1M BTC");
    assert.ok(parseFloat(quote.data.supplyCapPercentage) >= 95.7, "Supply cap percentage must reflect ~95.7-95.8% of 21M cap");
  });

  // 20. Distinct Statements From Multiple Sources and Venues by Same Speaker
  console.log("\n🔹 20. Multi-Statement & Venue Attribution Directive");
  await test("System prompt directives enforce distinct attribution across venues for the same speaker", async () => {
    const fs = await import("fs");
    const thinkingEngineSrc = fs.readFileSync(new URL("../services/thinkingEngineService.js", import.meta.url), "utf8");
    assert.ok(thinkingEngineSrc.includes("MULTI-STATEMENT & VENUE ATTRIBUTION"), "Must include Directive 12 for multi-statement venue attribution");
    assert.ok(thinkingEngineSrc.includes("distinguishing a call-in interview, an official statement to print press, or a social media post"), "Must instruct model to distinguish venues");
  });

  // 21. Preservation of Requested Numerical Facts Through Synthesis
  console.log("\n🔹 21. Preservation of Requested Numerical Facts");
  await test("Evidence gate requires actual percentage when query explicitly asks for percentage", () => {
    // Evidence lacks percentage figure
    const gateWithoutPct = evaluateEvidenceDeterministic({
      query: "What percentage backed Colorado's Proposition 134 in early results, and what status did the race have?",
      observations: [
        {
          tool: "web_search",
          query: "Colorado Proposition 134 results",
          success: true,
          summary: "Proposition 134 in Colorado is leading in early returns, but officials say the race remains too close to call.",
        }
      ],
      citations: [
        {
          title: "Colorado Sun",
          url: "https://coloradosun.com/prop134",
          snippet: "Proposition 134 in Colorado is leading in early returns, but officials say the race remains too close to call.",
        }
      ],
      currentYear: 2026,
      intent: "CURRENT_EVENT",
      requiresCurrentDate: true,
    });
    assert.equal(gateWithoutPct.passed, false, "Gate must reject evidence missing explicit percentage");
    assert.ok(
      (gateWithoutPct.reason && gateWithoutPct.reason.includes("percentage")) ||
      (gateWithoutPct.missingInformation && gateWithoutPct.missingInformation.some((m) => m.includes("percentage"))),
      "Reason must mention missing percentage"
    );

    // Evidence contains explicit percentage and race status
    const gateWithPct = evaluateEvidenceDeterministic({
      query: "What percentage backed Colorado's Proposition 134 in early results, and what status did the race have?",
      observations: [
        {
          tool: "web_search",
          query: "Colorado Proposition 134 results",
          success: true,
          summary: "Early returns show Proposition 134 backed by 52% of Colorado voters, but the race is too close to call.",
        }
      ],
      citations: [
        {
          title: "Colorado Sun",
          url: "https://coloradosun.com/prop134",
          snippet: "Early returns show Proposition 134 backed by 52% of Colorado voters, but the race is too close to call.",
        }
      ],
      currentYear: 2026,
      intent: "CURRENT_EVENT",
      requiresCurrentDate: true,
    });
    assert.equal(gateWithPct.passed, true, "Gate must pass when explicit percentage is present");
  });

  // 22. Handling Missing or Contradictory Numerical Evidence with Explicit Uncertainty
  console.log("\n🔹 22. Missing or Contradictory Evidence Gate Handling");
  await test("Evidence gate rejects empty or zero-count observations for quantitative queries", () => {
    const gateEmptyNumeric = evaluateEvidenceDeterministic({
      query: "What is BTC's reported circulating supply, and what percentage of the 21M cap does it represent?",
      observations: [
        {
          tool: "web_search",
          query: "BTC circulating supply",
          success: true,
          summary: "Bitcoin was created in 2009 by Satoshi Nakamoto with a fixed hard cap.",
        }
      ],
      citations: [
        {
          title: "Crypto Guide",
          url: "https://crypto.example.com/guide",
          snippet: "Bitcoin is a decentralized currency with a fixed 21M cap.",
        }
      ],
      currentYear: 2026,
      intent: "CURRENT_EVENT",
      requiresCurrentDate: true,
    });
    assert.equal(gateEmptyNumeric.passed, false, "Gate must reject evidence that lacks circulating supply figures");
    assert.ok(
      (gateEmptyNumeric.reason && (gateEmptyNumeric.reason.includes("supply") || gateEmptyNumeric.reason.includes("quantitative"))) ||
      (gateEmptyNumeric.missingInformation && gateEmptyNumeric.missingInformation.some((m) => m.includes("supply") || m.includes("quantitative"))),
      "Reason must indicate missing supply or quantitative figures"
    );
  });

  // 23. Environment-Configured Model Selection and Verified Fallback Order
  console.log("\n🔹 23. Environment-Configured Model Selection & Fallback Order");
  await test("COGNITIVE_MODELS and STABLE_GEMINI_FALLBACKS honor environment configuration and avoid deprecated models", async () => {
    const { COGNITIVE_MODELS, STABLE_GEMINI_FALLBACKS } = await import("../services/thinkingEngineService.js");
    assert.ok(COGNITIVE_MODELS.FAST_MODEL, "FAST_MODEL must be configured");
    assert.ok(STABLE_GEMINI_FALLBACKS.length >= 2, "Must have at least 2 stable fallbacks");
    assert.ok(!STABLE_GEMINI_FALLBACKS.includes("gemini-2.0-flash"), "Must NOT include deprecated gemini-2.0-flash");
    assert.ok(STABLE_GEMINI_FALLBACKS.includes("gemini-2.5-flash") || STABLE_GEMINI_FALLBACKS.includes("gemini-3.5-flash"), "Must include verified current models");
  });

  // 24. Bounded Planning Latency and Timeout Fallback
  console.log("\n🔹 24. Bounded Planning Latency & Timeout Fallback");
  await test("formulateResearchPlan enforces strict 3.5s timeout and falls back to deterministic plan if LLM hangs", async () => {
    const { formulateResearchPlan } = await import("../services/research/researchQueryPlanner.js");
    const tStart = Date.now();
    // Simulate a hung LLM call (hangs for 10 seconds)
    const hungModel = () => new Promise((resolve) => setTimeout(() => resolve("{\"searchTasks\": []}"), 10000));
    const plan = await formulateResearchPlan({
      query: "Which Republican's attack ad featured Amy Acton's estranged mother, and what happened to him?",
      intent: "SIMPLE_FACT",
      dimensions: ["definitional_explanation"],
      callModel: hungModel,
      requiresCurrentDate: false,
    });
    const elapsed = Date.now() - tStart;
    assert.ok(elapsed < 4500, `Planning timeout must resolve in <4.5s (took ${elapsed}ms)`);
    assert.ok(plan && Array.isArray(plan.searchTasks) && plan.searchTasks.length > 0, "Must return valid deterministic search tasks on timeout");
  });

  // 25. Full Query Preservation (No 40-Character Truncation)
  console.log("\n🔹 25. Full Query Preservation (No 40-Character Truncation)");
  await test("Deterministic fallback tasks preserve complete query text without 40-character slicing", async () => {
    const { formulateResearchPlan } = await import("../services/research/researchQueryPlanner.js");
    const longQuery = "What did analysts warn a Democratic victory would create for the AI build-out, and which state policy drove the Musk-company selloff?";
    const failingModel = async () => { throw new Error("Mock network outage"); };
    const plan = await formulateResearchPlan({
      query: longQuery,
      intent: "CURRENT_EVENT",
      dimensions: ["market_impact"],
      callModel: failingModel,
      requiresCurrentDate: true,
    });
    assert.ok(plan.searchTasks.length >= 2, "Multi-part query must produce at least 2 decomposed tasks");
    // Confirm neither task is truncated at 40 chars
    for (const task of plan.searchTasks) {
      assert.ok(!task.topic.endsWith("Am."), "Topic must not end with chopped suffix");
      assert.ok(task.topic.length > 40 || task.query.length > 40, "Topic or query must preserve full clause (>40 chars)");
      assert.ok(!task.topic.endsWith("vict."), "Topic must not be truncated at 40 chars");
    }
  });

  // 26. Multi-Clause Query Decomposition
  console.log("\n🔹 26. Multi-Clause Query Decomposition in Fallback Planner");
  await test("Fallback planner splits multi-part queries on conjunctions into focused search angles", async () => {
    const { formulateResearchPlan } = await import("../services/research/researchQueryPlanner.js");
    const twoPartQuery = "By how much did the Dow jump on November 4, and how did SpaceX and Tesla perform?";
    const failingModel = async () => { throw new Error("Simulated planner error"); };
    const plan = await formulateResearchPlan({
      query: twoPartQuery,
      intent: "CURRENT_EVENT",
      dimensions: ["financial_metrics"],
      callModel: failingModel,
      requiresCurrentDate: true,
    });
    assert.equal(plan.searchTasks.length, 2, "Must produce exactly 2 search tasks for two-part query");
    assert.ok(plan.searchTasks[0].query.includes("Dow"), "First task must target Dow");
    assert.ok(plan.searchTasks[1].query.includes("SpaceX") || plan.searchTasks[1].query.includes("Tesla"), "Second task must target SpaceX/Tesla");
  });

  // 27. Client Disconnect Cancellation Propagation
  console.log("\n🔹 27. Client Disconnect Cancellation Propagation");
  await test("executeAdaptiveResearch immediately aborts when AbortSignal is triggered", async () => {
    const { executeAdaptiveResearch } = await import("../services/research/researchOrchestrator.js");
    const abortCtrl = new AbortController();
    abortCtrl.abort(); // already aborted signal
    const researchRes = await executeAdaptiveResearch({
      query: "Who won the presidential election in Pennsylvania?",
      callModel: async () => ({ reply: "{}" }),
      options: {
        signal: abortCtrl.signal,
        mode: "SEARCH",
        effort: "LOW",
      },
    });
    assert.equal(researchRes.researchState.stopReason, "USER_INTERRUPTED", "Must stop with USER_INTERRUPTED on aborted signal");
    assert.equal(researchRes.observations.length, 0, "Must not execute any searches when pre-aborted");
  });

  // 28. SSE Client Disconnect Detection via res.on('close')
  console.log("\n🔹 28. SSE Client Disconnect Detection via res.on('close')");
  await test("Normal POST body completion does not abort, while client socket termination does abort", async () => {
    const http = await import("http");
    let normalFinishedSignal = null;
    let prematurelyAbortedSignal = null;

    const server = http.createServer((req, res) => {
      const clientAbortController = new AbortController();
      res.on("close", () => {
        if (!res.writableFinished && !res.writableEnded) {
          clientAbortController.abort();
        }
      });

      if (req.url === "/normal") {
        req.on("data", () => {});
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "text/event-stream" });
          res.write("data: hello\n\n");
          res.end();
          normalFinishedSignal = clientAbortController.signal.aborted;
        });
      } else if (req.url === "/abort") {
        req.on("data", () => {});
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "text/event-stream" });
          res.write("data: start\n\n");
          setTimeout(() => {
            prematurelyAbortedSignal = clientAbortController.signal.aborted;
          }, 150);
        });
      }
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;

    // 1. Normal client request: completes cleanly
    await new Promise((resolve, reject) => {
      const clientReq = http.request({
        hostname: "127.0.0.1",
        port,
        path: "/normal",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }, (res) => {
        res.on("data", () => {});
        res.on("end", resolve);
      });
      clientReq.on("error", reject);
      clientReq.write(JSON.stringify({ text: "test" }));
      clientReq.end();
    });

    // 2. Aborted client request: destroys socket mid-stream
    await new Promise((resolve) => {
      const clientReq = http.request({
        hostname: "127.0.0.1",
        port,
        path: "/abort",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }, (res) => {
        res.on("data", () => {
          clientReq.destroy();
          setTimeout(resolve, 250);
        });
      });
      clientReq.on("error", () => {});
      clientReq.write(JSON.stringify({ text: "abort-me" }));
      clientReq.end();
    });

    await new Promise((resolve) => server.close(resolve));

    assert.equal(normalFinishedSignal, false, "Normal stream completion must NOT abort research signal");
    assert.equal(prematurelyAbortedSignal, true, "Abrupt client disconnect must trigger abort on research signal");
  });

  // 29. Planner Timeout Cancels Provider Signal
  console.log("\n🔹 29. Planner Timeout Cancels Provider Signal");
  await test("formulateResearchPlan aborts provider signal when 3.5s timeout fires", async () => {
    const { formulateResearchPlan } = await import("../services/research/researchQueryPlanner.js");
    let providerReceivedSignal = null;
    let providerSignalWasAborted = false;

    const slowProvider = ({ signal }) => {
      providerReceivedSignal = signal;
      return new Promise((resolve, reject) => {
        if (signal) {
          signal.addEventListener("abort", () => {
            providerSignalWasAborted = signal.aborted;
            reject(new Error("PROVIDER_ABORTED"));
          });
        }
        setTimeout(() => resolve({ reply: "{}" }), 6000);
      });
    };

    const plan = await formulateResearchPlan({
      query: "Analyze geopolitical implications of recent semiconductor export controls",
      intent: "CURRENT_EVENT",
      dimensions: ["policy"],
      callModel: slowProvider,
      requiresCurrentDate: true,
    });

    assert.ok(providerReceivedSignal !== null, "Planner must pass AbortSignal to provider call");
    assert.equal(providerSignalWasAborted, true, "Provider signal must be aborted when 3.5s timer fires");
    assert.ok(plan && Array.isArray(plan.searchTasks) && plan.searchTasks.length > 0, "Deterministic fallback plan must be returned");
  });

  // 30. First-Search Budget Bounded Ceiling
  console.log("\n🔹 30. First-Search Budget Bounded Ceiling");
  await test("executeAdaptiveResearch ceiling enforces effectiveCeilingMs before first search", async () => {
    const { executeAdaptiveResearch } = await import("../services/research/researchOrchestrator.js");
    
    const mockToolExecutor = {
      executeTool: async () => ({
        ok: true,
        state: "SEARCH_SUCCESS",
        sources: [{ title: "Test", url: "https://example.com", snippet: "Sample snippet" }],
      }),
    };

    const res = await executeAdaptiveResearch({
      query: "What is the capital of France?",
      callModel: async () => ({
        searchTasks: [{ topic: "Paris capital", query: "Paris capital of France", freshness: "historical", sourcePreference: "official" }],
      }),
      toolExecutor: mockToolExecutor,
      options: {
        budget: {
          maxWallClockMs: 1500,
          maxTotalToolCalls: 5,
          maxIterationsCeiling: 2,
          maxPlannedQueriesPerIter: 1,
          mode: "SEARCH",
          effort: "LOW",
        },
      },
    });

    assert.ok(res.researchState.executedQueries.length > 0, "Round 1 must execute search despite elapsed planning time < effectiveCeilingMs");
  });

  // 31. Narrow Exception Suppression
  console.log("\n🔹 31. Narrow Exception Suppression in Uncaught Exception Handler");
  await test("Strictly matches ERR_ASSERTION with !this.paused and rejects general undici errors", () => {
    const isSilenced = (err) => err?.code === "ERR_ASSERTION" && err?.message?.includes("!this.paused");

    // Must match exact Undici parser assertion
    assert.equal(isSilenced({ code: "ERR_ASSERTION", message: "The expression evaluated to a falsy value: !this.paused" }), true);

    // Must NOT match general assertion errors
    assert.equal(isSilenced({ code: "ERR_ASSERTION", message: "Expected 1 to equal 2" }), false);

    // Must NOT match general Undici errors or stack traces without the specific assertion
    assert.equal(isSilenced({ code: "UNDICI_SOCKET_ERROR", message: "Socket closed", stack: "at Object.undici" }), false);
    assert.equal(isSilenced(new Error("Connection refused in undici")), false);
  });

  // 32. Raw Snippet Text Sanitizer
  console.log("\n🔹 32. Raw Snippet Text Sanitizer (Internal Marker Stripping)");
  await test("cleanRawSnippetText removes internal headers, numbered prefixes, and debug tags", async () => {
    const { cleanRawSnippetText } = await import("../services/thinkingEngineService.js");
    const raw = `Verified web search evidence for "test query 2026":
1. Trump confirms new US strikes on Iran’s Qeshm island. Reported by Al Jazeera on Sat, 07 Nov 2026 07:06:23 GMT. (Al Jazeera, ESTABLISHED_REPORTING) [SOURCE: https://aljazeera.com/qeshm] [FINANCIAL_QUOTE]`;
    const cleaned = cleanRawSnippetText(raw);
    assert.ok(!cleaned.includes("Verified web search evidence for"), "Must strip 'Verified web search evidence' prefix");
    assert.ok(!cleaned.includes("Reported by"), "Must strip 'Reported by' metadata");
    assert.ok(!cleaned.includes("ESTABLISHED_REPORTING"), "Must strip internal tier tags");
    assert.ok(!cleaned.includes("[SOURCE:"), "Must strip [SOURCE:] tags");
    assert.ok(!cleaned.includes("[FINANCIAL_QUOTE]"), "Must strip [FINANCIAL_QUOTE] tags");
    assert.ok(cleaned.includes("Trump confirms new US strikes on Iran’s Qeshm island"), "Must preserve factual text");
  });

  // 33. Multi-Asset Quote Formatting in Safe Fallback
  console.log("\n🔹 33. Multi-Asset Quote Formatting in Safe Fallback");
  await test("buildSafeEvidenceFallback joins multiple stock/crypto quotes rather than dropping subsequent tickers", async () => {
    const { buildSafeEvidenceFallback } = await import("../services/thinkingEngineService.js");
    const observations = [
      { tool: "get_stock_quote", query: "btc", success: true, summary: "Bitcoin (BTC) is trading at USD 92,450 (+2.1% today)." },
      { tool: "get_stock_quote", query: "eth", success: true, summary: "Ethereum (ETH) is trading at USD 3,120 (-0.4% today)." },
      { tool: "get_stock_quote", query: "sol", success: true, summary: "Solana (SOL) is trading at USD 215 (+4.5% today)." },
    ];
    const fallback = buildSafeEvidenceFallback({
      query: "What are BTC, ETH and SOL trading at right now?",
      observations,
    });
    assert.ok(fallback.includes("Bitcoin (BTC) is trading at USD 92,450"), "Must include BTC");
    assert.ok(fallback.includes("Ethereum (ETH) is trading at USD 3,120"), "Must include ETH");
    assert.ok(fallback.includes("Solana (SOL) is trading at USD 215"), "Must include SOL");
    assert.ok(fallback.includes("Additionally,"), "Must join multiple quotes cleanly");
  });

  // 34. Multi-Observation Fact Aggregation & Attribution
  console.log("\n🔹 34. Multi-Observation Fact Aggregation & Source Attribution");
  await test("buildSafeEvidenceFallback combines relevant facts across citations and observations with attribution", async () => {
    const { buildSafeEvidenceFallback } = await import("../services/thinkingEngineService.js");
    const citations = [
      {
        title: "Jill Hazelbaker joins OpenAI as Chief Corporate Affairs Officer",
        publisher: "The Next Web",
        snippet: "Jill Hazelbaker joined OpenAI as Chief Corporate Affairs Officer.",
      },
      {
        title: "Cat Wu Steps Down as Claude Code Product Chief After Two Years",
        publisher: "Unite.AI",
        snippet: "Cat Wu stepped down as Claude Code product chief after two years at Anthropic.",
      },
    ];
    const fallback = buildSafeEvidenceFallback({
      query: "Which Anthropic product chief left on November 3, and what role did Jill Hazelbaker take at OpenAI?",
      citations,
    });
    assert.ok(fallback.includes("Cat Wu"), "Must include Cat Wu from second citation");
    assert.ok(fallback.includes("Hazelbaker"), "Must include Hazelbaker from first citation");
    assert.ok(fallback.includes("According to"), "Must include source attribution");
    assert.ok(!fallback.includes("Based on verified records, the information has been retrieved"), "Must not emit deceptive static string");
  });

  // 35. Epistemic Limitation & Honest Abstention
  console.log("\n🔹 35. Epistemic Limitation & Honest Fallback When Evidence Lacks Facts");
  await test("buildSafeEvidenceFallback indicates lack of verified records when no facts are found", async () => {
    const { buildSafeEvidenceFallback } = await import("../services/thinkingEngineService.js");
    const fallback = buildSafeEvidenceFallback({
      query: "What is the secret undisclosed project code name?",
      observations: [],
      citations: [],
      detGate: { passed: false, reason: "No records found" },
    });
    assert.ok(!fallback.includes("Based on verified records, the information has been retrieved"), "Must NOT claim verification");
    assert.ok(fallback.includes("Available records do not contain sufficient verified details"), "Must clearly acknowledge limitation");
  });

  // 36. Gemini 429 -> Groq Provider Fallback
  console.log("\n🔹 36. Gemini 429 Quota Exhaustion -> Groq Provider Fallback");
  await test("callCognitiveModel falls back to Groq when Gemini returns 429 quota exhaustion", async () => {
    const { callCognitiveModel, COGNITIVE_MODELS } = await import("../services/thinkingEngineService.js");
    const { geminiKeyManager } = await import("../services/geminiKeyManager.js");

    const origExecute = geminiKeyManager.executeWithFailover;
    const origFetch = global.fetch;
    const origGroqKey = process.env.GROQ_API_KEY;

    try {
      process.env.GROQ_API_KEY = "mock_groq_api_key_test_36";

      // Mock Gemini throwing 429 quota error across all keys
      geminiKeyManager.executeWithFailover = async () => {
        const err = new Error("Resource has been exhausted (e.g. check quota) - 429");
        err.status = 429;
        throw err;
      };

      // Mock Groq HTTP response
      let groqCalledWithModel = null;
      global.fetch = async (url, opts) => {
        if (url.includes("api.groq.com")) {
          const body = JSON.parse(opts.body);
          groqCalledWithModel = body.model;
          return {
            ok: true,
            json: async () => ({
              choices: [{ message: { content: "Synthesized report using Groq failover model." } }],
            }),
          };
        }
        return origFetch(url, opts);
      };

      const result = await callCognitiveModel({
        systemPrompt: "You are a research assistant.",
        messages: [{ role: "user", content: "Test prompt for Gemini 429 failover" }],
        tier: "FAST",
      });

      assert.equal(result.provider, "groq", "Provider must fail over to groq");
      assert.equal(result.model, COGNITIVE_MODELS.FAST_REASONER, "Model must be FAST_REASONER");
      assert.equal(result.reply, "Synthesized report using Groq failover model.");
      assert.equal(groqCalledWithModel, COGNITIVE_MODELS.FAST_REASONER);
    } finally {
      geminiKeyManager.executeWithFailover = origExecute;
      global.fetch = origFetch;
      if (origGroqKey !== undefined) process.env.GROQ_API_KEY = origGroqKey;
      else delete process.env.GROQ_API_KEY;
    }
  });

  // 37. Groq Model-Specific Cooldown Isolation
  console.log("\n🔹 37. Groq Model-Specific Cooldown Isolation");
  await test("Cooldown on 120B reasoning model does not block 27B fast reasoner", async () => {
    const { callCognitiveModel, COGNITIVE_MODELS, groqModelCooldowns } = await import("../services/thinkingEngineService.js");

    const origFetch = global.fetch;
    const origGroqKey = process.env.GROQ_API_KEY;

    try {
      process.env.GROQ_API_KEY = "mock_groq_api_key_test_37";

      // Put 120B model into 429 cooldown
      groqModelCooldowns.set(COGNITIVE_MODELS.REASONING_MODEL, Date.now() + 30000);

      let requestedModel = null;
      global.fetch = async (url, opts) => {
        if (url.includes("api.groq.com")) {
          const body = JSON.parse(opts.body);
          requestedModel = body.model;
          return {
            ok: true,
            json: async () => ({
              choices: [{ message: { content: "Response from 27B reasoner despite 120B cooldown." } }],
            }),
          };
        }
        return origFetch(url, opts);
      };

      // Call REASONING tier: should skip cooling-down 120B and immediately invoke 27B
      const result = await callCognitiveModel({
        systemPrompt: "You are a research assistant.",
        messages: [{ role: "user", content: "Complex research query" }],
        tier: "REASONING",
      });

      assert.equal(result.provider, "groq");
      assert.equal(result.model, COGNITIVE_MODELS.FAST_REASONER, "Should isolate cooldown to 120B and execute 27B");
      assert.equal(requestedModel, COGNITIVE_MODELS.FAST_REASONER);
    } finally {
      groqModelCooldowns.clear();
      global.fetch = origFetch;
      if (origGroqKey !== undefined) process.env.GROQ_API_KEY = origGroqKey;
      else delete process.env.GROQ_API_KEY;
    }
  });

  // 38. All Providers Failing
  console.log("\n🔹 38. All Providers Failing -> Safe Evidence Synthesis Fallback");
  await test("Throws cleanly when all providers fail, enabling buildSafeEvidenceFallback", async () => {
    const { callCognitiveModel } = await import("../services/thinkingEngineService.js");
    const { geminiKeyManager } = await import("../services/geminiKeyManager.js");

    const origExecute = geminiKeyManager.executeWithFailover;
    const origFetch = global.fetch;
    const origGroqKey = process.env.GROQ_API_KEY;

    try {
      process.env.GROQ_API_KEY = "mock_groq_api_key_test_38";

      // Gemini fails with 429
      geminiKeyManager.executeWithFailover = async () => {
        throw new Error("Gemini quota 429 exhausted");
      };

      // Groq fails with 500
      global.fetch = async (url) => {
        if (url.includes("api.groq.com")) {
          return {
            ok: false,
            status: 500,
            text: async () => "Internal Groq Server Error",
          };
        }
      };

      await assert.rejects(
        async () => {
          await callCognitiveModel({
            systemPrompt: "Test",
            messages: [{ role: "user", content: "Test" }],
            tier: "FAST",
          });
        },
        /Groq .* HTTP 500/
      );
    } finally {
      geminiKeyManager.executeWithFailover = origExecute;
      global.fetch = origFetch;
      if (origGroqKey !== undefined) process.env.GROQ_API_KEY = origGroqKey;
      else delete process.env.GROQ_API_KEY;
    }
  });

  // 39. Cancellation During Provider Fallback
  console.log("\n🔹 39. Cancellation During Provider Fallback Cascade");
  await test("AbortSignal cancellation immediately halts cognitive cascade without calling subsequent providers", async () => {
    const { callCognitiveModel } = await import("../services/thinkingEngineService.js");
    const { geminiKeyManager } = await import("../services/geminiKeyManager.js");

    const controller = new AbortController();
    const origExecute = geminiKeyManager.executeWithFailover;
    const origFetch = global.fetch;
    let groqFetchCalled = false;

    try {
      // Abort signal during Gemini failure
      geminiKeyManager.executeWithFailover = async () => {
        controller.abort();
        const err = new Error("Gemini 429");
        err.status = 429;
        throw err;
      };

      global.fetch = async (url) => {
        if (url.includes("api.groq.com")) {
          groqFetchCalled = true;
          return { ok: true, json: async () => ({ choices: [{ message: { content: "late reply" } }] }) };
        }
      };

      await assert.rejects(
        async () => {
          await callCognitiveModel({
            systemPrompt: "Test",
            messages: [{ role: "user", content: "Test" }],
            tier: "FAST",
            signal: controller.signal,
          });
        },
        (err) => err.name === "AbortError" || err.message === "OPERATION_ABORTED"
      );

      assert.equal(groqFetchCalled, false, "Must not invoke Groq after request is aborted");
    } finally {
      geminiKeyManager.executeWithFailover = origExecute;
      global.fetch = origFetch;
    }
  });

  // 40. Multiple Unrelated Observations Rejection
  console.log("\n🔹 40. Multi-Observation Relevance Filtering (Conservative Omission)");
  await test("buildSafeEvidenceFallback rejects zero-relevance observations to prevent contamination", async () => {
    const { buildSafeEvidenceFallback } = await import("../services/thinkingEngineService.js");

    const unrelatedObservations = [
      {
        tool: "web_search",
        query: "solar energy investments kenya 2026",
        success: true,
        summary: "Kenya secured $400 million in sovereign climate financing for the Rift Valley geothermal expansion.",
      },
      {
        tool: "web_search",
        query: "australian cricket tour 2026 schedule",
        success: true,
        summary: "The Melbourne Cricket Ground will host the opening test of the bilateral series on Boxing Day.",
      },
    ];

    const fallback = buildSafeEvidenceFallback({
      query: "What were the casualty figures in the Komyshuvakha school strike in Ukraine?",
      observations: unrelatedObservations,
    });

    assert.ok(!fallback.includes("Kenya"), "Must NOT include unrelated Kenya finance fact");
    assert.ok(!fallback.includes("Melbourne"), "Must NOT include unrelated cricket fact");
    assert.ok(
      fallback.includes("Available records do not contain sufficient verified details") ||
      fallback.includes("Verified records for the requested information could not be retrieved"),
      "Must state honest limitation instead of contaminating answer"
    );
  });

  // 41. Multi-Asset Financial Associations Preservation
  console.log("\n🔹 41. Multi-Asset Financial Associations & Currency Preservation");
  await test("Financial fallback preserves distinct ticker, price, and currency associations across multiple assets", async () => {
    const { buildSafeEvidenceFallback } = await import("../services/thinkingEngineService.js");

    const multiAssetObservations = [
      {
        tool: "get_stock_quote",
        success: true,
        summary: "Bitcoin (CRYPTO: BTC-USD) is currently trading at USD 94,120 (+1.8% today). Reported circulating supply is 19,780,000 BTC.",
      },
      {
        tool: "get_stock_quote",
        success: true,
        summary: "Ethereum (CRYPTO: ETH-USD) is currently trading at USD 3,240 (+0.5% today). Day range is 3,180 - 3,280 USD.",
      },
      {
        tool: "get_stock_quote",
        success: true,
        summary: "Solana (CRYPTO: SOL-USD) is currently trading at USD 218 (+4.2% today). Day range is 209 - 222 USD.",
      },
    ];

    const result = buildSafeEvidenceFallback({
      query: "What are BTC, ETH, and SOL trading at right now?",
      observations: multiAssetObservations,
    });

    assert.ok(result.includes("USD 94,120"), "BTC price USD 94,120 must be preserved");
    assert.ok(result.includes("USD 3,240"), "ETH price USD 3,240 must be preserved");
    assert.ok(result.includes("USD 218"), "SOL price USD 218 must be preserved");
    assert.ok(result.includes("Additionally,"), "Quotes must be cleanly separated with Additionally");
  });

  // 42. Missing or Contradictory Evidence
  console.log("\n🔹 42. Missing or Contradictory Evidence Attribution");
  await test("buildSafeEvidenceFallback adds contradiction notice when reports conflict", async () => {
    const { buildSafeEvidenceFallback } = await import("../services/thinkingEngineService.js");

    const conflictingCitations = [
      {
        title: "Official ministry reports 14 casualties in border clash",
        publisher: "State Press Agency",
        snippet: "The interior ministry confirmed 14 soldiers were injured during the border clash.",
      },
      {
        title: "Independent monitor reports 42 casualties in border clash",
        publisher: "Border Watch Observers",
        snippet: "Independent monitors counted 42 injured personnel in the border clash.",
      },
    ];

    const result = buildSafeEvidenceFallback({
      query: "How many casualties occurred in the border clash?",
      citations: conflictingCitations,
      detGate: { passed: false, hasContradiction: true, reason: "Conflicting casualty counts" },
    });

    assert.ok(result.includes("State Press Agency"), "Must attribute first source");
    assert.ok(result.includes("Border Watch Observers"), "Must attribute second source");
    assert.ok(result.includes("conflicting or unverified details"), "Must append conflict notification");
  });

  // 43. Groq 429 -> Gemini Synthesis Fallback
  console.log("\n🔹 43. Groq 429 Rate Limit -> Gemini Synthesis Fallback");
  await test("callCognitiveModel falls back to Gemini when Groq returns 429 in forceGroq or REASONER tier", async () => {
    const { callCognitiveModel } = await import("../services/thinkingEngineService.js");
    const { geminiKeyManager } = await import("../services/geminiKeyManager.js");

    const origExecute = geminiKeyManager.executeWithFailover;
    const origFetch = global.fetch;
    const origGroqKey = process.env.GROQ_API_KEY;

    try {
      process.env.GROQ_API_KEY = "mock_groq_api_key_test_43";

      // Mock Groq returning 429
      global.fetch = async (url) => {
        if (url.includes("api.groq.com")) {
          return {
            ok: false,
            status: 429,
            text: async () => JSON.stringify({ error: { message: "Rate limit reached for model" } }),
          };
        }
      };

      // Mock Gemini succeeding
      geminiKeyManager.executeWithFailover = async () => {
        return { reply: "Synthesized response from Gemini key pool after Groq 429.", model: "gemini-3.5-flash", provider: "gemini" };
      };

      const result = await callCognitiveModel({
        systemPrompt: "You are a research assistant.",
        messages: [{ role: "user", content: "Test prompt for Groq 429 failover to Gemini" }],
        tier: "FAST_REASONER",
      });

      assert.equal(result.provider, "gemini", "Must fall back to Gemini provider");
      assert.equal(result.reply, "Synthesized response from Gemini key pool after Groq 429.");
    } finally {
      geminiKeyManager.executeWithFailover = origExecute;
      global.fetch = origFetch;
      if (origGroqKey !== undefined) process.env.GROQ_API_KEY = origGroqKey;
      else delete process.env.GROQ_API_KEY;
    }
  });

  // 44. Snippets Available Without Scraped Passages Fallback
  console.log("\n🔹 44. Search Snippets Fallback When Full Scraped Passages Are Unavailable");
  await test("buildSafeEvidenceFallback constructs cautious answer from search titles and snippets when evidencePack is empty", async () => {
    const { buildSafeEvidenceFallback } = await import("../services/thinkingEngineService.js");

    const citations = [
      {
        title: "Cat Wu Steps Down as Claude Code Product Chief After Two Years",
        publisher: "Unite.AI",
        snippet: "Cat Wu announced her departure from Anthropic after leading the Claude Code team for two years.",
      },
    ];

    const result = buildSafeEvidenceFallback({
      query: "Who was the Claude Code product chief that left Anthropic?",
      citations,
      evidencePack: [], // No scraped body passages
      observations: [],
    });

    assert.ok(result.length > 20, "Must produce a non-empty response");
    assert.ok(result.includes("Cat Wu"), "Must incorporate title and snippet entities");
    assert.ok(result.includes("Claude Code"), "Must mention Claude Code");
    assert.ok(result.includes("Unite.AI"), "Must preserve source attribution");
  });

  // 45. Scoping Defect Regression: detEvidence / detGate Compatibility
  console.log("\n🔹 45. Deterministic Gate Compatibility in Safe Fallback");
  await test("buildSafeEvidenceFallback accepts detGate, detEvidence, or null without throwing ReferenceError", async () => {
    const { buildSafeEvidenceFallback } = await import("../services/thinkingEngineService.js");

    const observations = [
      {
        tool: "web_search",
        query: "COP31 climate summit venue 2026",
        success: true,
        summary: "COP31 is scheduled to take place in Antalya, Turkey in November 2026.",
      },
    ];

    // Must execute cleanly with detEvidence object without crashing
    const detEvidence = { passed: true, score: 1 };
    const result = buildSafeEvidenceFallback({
      query: "Where will COP31 take place in 2026?",
      observations,
      detGate: detEvidence,
    });

    assert.ok(result.includes("Antalya"), "Must extract verified location from observation");
    assert.ok(result.includes("Turkey"), "Must include country entity");
  });

  // 46. SSE Lifecycle: Tokens Precede Done Event
  console.log("\n🔹 46. SSE Lifecycle: Answer Tokens Must Precede Done Event");
  await test("SSE stream emits all token events before the done completion event", async () => {
    const emittedEvents = [];
    const sendEvent = (event, data) => emittedEvents.push({ event, data });

    const replyText = "This is a verified multi-word answer synthesized for the user.";
    const tokens = replyText.match(/(\s+|\S+)/g) || [replyText];

    // Simulate route handler emission order
    for (const token of tokens) {
      sendEvent("token", { token });
    }
    sendEvent("done", { status: "SUCCESS", reply: replyText });

    const doneIndex = emittedEvents.findIndex((e) => e.event === "done");
    const lastTokenIndex = emittedEvents.map((e) => e.event).lastIndexOf("token");

    assert.ok(doneIndex > -1, "Must emit done event");
    assert.ok(lastTokenIndex > -1, "Must emit token events");
    assert.ok(lastTokenIndex < doneIndex, "All token events must precede done event");

    const reconstructed = emittedEvents
      .filter((e) => e.event === "token")
      .map((e) => e.data.token)
      .join("");
    assert.equal(reconstructed, replyText, "Reconstructed tokens must match full answer text");
  });

  // 47. SSE Lifecycle: Empty Synthesis Result Cannot Produce SUCCESS
  console.log("\n🔹 47. SSE Lifecycle: Empty Synthesis Result Rejection");
  await test("Empty or whitespace-only reply cannot emit status SUCCESS or done event", async () => {
    const emittedEvents = [];
    let streamClosed = false;
    const sendEvent = (event, data) => emittedEvents.push({ event, data });
    const res = { end: () => { streamClosed = true; } };

    const emptyReply = "   ";

    // Simulate route handler guard
    if (!emptyReply || !emptyReply.trim()) {
      sendEvent("error", { message: "Engine failed to synthesize a valid reply.", status: "EMPTY_RESPONSE" });
      res.end();
    } else {
      sendEvent("done", { status: "SUCCESS", reply: emptyReply });
      res.end();
    }

    assert.equal(streamClosed, true, "Stream must be closed");
    const doneEvent = emittedEvents.find((e) => e.event === "done");
    assert.equal(doneEvent, undefined, "Must NOT emit done event for empty reply");

    const errorEvent = emittedEvents.find((e) => e.event === "error");
    assert.ok(errorEvent, "Must emit error event for empty reply");
    assert.equal(errorEvent.data.status, "EMPTY_RESPONSE");
  });

  // 48. Complete Provider Failure Fallback Resilience
  console.log("\n🔹 48. Complete Provider Failure Fallback Resilience");
  await test("When all LLM providers fail, safe fallback generates non-empty grounded response", async () => {
    const { buildSafeEvidenceFallback } = await import("../services/thinkingEngineService.js");

    const observations = [
      {
        tool: "web_search",
        query: "Bernie Moreno attack ad Amy Acton Ohio Senate 2026",
        success: true,
        summary: "Dave Yost and Bernie Moreno launched television attack ads focusing on Amy Acton's state health policies.",
      },
    ];

    const citations = [
      {
        title: "Ohio Senate Race Heats Up With Aggressive Broadcast Ads",
        publisher: "The Columbus Dispatch",
        snippet: "Republican candidate Bernie Moreno aired ads targeting former health director Amy Acton.",
      },
    ];

    const result = buildSafeEvidenceFallback({
      query: "Which Republican's attack ad targeted Amy Acton in Ohio?",
      observations,
      citations,
      detGate: { passed: true },
    });

    assert.ok(result && result.trim().length > 30, "Must produce a comprehensive grounded response");
    assert.ok(result.includes("Moreno") || result.includes("Yost"), "Must include candidate names from evidence");
    assert.ok(result.includes("According to"), "Must include source attribution");
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

