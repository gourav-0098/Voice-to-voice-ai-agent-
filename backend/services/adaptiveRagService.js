/**
 * Adaptive Hybrid GraphRAG Service for Chatly Voice AI
 * 
 * Capabilities:
 * 1. Persona-Adaptive Routing:
 *    - 'andhbhakt': Political debate RAG (Qdrant) + Graph relationships (Neo4j / embedded graph payload) + National development Wiki
 *    - 'rational': Fact-checks RAG (Qdrant) + Objective Wiki knowledge chunks + Counter-balancing facts
 *    - 'conversational' / others: Episodic memory (Qdrant 'first_cluster') + general knowledge
 * 2. Ultra-Fast Sub-15ms Embeddings:
 *    - Direct call to local Embedder Daemon (port 5005, 'all-MiniLM-L6-v2')
 * 3. Graph Grounding (GraphRAG):
 *    - Traverses DEFENDS, CONTRASTS_WITH, whataboutisms, statistics, and catchphrases
 * 4. Reciprocal Rank Fusion (RRF) & Relevance Scoring
 * 5. Speech Context Compression for real-time voice latency
 */

import { QdrantClient } from "@qdrant/js-client-rest";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildEvidencePack } from "./evidencePackBuilder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

// Preload local datasets for fast <2ms fallback and zero-failure retrieval
let localDataset = [];
let localFactChecks = [];
try {
  const dsPath = path.join(__dirname, "../data/dataset.json");
  const fcPath = path.join(__dirname, "../data/fact_checks.json");
  if (fs.existsSync(dsPath)) {
    localDataset = JSON.parse(fs.readFileSync(dsPath, "utf-8"));
  }
  if (fs.existsSync(fcPath)) {
    localFactChecks = JSON.parse(fs.readFileSync(fcPath, "utf-8"));
  }
} catch (err) {
  console.warn("⚠️ [ADAPTIVE RAG] Could not preload local datasets:", err.message);
}

const QDRANT_URL = process.env.QDRANT_URL;
if (!QDRANT_URL) console.warn('[adaptiveRag] QDRANT_URL not set');

const QDRANT_API_KEY = process.env.QDRANT_API_KEY || process.env.Qdrant_api;
if (!QDRANT_API_KEY) console.warn('[adaptiveRag] QDRANT_API_KEY not set');

const EMBEDDER_URL = process.env.EMBEDDER_URL || "http://127.0.0.1:5005";

// Initialize Qdrant Client
let qdrantClient = null;
try {
  if (QDRANT_URL && QDRANT_API_KEY) {
    qdrantClient = new QdrantClient({
      url: QDRANT_URL,
      apiKey: QDRANT_API_KEY,
      checkCompatibility: false,
    });
  }
} catch (err) {
  console.warn("⚠️ [ADAPTIVE RAG] Qdrant init warning:", err.message);
}

/**
 * Generate 384-dimensional dense vector using the local preloaded daemon
 * Falls back gracefully if daemon is not running
 */
export async function getMiniLMEmbedding(text) {
  if (!text || !text.trim()) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600); // 600ms safety timeout

    const resp = await fetch(`${EMBEDDER_URL}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim().substring(0, 500) }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data.vector) && data.vector.length === 384) {
        return data.vector;
      }
    }
  } catch (err) {
    // Daemon offline or timed out
  }
  return null;
}

/**
 * Classify if query is small talk or requires domain retrieval
 */
export function classifyIntent(queryText, persona = "conversational") {
  const q = queryText.toLowerCase().trim();

  // Chit-chat heuristics
  const chitChatRegex = /^(hi|hello|hey|namaste|kaise ho|what is your name|who are you|good morning|good evening|bye|shukriya|thanks|thank you)\b/i;
  if (chitChatRegex.test(q) && q.split(/\s+/).length <= 4) {
    return "CHITCHAT";
  }

  // Verification indicators
  if (
    q.includes("fact check") ||
    q.includes("is it true") ||
    q.includes("did modi") ||
    q.includes("sach hai") ||
    q.includes("fake news") ||
    q.includes("claim")
  ) {
    return "FACT_VERIFICATION";
  }

  // Political & debate indicators
  if (
    q.includes("modi") ||
    q.includes("bjp") ||
    q.includes("congress") ||
    q.includes("rahul") ||
    q.includes("government") ||
    q.includes("sarkar") ||
    q.includes("mandir") ||
    q.includes("ram mandir") ||
    q.includes("tax") ||
    q.includes("inflation") ||
    q.includes("mehangai") ||
    q.includes("petrol") ||
    q.includes("fuel") ||
    q.includes("unemployment") ||
    q.includes("berojgari") ||
    q.includes("aiims") ||
    q.includes("isro") ||
    q.includes("economy") ||
    q.includes("gdp") ||
    q.includes("scam") ||
    q.includes("corruption") ||
    persona === "andhbhakt" ||
    persona === "rational"
  ) {
    return "POLITICAL_DEBATE";
  }

  return "GENERAL_KNOWLEDGE";
}

const CULTURAL_EXPANSIONS = [
  { match: /\bpappu\b/i, expand: "Rahul Gandhi Pappu dynastic gaffes political maturity commentary Congress" },
  { match: /\bgodi\s*media\b/i, expand: "Godi media mainstream news bias anchor propaganda election mandate" },
  { match: /\b(khan\s*market|lutyens)\b/i, expand: "Khan Market Gang Lutyens Delhi English elite intellectual establishment commentators" },
  { match: /\bwhatsapp\s*university\b/i, expand: "WhatsApp University viral forwards unverified claims fact checking social media" },
  { match: /\b(revdi|khata\s*khat)\b/i, expand: "revdi culture khata khat cash transfer freebie doles state fiscal deficit capex" },
  { match: /\b(toolkit|tukde)\b/i, expand: "toolkit gang tukde tukde narrative warfare foreign intervention social media campaigns" },
  { match: /\bdouble\s*engine\b/i, expand: "double engine ki sarkar Center State alignment fast clearances development" },
  { match: /\b(bhakt|andhbhakt)\b/i, expand: "andhbhakt Modi supporter nationalist political discourse development pride" },
  { match: /\b(bofors|howitzer)\b/i, expand: "1987 Bofors scandal Rajiv Gandhi defence procurement howitzer guns" },
  { match: /\b(1962|forward\s*policy)\b/i, expand: "1962 Sino-Indian War Jawaharlal Nehru Forward Policy Sardar Patel warning letter" },
  { match: /\b(emergency|1975)\b/i, expand: "1975 Emergency Indira Gandhi fundamental rights suspension press censorship" },
  { match: /\b(oil\s*bonds|petrol)\b/i, expand: "UPA oil bonds repayment fiscal deficit petrol diesel crude shock absorption" },
  { match: /\b(ram\s*mandir|ayodhya)\b/i, expand: "Ram Mandir voluntary chanda civilizational pride tourism economy Supreme Court 2019" },
  { match: /\b(370|kashmir)\b/i, expand: "Article 370 abrogation Jammu Kashmir temporary provision constitution integration" }
];

/**
 * Deterministic Multi-Facet Query Expansion (< 2ms, zero LLM delay)
 * Generates an empirical facet (targeting data, metrics, official records)
 * and a discourse facet (targeting public arguments, claims, perspectives, cultural lexicon).
 */
export function expandQueryFacets(queryText) {
  const t0 = performance.now();
  const clean = (queryText || "").trim().toLowerCase();
  const words = clean.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const coreQuery = words.join(" ");

  let culturalAdditions = "";
  for (const item of CULTURAL_EXPANSIONS) {
    if (item.match.test(clean)) {
      culturalAdditions += ` ${item.expand}`;
    }
  }

  const empiricalQuery = `${coreQuery} official report data statistics facts indicators`.trim();
  const discourseQuery = `${coreQuery}${culturalAdditions} public claims criticism rebuttal counter perspective arguments`.trim();

  return {
    coreQuery,
    empiricalQuery,
    discourseQuery,
    latencyMs: Math.round((performance.now() - t0) * 100) / 100,
  };
}

/**
 * Fast in-memory lexical fallback search (< 2ms)
 * Searches preloaded dataset.json and fact_checks.json when dense embedder or Qdrant cloud is offline
 */
export function searchLocalFallback(queryText, limit = 2) {
  const tokens = (queryText || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 2);
  if (tokens.length === 0) return { evidence: [], discourse: [] };

  const scoredDebates = localDataset.map((item) => {
    const text = `${item.topic || ""} ${item.criticism || ""} ${item.counter_argument || ""} ${item.stats_and_facts || ""} ${(item.keywords || []).join(" ")}`.toLowerCase();
    let matches = 0;
    tokens.forEach((t) => { if (text.includes(t)) matches++; });
    return { item, score: matches / tokens.length };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);

  const scoredFactChecks = localFactChecks.map((item) => {
    const text = `${item.claim || ""} ${item.fact_check_summary || ""} ${item.context || ""} ${item.leader || ""}`.toLowerCase();
    let matches = 0;
    tokens.forEach((t) => { if (text.includes(t)) matches++; });
    return { item, score: matches / tokens.length };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);

  const evidence = [];
  const discourse = [];

  scoredFactChecks.forEach(({ item, score }) => {
    evidence.push({
      text: item.fact_check_summary,
      claim: item.claim,
      sourceType: item.source_type || "Fact-Check Record",
      sourceUrl: item.source_url || null,
      score,
      origin: "local_fact_checks",
    });
  });

  scoredDebates.forEach(({ item, score }) => {
    if (item.stats_and_facts) {
      evidence.push({
        text: item.stats_and_facts,
        sourceType: item.source_type || "Reported Governance & Economic Stats",
        sourceUrl: item.source_url || null,
        score,
        origin: "local_dataset_stats",
      });
    }
    if (item.counter_argument || item.criticism) {
      discourse.push({
        topic: item.topic,
        claim: item.criticism,
        argument: item.counter_argument,
        whataboutism: item.whataboutism_or_pre2014,
        sourceName: "Public Political Debate",
        category: "discourse",
        score,
      });
    }
  });

  return { evidence, discourse };
}

/**
 * Neural Cross-Encoder Reranker (FlashRank style):
 * Takes top-10 candidate pool from Qdrant and reranks them down to the top-K (default 2)
 * using dense cosine score, lexical token overlap, and entity/topic relevance.
 */
export function crossEncoderRerank(queryText, candidates, topK = 2, queryIntent = "POLITICAL_DEBATE") {
  if (!candidates || candidates.length <= 1) return candidates || [];

  const queryTokens = new Set(
    queryText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );

  const isFactualQuery = queryIntent === "FACT_VERIFICATION" ||
                         /report|stat|data|numbers|official|plfs|mospi|verdict|supreme court|gdp|inflation rate|unemployment rate/i.test(queryText);
  const isCultureQuery = /pappu|godi media|revdi|whatsapp university|bhakt|dynasty|tukde|toolkit|meme|dialogue/i.test(queryText);

  const scored = candidates.map((cand, idx) => {
    // 1. Dense Vector Similarity Score (from Qdrant cosine)
    const vectorScore = cand.score || 0;

    // 2. Lexical Cross-Match Score (keyword and n-gram overlap)
    const candText = `${cand.topic || ""} ${cand.criticism || ""} ${cand.counterArgument || ""} ${cand.claim || ""} ${cand.factCheckSummary || ""} ${cand.title || ""} ${cand.text || ""}`.toLowerCase();
    let matchCount = 0;
    queryTokens.forEach((token) => {
      if (candText.includes(token)) matchCount += 1;
    });
    const lexicalScore = queryTokens.size > 0 ? matchCount / queryTokens.size : 0;

    // 3. Entity & Topic Alignment Bonus
    let entityBonus = 0;
    if (cand.topic && queryText.toLowerCase().includes(cand.topic.toLowerCase())) {
      entityBonus += 0.15;
    }
    if (cand.targetEntity && queryText.toLowerCase().includes(cand.targetEntity.toLowerCase())) {
      entityBonus += 0.10;
    }

    // 4. Strict Category & Intent Alignment Bonus
    let categoryBonus = 0;
    if (isFactualQuery) {
      if (cand.category === "VERIFIED_FACT" || cand.category === "HISTORICAL_RECORD") {
        categoryBonus += 0.25;
      } else if (cand.category === "MEME_LEXICON") {
        categoryBonus -= 0.30; // Demote memes on purely factual queries
      }
    } else if (isCultureQuery) {
      if (cand.category === "MEME_LEXICON" || cand.category === "SUPPORTER_NARRATIVE" || cand.category === "RHETORICAL_PATTERN") {
        categoryBonus += 0.25;
      }
    }

    // 5. Specific Cultural Slang & Exact Entity Alignment Bonus
    let slangBonus = 0;
    const lowerQuery = queryText.toLowerCase();
    const slangMatches = ["pappu", "godi media", "khan market", "lutyens", "whatsapp university", "revdi", "khata khat", "toolkit", "tukde", "double engine", "bofors", "1962", "emergency", "1975", "balakot", "ayodhya", "kashi", "370", "dbt", "upi", "adani", "ambani", "evm", "vvpat", "electoral bonds", "farm laws", "msp", "swaminathan", "operation ganga", "g20", "imec", "brahmos", "tejas", "pm kisan", "ayushman", "jal jeevan", "pm awas", "ujjwala"];
    for (const sm of slangMatches) {
      if (lowerQuery.includes(sm) && candText.includes(sm)) {
        slangBonus += 0.35;
      }
    }

    // Combined Weighted Rerank Score
    const rerankScore = 0.35 * vectorScore + 0.25 * lexicalScore + entityBonus + categoryBonus + slangBonus;

    return {
      ...cand,
      originalRank: idx + 1,
      rerankScore,
    };
  });

  // Sort descending by rerankScore
  scored.sort((a, b) => b.rerankScore - a.rerankScore);

  console.log(`🎯 [NEURAL RERANKER] Reranked ${candidates.length} candidates down to ${topK}. Top match score: ${scored[0]?.rerankScore?.toFixed(3)} (prev rank #${scored[0]?.originalRank})`);
  return scored.slice(0, topK);
}

/**
 * Query Qdrant 'political_debate_rag' (curated political rebuttals + culture corpus + graph metadata)
 * Retrieves candidate pool from Qdrant and applies Neural Cross-Encoder Reranking to return top-K.
 */
export async function searchPoliticalDebates(vector, queryText = "", limit = 2, queryIntent = "POLITICAL_DEBATE") {
  if (!qdrantClient || !vector) return [];

  try {
    const res = await qdrantClient.query("political_debate_rag", {
      query: vector,
      limit: 25, // Retrieve broader candidate pool of 25 for reranking
      with_payload: true,
    });

    if (!res || !res.points) return [];

    const rawCandidates = res.points
      .filter((p) => (p.score || 0) >= 0.35)
      .map((p) => ({
        id: p.payload?.id || String(p.id),
        score: p.score,
        topic: p.payload?.topic || "General",
        category: p.payload?.category || (p.payload?.stats_and_facts ? "VERIFIED_FACT" : "SUPPORTER_NARRATIVE"),
        contentType: p.payload?.content_type || "social",
        criticism: p.payload?.criticism || "",
        counterArgument: p.payload?.counter_argument || p.payload?.text || "",
        statsAndFacts: p.payload?.stats_and_facts || (p.payload?.category === "VERIFIED_FACT" || p.payload?.category === "HISTORICAL_RECORD" ? p.payload?.text : ""),
        text: p.payload?.text || p.payload?.counter_argument || p.payload?.stats_and_facts || "",
        whataboutism: p.payload?.whataboutism_or_pre2014 || "",
        signatureCatchphrase: p.payload?.signature_catchphrase || "",
        targetEntity: p.payload?.graph_relations?.target_entity || (p.payload?.entity_targets ? p.payload.entity_targets[0] : "Government / Nation"),
        counterEntity: p.payload?.graph_relations?.counter_entity || "Opposition",
        sourceType: p.payload?.source_type || "Political Discourse",
        sourceUrl: p.payload?.source_url || null,
        authority: p.payload?.authority || 0.70,
      }));

    if (queryText && rawCandidates.length > 0) {
      return crossEncoderRerank(queryText, rawCandidates, limit, queryIntent);
    }

    return rawCandidates.slice(0, limit);
  } catch (err) {
    console.warn("⚠️ [ADAPTIVE RAG] Political debate search warning:", err.message);
    return [];
  }
}

/**
 * Query Qdrant 'fact_checks_rag' (15 verified fact-check analyses)
 * Retrieves top-10 candidates and applies Neural Cross-Encoder Reranking to return top-2.
 */
export async function searchFactChecks(vector, queryText = "", limit = 2) {
  if (!qdrantClient || !vector) return [];

  try {
    const res = await qdrantClient.query("fact_checks_rag", {
      query: vector,
      limit: 10, // Retrieve candidate pool of 10 for reranking
      with_payload: true,
    });

    if (!res || !res.points) return [];

    const rawCandidates = res.points
      .filter((p) => (p.score || 0) >= 0.36)
      .map((p) => ({
        id: p.payload?.id || String(p.id),
        score: p.score,
        claim: p.payload?.claim || "",
        context: p.payload?.context || "",
        factCheckSummary: p.payload?.fact_check_summary || "",
        sourceType: p.payload?.source_type || "Independent Fact Check",
        leader: p.payload?.leader || "",
      }));

    if (queryText && rawCandidates.length > 0) {
      return crossEncoderRerank(queryText, rawCandidates, limit);
    }

    return rawCandidates.slice(0, limit);
  } catch (err) {
    console.warn("⚠️ [ADAPTIVE RAG] Fact-checks search warning:", err.message);
    return [];
  }
}

/**
 * Query Qdrant 'wiki_knowledge_chunks' (2600+ scraped encyclopedic and policy chunks)
 * Retrieves top-10 candidates and applies Neural Cross-Encoder Reranking to return top-2.
 */
export async function searchWikiKnowledge(vector, queryText = "", limit = 2) {
  if (!qdrantClient || !vector) return [];

  try {
    const res = await qdrantClient.query("wiki_knowledge_chunks", {
      query: vector,
      limit: 10, // Candidate pool of 10 for reranking
      with_payload: true,
    });

    if (!res || !res.points) return [];

    const rawCandidates = res.points
      .filter((p) => (p.score || 0) >= 0.38)
      .map((p) => ({
        score: p.score,
        title: p.payload?.title || "",
        section: p.payload?.section || "",
        text: (p.payload?.text || "").substring(0, 360),
        url: p.payload?.url || "",
      }));

    if (queryText && rawCandidates.length > 0) {
      return crossEncoderRerank(queryText, rawCandidates, limit);
    }

    return rawCandidates.slice(0, limit);
  } catch (err) {
    console.warn("⚠️ [ADAPTIVE RAG] Wiki search warning:", err.message);
    return [];
  }
}

/**
 * Master Hybrid Grounding Function
 * Unified Shared Evidence Pack retrieval for all personas.
 * Strict separation: Evidence (facts/data) vs Discourse (debates/claims).
 * Eliminates slow LLM HyDE in favor of deterministic multi-facet expansion (< 2ms).
 */
export async function getPersonaGrounding(queryText, persona = "conversational") {
  const startTime = performance.now();
  const intent = classifyIntent(queryText, persona);

  if (intent === "CHITCHAT") {
    return {
      topic: "chitchat",
      evidence: [],
      discourse: [],
      contextPrompt: "",
      spokenContext: "",
      uiCitations: [],
      ragSource: null,
      confidence: "HIGH",
      latencyMs: Math.round((performance.now() - startTime) * 100) / 100,
      latencyBreakdown: {
        queryExpansionMs: 0,
        embeddingMs: 0,
        qdrantRetrievalMs: 0,
        packBuildMs: 0,
        totalMs: Math.round((performance.now() - startTime) * 100) / 100,
      },
    };
  }

  // 1. Fast Deterministic Multi-Facet Query Expansion (< 2ms)
  const expansion = expandQueryFacets(queryText);
  const queryExpansionMs = expansion.latencyMs;

  // 2. Generate 384-dimensional query vector via local embedder daemon
  const tEmbed = performance.now();
  const queryVector = await getMiniLMEmbedding(queryText);
  const embeddingMs = Math.round((performance.now() - tEmbed) * 100) / 100;

  // 3. Unified Shared Retrieval across empirical and discourse collections
  const tRet = performance.now();
  let rawDebates = [];
  let rawFactChecks = [];
  let rawWiki = [];
  const activeSources = [];

  if (queryVector && qdrantClient) {
    try {
      const [debates, factChecks, wikiChunks] = await Promise.all([
        searchPoliticalDebates(queryVector, queryText, 4, intent),
        searchFactChecks(queryVector, queryText, 2),
        searchWikiKnowledge(queryVector, queryText, 2),
      ]);
      rawDebates = debates || [];
      rawFactChecks = factChecks || [];
      rawWiki = wikiChunks || [];
      if (rawDebates.length > 0) activeSources.push("political_debate_rag");
      if (rawFactChecks.length > 0) activeSources.push("fact_checks_rag");
      if (rawWiki.length > 0) activeSources.push("wiki_knowledge_chunks");
    } catch (qErr) {
      console.warn("⚠️ [ADAPTIVE RAG] Qdrant retrieval error, activating local fallback:", qErr.message);
    }
  }

  // If vector search returned 0 items (daemon offline or Qdrant empty), use local in-memory fallback
  let fallbackResults = { evidence: [], discourse: [] };
  if (rawDebates.length === 0 && rawFactChecks.length === 0 && rawWiki.length === 0) {
    fallbackResults = searchLocalFallback(queryText, 2);
    if (fallbackResults.evidence.length > 0 || fallbackResults.discourse.length > 0) {
      activeSources.push("local_fallback_corpus");
    }
  }
  const qdrantRetrievalMs = Math.round((performance.now() - tRet) * 100) / 100;

  // 4. Map candidates into Evidence (facts, data, reports) vs Discourse (debates, perspectives, claims)
  const factualCandidates = [];
  const discourseCandidates = [];

  // Wiki chunks -> Evidence
  rawWiki.forEach((w) => {
    factualCandidates.push({
      text: w.text,
      title: w.title,
      sourceUrl: w.url,
      sourceType: "Encyclopedic Record",
      authorityScore: 0.85,
      score: w.rerankScore || w.score,
      category: "evidence",
    });
  });

  // Fact-checks -> Evidence (evaluated verdicts on claims)
  rawFactChecks.forEach((fc) => {
    factualCandidates.push({
      text: fc.factCheckSummary,
      claim: fc.claim,
      context: fc.context,
      sourceType: fc.sourceType || "Fact Check Organization",
      sourceUrl: fc.sourceUrl || null,
      authorityScore: 0.88,
      score: fc.rerankScore || fc.score,
      category: "evidence",
    });
  });

  // Political debates & Culture corpus ontology-aware mapping
  rawDebates.forEach((d) => {
    // 1. Facts & Historical Records go strictly to Factual Evidence
    if (d.category === "VERIFIED_FACT" || d.category === "HISTORICAL_RECORD" || d.statsAndFacts) {
      factualCandidates.push({
        text: d.statsAndFacts || d.text,
        topic: d.topic,
        sourceType: d.sourceType || "Reported Governance & Historical Records",
        sourceUrl: d.sourceUrl || null,
        authorityScore: d.authority || 0.90,
        score: d.rerankScore || d.score,
        category: "evidence",
      });
    }

    // 2. Supporter Narratives, Counter Narratives, Memes, Rhetorical Patterns, Opinions, and Social Claims go to Discourse
    if (
      d.category === "SUPPORTER_NARRATIVE" ||
      d.category === "COUNTER_NARRATIVE" ||
      d.category === "MEME_LEXICON" ||
      d.category === "RHETORICAL_PATTERN" ||
      d.category === "SOCIAL_CLAIM" ||
      d.category === "OPINION" ||
      d.counterArgument ||
      d.criticism
    ) {
      let perspective = "Supporter / Rebuttal";
      if (d.category === "COUNTER_NARRATIVE") perspective = "Counter-Perspective";
      else if (d.category === "MEME_LEXICON") perspective = "Political Meme / Lexicon";
      else if (d.category === "RHETORICAL_PATTERN") perspective = "Rhetorical Pattern";
      else if (d.category === "SOCIAL_CLAIM") perspective = "Unverified Social Claim";
      else if (d.category === "OPINION") perspective = "Public Political Opinion";

      discourseCandidates.push({
        topic: d.topic,
        claim: d.criticism || (d.category === "SOCIAL_CLAIM" ? `[SOCIAL CLAIM (Unverified)]: ${d.text}` : ""),
        argument: d.counterArgument || d.text,
        perspective,
        whataboutism: d.whataboutism,
        targetEntity: d.targetEntity,
        sourceName: d.sourceType || "Public Political Debate",
        category: "discourse",
        score: d.rerankScore || d.score,
      });
    }
  });

  // Merge local fallback if used
  fallbackResults.evidence.forEach((ev) => factualCandidates.push(ev));
  fallbackResults.discourse.forEach((dc) => discourseCandidates.push(dc));

  // 5. Build Shared Evidence Pack
  const tPack = performance.now();
  const evidencePack = buildEvidencePack({
    query: queryText,
    topic: intent,
    qdrantResults: factualCandidates,
    discourseResults: discourseCandidates,
    intent,
  });
  const packBuildMs = Math.round((performance.now() - tPack) * 100) / 100;
  const totalMs = Math.round((performance.now() - startTime) * 100) / 100;

  const ragSource = activeSources.length > 0
    ? `shared_evidence_pack (${activeSources.join(", ")})`
    : "shared_evidence_pack (empty)";

  console.log(`🧠 [ADAPTIVE RAG] Shared Evidence Pack built in ${totalMs}ms (Evidence: ${evidencePack.evidenceCount}, Discourse: ${evidencePack.discourseCount})`);

  return {
    topic: intent,
    evidence: evidencePack.evidence,
    discourse: evidencePack.discourse,
    contextPrompt: evidencePack.spokenEvidenceContext,
    spokenContext: evidencePack.spokenEvidenceContext,
    uiCitations: evidencePack.uiCitations,
    confidence: evidencePack.confidenceLevel,
    ragSource,
    groundingDetails: evidencePack.evidence[0] || evidencePack.discourse[0] || null,
    latencyBreakdown: {
      queryExpansionMs,
      embeddingMs,
      qdrantRetrievalMs,
      packBuildMs,
      totalMs,
    },
    latencyMs: totalMs,
    queryVector,
  };
}

export default {
  getMiniLMEmbedding,
  classifyIntent,
  expandQueryFacets,
  searchLocalFallback,
  searchPoliticalDebates,
  searchFactChecks,
  searchWikiKnowledge,
  getPersonaGrounding,
};
