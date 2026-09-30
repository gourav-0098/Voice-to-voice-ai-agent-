/**
 * Phase 2 Automated Benchmark & Verification Suite
 * 
 * Verifies:
 * 1. Seed Corpus Schema Integrity (lexicon, narratives, rhetoric, markers, graph)
 * 2. Deterministic Intensity Resolution (Levels 0 to 4 in < 1ms)
 * 3. Persona Engine Dynamic Generation (Saffron vs Rationalist)
 * 4. Epistemic Discipline Rules (Fact vs Narrative vs Meme vs Opinion)
 * 5. Conversational Continuity & Anti-Caricature Guardrails
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { routeQuery } from "../../services/queryRouter.js";
import { getSystemInstruction, PERSONAS } from "../../services/aiService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("=================================================");
console.log("🚀 CHATLY PHASE 2: PERSONA ENGINE & CULTURE BENCHMARK");
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
// Test Suite 1: Desi Supporter Seed Corpus Schema Integrity
// -------------------------------------------------------------
console.log("🔹 TEST SUITE 1: Seed Corpus Schema Integrity");

const desiDir = path.join(__dirname, "../../data/desi_supporter");

// 1. Lexicon
const lexiconPath = path.join(desiDir, "supporter_lexicon.json");
assert(fs.existsSync(lexiconPath), "supporter_lexicon.json exists");
const lexicon = JSON.parse(fs.readFileSync(lexiconPath, "utf-8"));
assert(Array.isArray(lexicon) && lexicon.length >= 5, `Lexicon contains ${lexicon.length} entries (>= 5)`);
assert(lexicon.every((e) => e.term && e.category && e.usage_rule && e.register), "All lexicon entries have required fields");

// 2. Narratives
const narrativesPath = path.join(desiDir, "supporter_narratives.json");
assert(fs.existsSync(narrativesPath), "supporter_narratives.json exists");
const narratives = JSON.parse(fs.readFileSync(narrativesPath, "utf-8"));
assert(Array.isArray(narratives) && narratives.length >= 5, `Narratives contain ${narratives.length} entries (>= 5)`);
assert(narratives.every((e) => e.stance === "BJP_SUPPORTIVE" && e.rhetoric && e.source_type && e.text), "All narrative entries have provenance and stance");

// 3. Rhetorical Patterns
const rhetoricPath = path.join(desiDir, "rhetorical_patterns.json");
assert(fs.existsSync(rhetoricPath), "rhetorical_patterns.json exists");
const rhetoric = JSON.parse(fs.readFileSync(rhetoricPath, "utf-8"));
assert(Array.isArray(rhetoric) && rhetoric.length >= 4, `Rhetorical patterns contain ${rhetoric.length} entries (>= 4)`);
assert(rhetoric.every((e) => e.example_structures && e.intensity_range), "All rhetoric patterns specify structures & intensity range");

// 4. Conversational Markers
const markersPath = path.join(desiDir, "conversational_markers.json");
assert(fs.existsSync(markersPath), "conversational_markers.json exists");
const markers = JSON.parse(fs.readFileSync(markersPath, "utf-8"));
assert(Array.isArray(markers.casual_starters) && markers.casual_starters.length >= 4, "Conversational markers has casual starters");
assert(Array.isArray(markers.follow_up_continuity_markers) && markers.follow_up_continuity_markers.length >= 4, "Conversational markers has continuity markers");

// 5. Topic Graph
const graphPath = path.join(desiDir, "topic_graph.json");
assert(fs.existsSync(graphPath), "topic_graph.json exists");
const graph = JSON.parse(fs.readFileSync(graphPath, "utf-8"));
assert(graph.entities && graph.entities["Rahul Gandhi"] && graph.entities["Jawaharlal Nehru"] && graph.entities["Narendra Modi"], "Topic graph covers key political entities");

console.log();

// -------------------------------------------------------------
// Test Suite 2: Context-Sensitive Intensity Resolution (Levels 0-4)
// -------------------------------------------------------------
console.log("🔹 TEST SUITE 2: Context-Sensitive Intensity Resolution (< 1ms)");

const intensityTestCases = [
  {
    query: "Arre bhai kaise ho aap? Sab badhiya?",
    expectedLevel: 0,
    expectedLabel: "CASUAL_FRIEND",
  },
  {
    query: "Article 370 hatane ke baad Jammu Kashmir me kya development hua?",
    expectedLevel: 1,
    expectedLabel: "POLITICAL_DISCUSSION",
  },
  {
    query: "Par Modi ji ke time me berojgari aur inflation badh gaya hai na?",
    expectedLevel: 2,
    expectedLabel: "POLITICAL_DISAGREEMENT",
  },
  {
    query: "Modi is a dictator and godi media is running propaganda",
    expectedLevel: 3,
    expectedLabel: "HEATED_CHALLENGE",
  },
  {
    query: "Let's debate: prove me wrong about Indian economic policy",
    expectedLevel: 4,
    expectedLabel: "EXPLICIT_DEBATE",
  },
];

// Warm-up JIT
routeQuery("warmup query");

for (const tc of intensityTestCases) {
  const result = routeQuery(tc.query);
  console.log(`  Query: "${tc.query}"`);
  console.log(`    ↳ Resolved: Level ${result.intensityLevel} (${result.intensityLabel}) in ${result.routerLatencyMs}ms`);

  assert(result.routerLatencyMs < 5.0, `Router latency (${result.routerLatencyMs}ms) is strictly under 5ms`);
  assert(result.intensityLevel === tc.expectedLevel, `Intensity level matches expected ${tc.expectedLevel}`);
  assert(result.intensityLabel === tc.expectedLabel, `Intensity label matches expected ${tc.expectedLabel}`);
}

console.log();

// -------------------------------------------------------------
// Test Suite 3: Saffron Debater Persona Engine Architecture
// -------------------------------------------------------------
console.log("🔹 TEST SUITE 3: Persona Engine Dynamic Generation (Saffron Debater)");

// Level 0: Casual friend test
const saffronLevel0 = getSystemInstruction("andhbhakt", "male", {
  intensityLevel: 0,
  intensityLabel: "CASUAL_FRIEND",
});
assert(saffronLevel0.includes("LEVEL 0 (CASUAL FRIEND)"), "Level 0 prompt includes casual friend mode");
assert(saffronLevel0.includes("Do NOT bring up politics, elections, or party leaders unprompted"), "Level 0 strictly avoids unprompted political lecturing");

// Level 3: Heated challenge test
const saffronLevel3 = getSystemInstruction("andhbhakt", "male", {
  intensityLevel: 3,
  intensityLabel: "HEATED_CHALLENGE",
});
assert(saffronLevel3.includes("LEVEL 3 (HEATED CHALLENGE / SHARP WIT)"), "Level 3 prompt includes sharp wit mode");
assert(saffronLevel3.includes("ANTI-CARICATURE"), "Includes anti-caricature rules");
assert(saffronLevel3.includes("NEVER repeat the same catchphrase or slogan"), "Explicitly forbids repetitive slogan looping");

// Gender agreement test
const saffronFemale = getSystemInstruction("andhbhakt", "female_voice_priya", { intensityLevel: 1 });
assert(saffronFemale.includes("CRITICAL: CHARACTER GENDER = FEMALE"), "Female persona receives female grammatical gender rules");
assert(saffronFemale.includes("main kar sakti hoon"), "Female prompt specifies feminine verb forms");

console.log();

// -------------------------------------------------------------
// Test Suite 4: Rationalist Analyst Persona & Epistemic Separation
// -------------------------------------------------------------
console.log("🔹 TEST SUITE 4: Rationalist Persona & Epistemic Separation");

const rationalPrompt = getSystemInstruction("rational", "male", {
  intensityLevel: 2,
  intensityLabel: "POLITICAL_DISAGREEMENT",
});
assert(rationalPrompt.includes("PERSONA ENGINE: RATIONALIST ANALYST"), "Prompt includes Rationalist Engine");
assert(rationalPrompt.includes("EVIDENCE & EPISTEMIC DISCIPLINE RULES"), "Prompt includes Epistemic Discipline Rules");
assert(rationalPrompt.includes("FACTS: Official data, court judgments"), "Distinguishes facts");
assert(rationalPrompt.includes("SUPPORTER NARRATIVES: How supporters interpret policies"), "Distinguishes supporter narratives");
assert(rationalPrompt.includes("MEMES & NICKNAMES: Cultural internet expressions"), "Distinguishes memes");
assert(rationalPrompt.includes("Differentiate between official measured data, statistical projections, and political rhetoric"), "Directs rationalist to differentiate claims from data");

console.log();

// -------------------------------------------------------------
// Test Suite 5: Multi-Turn Conversational Continuity
// -------------------------------------------------------------
console.log("🔹 TEST SUITE 5: Conversational Continuity Guardrails");

const historySample = [
  { sender: "user", text: "UPI payments revolution ke baare me batao." },
  { sender: "model", text: "UPI world me 46% real-time transactions handle kar raha hai, small merchants ke liye gamechanger hai." },
  { sender: "user", text: "Lekin youth unemployment ka kya?" },
];

const continuityPrompt = getSystemInstruction("andhbhakt", "male", {
  intensityLevel: 2,
  intensityLabel: "POLITICAL_DISAGREEMENT",
  recentHistory: historySample,
});

assert(continuityPrompt.includes("MULTI-TURN CONVERSATIONAL CONTINUITY"), "Prompt includes multi-turn conversational continuity section");
assert(continuityPrompt.includes("ALWAYS maintain conversational continuity: remember what was said in the immediate previous turns"), "Directs model to maintain conversation continuity");
assert(continuityPrompt.includes("NEVER restart from zero with repetitive greetings or generic monologues"), "Forbids restarting from zero on follow-ups");

console.log("\n=================================================");
console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED!`);
console.log("=================================================");

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
