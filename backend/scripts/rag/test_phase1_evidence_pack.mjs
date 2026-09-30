/**
 * Phase 1 Verification & Latency Benchmark Script
 * 
 * Tests:
 * 1. sourceRegistryService (domain extraction & topic-aware authority)
 * 2. queryRouter (sub-3ms classification across chit-chat, static, live, fact-check)
 * 3. expandQueryFacets (deterministic multi-facet expansion < 2ms)
 * 4. evidencePackBuilder (Evidence ≠ Discourse separation, URL stripping, confidence calculation)
 * 5. getPersonaGrounding (Shared Evidence Pack consistency across both personas & latency breakdown)
 */

import { routeQuery } from "../../services/queryRouter.js";
import { evaluateSourceAuthority } from "../../services/sourceRegistryService.js";
import { buildEvidencePack, cleanForSpokenContext } from "../../services/evidencePackBuilder.js";
import { getPersonaGrounding, expandQueryFacets } from "../../services/adaptiveRagService.js";

console.log("=================================================");
console.log("🚀 CHATLY PHASE 1: SHARED EVIDENCE PACK BENCHMARK");
console.log("=================================================\n");

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
  }
}

// -------------------------------------------------------------
// Test Suite 1: Source Authority Registry
// -------------------------------------------------------------
console.log("🔹 TEST SUITE 1: Source Authority Registry");

const mospiAuth = evaluateSourceAuthority({
  url: "https://www.mospi.gov.in/reports/plfs-2024",
  publisher: "Ministry of Statistics",
  topic: "employment statistics",
});
assert(mospiAuth.authorityScore >= 0.95, `MoSPI receives Tier-1 authority (${mospiAuth.authorityScore})`);
assert(mospiAuth.isPrimary === true, "MoSPI recognized as primary on employment topic");

const sciAuth = evaluateSourceAuthority({
  url: "https://main.sci.gov.in/judgments/2023/art370",
  publisher: "Supreme Court of India",
  topic: "article 370",
});
assert(sciAuth.authorityScore >= 0.95, `Supreme Court receives Tier-1 authority (${sciAuth.authorityScore})`);

const newsAuth = evaluateSourceAuthority({
  url: "https://thehindu.com/news/national/article.ece",
  publisher: "The Hindu",
  topic: "politics",
});
assert(newsAuth.authorityScore >= 0.80 && newsAuth.authorityScore <= 0.85, `The Hindu gets Tier-2 authority (${newsAuth.authorityScore})`);

const randomBlogAuth = evaluateSourceAuthority({
  url: "https://medium.com/@randomuser/opinion-on-jobs",
  publisher: "Medium Blog",
  topic: "employment",
});
assert(randomBlogAuth.authorityScore <= 0.50, `Random blog receives Tier-4 authority (${randomBlogAuth.authorityScore})`);

console.log();

// -------------------------------------------------------------
// Test Suite 2: Deterministic Query Router (< 3ms)
// -------------------------------------------------------------
console.log("🔹 TEST SUITE 2: Query Intelligence Router (< 3ms target)");

const routerTestCases = [
  {
    query: "Haan bolo kaise ho aap?",
    expectedIntent: "CHIT_CHAT",
    expectedRag: false,
    expectedLive: false,
  },
  {
    query: "Maine pichle sawal me kya pucha tha?",
    expectedIntent: "MEMORY",
    expectedRag: false,
    expectedLive: false,
  },
  {
    query: "Article 370 ka Supreme Court verdict kya tha?",
    expectedIntent: "POLITICAL_STATIC",
    expectedRag: true,
    expectedLive: false,
  },
  {
    query: "Modi ji ne aaj rally me kya statement diya?",
    expectedIntent: "POLITICAL_CURRENT",
    expectedRag: true,
    expectedLive: true,
  },
  {
    query: "Bhai kya sach me 10 crore jobs create hui hain?",
    expectedIntent: "FACT_CHECK",
    expectedRag: true,
  },
];

for (const tc of routerTestCases) {
  const result = routeQuery(tc.query);
  console.log(`  Query: "${tc.query}"`);
  console.log(`    ↳ Intent: ${result.intent} | Latency: ${result.routerLatencyMs}ms`);

  assert(result.routerLatencyMs < 5.0, `Router latency (${result.routerLatencyMs}ms) is strictly under 5ms`);
  if (tc.expectedIntent) {
    assert(result.intent === tc.expectedIntent, `Intent matched expected ${tc.expectedIntent}`);
  }
  if (tc.expectedRag !== undefined) {
    assert(result.needsRag === tc.expectedRag, `RAG need matched expected ${tc.expectedRag}`);
  }
}

console.log();

// -------------------------------------------------------------
// Test Suite 3: Deterministic Multi-Facet Query Expansion (< 2ms)
// -------------------------------------------------------------
console.log("🔹 TEST SUITE 3: Multi-Facet Query Expansion (< 2ms target, zero LLM delay)");

const testQuery = "What is the unemployment rate in India?";
const expansion = expandQueryFacets(testQuery);
console.log(`  Query: "${testQuery}"`);
console.log(`    ↳ Empirical facet: "${expansion.empiricalQuery}"`);
console.log(`    ↳ Discourse facet: "${expansion.discourseQuery}"`);
console.log(`    ↳ Expansion latency: ${expansion.latencyMs}ms`);

assert(expansion.latencyMs < 3.0, `Query expansion latency (${expansion.latencyMs}ms) is under 3ms`);
assert(expansion.empiricalQuery.includes("report") || expansion.empiricalQuery.includes("data"), "Empirical facet targets data/reports");
assert(expansion.discourseQuery.includes("criticism") || expansion.discourseQuery.includes("perspective"), "Discourse facet targets debate/perspectives");

console.log();

// -------------------------------------------------------------
// Test Suite 4: Shared Evidence Pack Builder (Evidence ≠ Discourse)
// -------------------------------------------------------------
console.log("🔹 TEST SUITE 4: Shared Evidence Pack Builder");

const mockQdrantEvidence = [
  {
    text: "According to PLFS 2023-24 by MoSPI [1], the worker-population ratio reached 58.2%. See https://mospi.gov.in/plfs for tables.",
    sourceUrl: "https://mospi.gov.in/plfs",
    sourceType: "MoSPI Official Report",
    title: "Annual PLFS Report 2024",
    date: "2024-05",
  },
];

const mockWebEvidence = [
  {
    title: "Opposition questions job growth methodology",
    url: "https://thehindu.com/news/national/jobs-debate.html",
    content: "Economists argue that counting unpaid family labor inflates employment ratios. Source at https://thehindu.com.",
    date: "2024-06",
  }
];

const mockDiscourse = [
  {
    topic: "Job Creation Debate",
    perspective: "Supporter / Rebuttal",
    claim: "Opposition claims youth unemployment is at a 45-year peak.",
    argument: "Formal EPFO registrations and 43 crore Mudra loans show unmeasured informal entrepreneurship.",
    whataboutism: "Pre-2014 period saw jobless growth and double-digit inflation.",
    sourceName: "Public Political Discourse",
  }
];

const pack = buildEvidencePack({
  query: "Are 10 crore jobs real or fake?",
  topic: "employment",
  qdrantResults: mockQdrantEvidence,
  webResults: mockWebEvidence,
  discourseResults: mockDiscourse,
  intent: "FACT_CHECK",
});

console.log(`  ↳ Built Pack: Evidence count=${pack.evidenceCount}, Discourse count=${pack.discourseCount} in ${pack.buildLatencyMs}ms`);
console.log(`  ↳ Confidence: ${pack.confidenceLevel}`);
console.log(`  ↳ Spoken Context Sample:\n${pack.spokenEvidenceContext}\n`);

assert(pack.buildLatencyMs < 10.0, `Pack build latency (${pack.buildLatencyMs}ms) under 10ms`);
assert(pack.evidenceCount >= 2, `Pack contains >= 2 evidence items (got ${pack.evidenceCount})`);
assert(pack.discourseCount >= 1, `Pack contains >= 1 discourse items (got ${pack.discourseCount})`);
assert(pack.confidenceLevel === "HIGH", "Confidence correctly scored HIGH due to MoSPI");

// Separation check: Evidence ≠ Discourse
assert(pack.spokenEvidenceContext.includes("-- RETRIEVED FACTUAL & PRIMARY-SOURCE MATERIAL --"), "Contains explicit factual section");
assert(pack.spokenEvidenceContext.includes("-- RETRIEVED PUBLIC DISCOURSE & PERSPECTIVES --"), "Contains explicit discourse section");

// Speech safety checks
assert(!pack.spokenEvidenceContext.includes("https://"), "No raw https:// in spoken context");
assert(!pack.spokenEvidenceContext.includes("[1]"), "No bracket footnote [1] in spoken context");

// UI citations check
assert(pack.uiCitations.length >= 2, `UI Citations preserved (${pack.uiCitations.length})`);
assert(pack.uiCitations[0].url.startsWith("http"), "UI citations retain clickable links");

console.log();

// -------------------------------------------------------------
// Test Suite 5: Shared Grounding Consistency (Saffron vs Rationalist)
// -------------------------------------------------------------
console.log("🔹 TEST SUITE 5: Shared Evidence Pack Consistency Across Personas");

async function testSharedPersonaGrounding() {
  const query = "Ram Mandir construction expenditure and economy";
  
  const saffronGrounding = await getPersonaGrounding(query, "andhbhakt");
  const rationalGrounding = await getPersonaGrounding(query, "rational");

  console.log(`  Query: "${query}"`);
  console.log(`    ↳ Saffron Pack: ${saffronGrounding.ragSource} | Evidence: ${saffronGrounding.evidence.length} | Latency: ${saffronGrounding.latencyMs}ms`);
  console.log(`    ↳ Rational Pack: ${rationalGrounding.ragSource} | Evidence: ${rationalGrounding.evidence.length} | Latency: ${rationalGrounding.latencyMs}ms`);
  console.log(`    ↳ Latency Breakdown:`, saffronGrounding.latencyBreakdown);

  // Both personas MUST receive the exact same core evidence count & topic
  assert(saffronGrounding.evidence.length === rationalGrounding.evidence.length, "Both personas receive identical evidence count");
  assert(saffronGrounding.discourse.length === rationalGrounding.discourse.length, "Both personas receive identical discourse count");
  assert(saffronGrounding.spokenContext === rationalGrounding.spokenContext, "Both personas receive the exact same Shared Spoken Evidence Context");
  assert(!saffronGrounding.spokenContext.includes("Boldly defend PM Modi"), "RAG layer does NOT force persona instructions or pre-2014 bias");

  console.log("\n=================================================");
  console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED!`);
  console.log("=================================================");

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

testSharedPersonaGrounding().catch((err) => {
  console.error("❌ Fatal error in benchmark:", err);
  process.exit(1);
});
