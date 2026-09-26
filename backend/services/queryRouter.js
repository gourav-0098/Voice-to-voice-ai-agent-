/**
 * Fast Deterministic Query Intelligence Router for Chatly Voice AI
 * 
 * Target Latency: < 3ms (zero LLM calls, zero network roundtrips)
 * 
 * Classifies speech queries into actionable retrieval pathways:
 * - CHIT_CHAT: Greetings, compliments, short conversational turns -> Bypass RAG (TTFT ~100ms)
 * - MEMORY: Questions referencing prior dialogue or user facts -> Search local session memory
 * - POLITICAL_STATIC: Historical, legal, constitutional questions -> Qdrant Static RAG
 * - POLITICAL_CURRENT: Breaking speeches, live today events, recent statements -> Parallel Live Search
 * - FACT_CHECK: Explicit claims, numerical assertions, viral fact-checks -> Structured Evidence Verification
 * - GENERAL_KNOWLEDGE: Science, concepts, definitions -> Qdrant / Wiki Knowledge
 */

// Chit chat greetings & pleasantries
const CHIT_CHAT_PATTERN = /\b(hi|hello|hey|namaste|pranam|kaise ho|kya hal|kya haal|what is your name|who are you|good morning|good afternoon|good evening|good night|bye|alvida|shukriya|dhanyawad|thanks|thank you|aap kaun ho|tum kaun ho|bolona|haan bolo|kya chal raha hai|sab badhiya)\b/i;

// Memory recall patterns
const MEMORY_PATTERN = /(what did i (say|tell|ask)|maine kya (kaha|bola|pucha)|remember when|do you remember|pehle maine|last question|previous question|pichla sawal|pichle sawal)/i;

const LIVE_BREAKING_PATTERN = /\b(today|aaj|aaj ka|aaj ki|tonight|yesterday|kal ka|kal ki|latest|breaking|recent|abhi|current|ab tak|right now|live|update|statement today|bhashan|rally)\b/i;

const DEEP_VERIFICATION_PATTERN = /\b(deep fact check|thoroughly verify|detail me check|detail fact check|cross verify|sach hai ya jhooth|is it actually true|fact check this)\b/i;

const FACT_CHECK_PATTERN = /\b(fact check|is it true|sach hai|fake news|claim|stat|percentage|crore jobs|did modi|did congress|kya yeh sach hai|jhuth hai|asliyat kya hai)\b/i;

// Political keywords checked with word boundaries to avoid false positives (e.g. 'aap' in 'aap kaise ho')
const POLITICAL_KEYWORDS = [
  "\\bmodi\\b", "\\bbjp\\b", "\\bcongress\\b", "\\brahul\\b", "\\bgandhi\\b", "\\bkejriwal\\b", "\\bsarkar\\b",
  "\\bgovernment\\b", "\\belection\\b", "\\bchunav\\b", "\\bvote\\b", "\\bvoter\\b", "\\bparliament\\b", "\\bsansad\\b",
  "\\bsupreme court\\b", "\\barticle 370\\b", "\\bram mandir\\b", "\\bayodhya\\b", "\\bucc\\b", "\\bcaa\\b",
  "\\bnrc\\b", "\\bplfs\\b", "\\bunemployment\\b", "\\bberojgari\\b", "\\bnaukri\\b", "\\bscam\\b", "\\bcorruption\\b",
  "\\bghotala\\b", "\\binflation\\b", "\\bmehangai\\b", "\\bpetrol\\b", "\\bdiesel\\b", "\\bgdp\\b", "\\beconomy\\b",
  "\\bchina border\\b", "\\blac\\b", "\\bpakistan\\b", "\\bsurgical strike\\b", "\\bkisan\\b", "\\bfarmer\\b",
  "\\bmsp\\b", "\\bprotest\\b", "\\bschemes\\b", "\\byojana\\b", "\\bmudra\\b", "\\bpm awas\\b", "\\bration\\b"
];

const STATIC_POLITICAL_INDICATORS = [
  "history", "itihas", "when was", "kab hua", "origin", "background",
  "article 370", "supreme court verdict", "constitution", "samvidhan",
  "preamble", "amendment", "act 19", "emergency 1975", "babri", "ayodhya verdict"
];

/**
 * Deterministically routes user speech query in < 3ms
 * 
 * @param {string} queryText - User's transcribed speech
 * @param {Object} [options]
 * @param {string} [options.persona] - Active character persona (e.g. 'andhbhakt', 'priya', 'rational')
 * @param {number} [options.historyLength] - Number of previous turns in dialogue
 * @returns {Object} Route decision
 */
export function routeQuery(queryText, { persona = "default", historyLength = 0 } = {}) {
  const tStart = performance.now();
  const q = (queryText || "").trim();
  const lowerQ = q.toLowerCase();
  const wordCount = lowerQ.split(/\s+/).filter(Boolean).length;

  let intent = "GENERAL_KNOWLEDGE";
  let mode = "FAST";
  let needsLiveSearch = false;
  let needsRag = true;
  let confidence = 0.90;
  let detectedTopic = "general";

  // Check 0: Deep verification trigger
  if (DEEP_VERIFICATION_PATTERN.test(lowerQ)) {
    mode = "DEEP";
  }

  // Check 1: Chit-chat / Short conversational turns (up to 7 words)
  if (wordCount <= 7 && CHIT_CHAT_PATTERN.test(lowerQ) && !POLITICAL_KEYWORDS.some((kw) => new RegExp(kw, "i").test(lowerQ))) {
    intent = "CHIT_CHAT";
    needsRag = false;
    needsLiveSearch = false;
    confidence = 0.98;
  }
  // Check 2: Conversational Memory recall
  else if (MEMORY_PATTERN.test(lowerQ)) {
    intent = "MEMORY";
    needsRag = false;
    needsLiveSearch = false;
    confidence = 0.95;
  }
  // Check 3: Fact-Check & Claims
  else if (FACT_CHECK_PATTERN.test(lowerQ)) {
    intent = "FACT_CHECK";
    needsRag = true;
    detectedTopic = "fact_check";
    // If it mentions today/latest, also fire live search
    if (LIVE_BREAKING_PATTERN.test(lowerQ)) {
      needsLiveSearch = true;
    }
  }
  // Check 4: Political detection
  else {
    const isPolitical = POLITICAL_KEYWORDS.some((kw) => new RegExp(kw, "i").test(lowerQ));

    if (isPolitical) {
      detectedTopic = "politics";
      const isStatic = STATIC_POLITICAL_INDICATORS.some((ind) => lowerQ.includes(ind));
      const isLive = LIVE_BREAKING_PATTERN.test(lowerQ);

      if (isLive) {
        intent = "POLITICAL_CURRENT";
        needsLiveSearch = true;
        needsRag = true;
      } else if (isStatic) {
        intent = "POLITICAL_STATIC";
        needsLiveSearch = false; // Strictly Qdrant indexed knowledge
        needsRag = true;
      } else {
        // General political debate / factual inquiry
        intent = "POLITICAL_DEBATE";
        needsRag = true;
        needsLiveSearch = false;
      }
    } else {
      // General question: check if current live query (e.g. today's weather/scores)
      if (LIVE_BREAKING_PATTERN.test(lowerQ)) {
        intent = "CURRENT_EVENTS";
        needsLiveSearch = true;
        needsRag = false;
      } else {
        intent = "GENERAL_KNOWLEDGE";
        needsRag = wordCount > 3; // very short non-chit-chat queries can skip heavy rag
        needsLiveSearch = false;
      }
    }
  }

  const routerLatencyMs = Math.round((performance.now() - tStart) * 100) / 100;

  return {
    query: q,
    intent,
    mode,
    needsRag,
    needsLiveSearch,
    detectedTopic,
    confidence,
    routerLatencyMs,
  };
}

export default {
  routeQuery,
};
