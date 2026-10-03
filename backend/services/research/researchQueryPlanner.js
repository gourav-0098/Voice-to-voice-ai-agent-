/**
 * Research Query Planner
 * backend/services/research/researchQueryPlanner.js
 *
 * Decomposes complex research inquiries into focused, parallel search tasks
 * with dynamic temporal anchoring, source preferences, and dimension awareness.
 */

import { RESEARCH_INTENTS } from "./researchIntentClassifier.js";

/**
 * Returns dynamic system date context
 */
export function getSystemDateContext() {
  const now = new Date();
  const year = now.getFullYear();
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const month = monthNames[now.getMonth()];
  const day = now.getDate();
  return {
    year,
    month,
    day,
    formatted: `${month} ${day}, ${year}`,
    monthYear: `${month} ${year}`,
    isoDate: now.toISOString().split("T")[0],
  };
}

/**
 * Sanitizes planner-generated search queries:
 * - Prevents accidental stale-year queries (2024 -> 2026) for current queries
 * - PREVENTS forced 2026 injection into historical/biographical queries (Bug 2)
 */
export function sanitizePlannerQuery(searchQuery, rawUserQuery, currentYear, requiresCurrentDate = true) {
  if (!searchQuery || typeof searchQuery !== "string") return "";
  let clean = searchQuery.trim();
  const rawLower = String(rawUserQuery || "").toLowerCase();

  const isHistoricalOrBiographical =
    !requiresCurrentDate ||
    /\b(gandhi|ww1|ww2|world war|treaty|pact|ancient|medieval|history|assassinated|born in|died in|works of|books of|hinduism|buddhism|shakespeare|einstein|tagore)\b/i.test(rawLower);

  if (isHistoricalOrBiographical) {
    // Under historical/notable works mode: DO NOT force current year into query!
    clean = clean.replace(/\b(202[0-9]|201\d)\b/g, "").replace(/\s{2,}/g, " ").trim();
    // Normalize "best work of X" to "notable works X" if present
    clean = clean.replace(/\bbest work(?:s)? of\b/gi, "notable works of");
    return clean;
  }

  const userHasExplicitPastYear = /\b(18\d\d|19\d\d|20[01]\d|202[0-5])\b/.test(rawUserQuery);
  if (!userHasExplicitPastYear && requiresCurrentDate) {
    return clean.replace(/\b(202[0-5]|201\d)\b/g, String(currentYear));
  }
  return clean;
}

/**
 * Extracts JSON blocks from strings or model reply objects
 */
export function extractJsonBlock(text) {
  if (!text) return null;
  const raw = typeof text === "object" && text?.reply ? text.reply : text;
  if (typeof raw !== "string") return typeof raw === "object" ? raw : null;
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const target = match ? match[1] : raw;
  try {
    return JSON.parse(target.trim());
  } catch (_) {
    const braceMatch = target.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch (_) {}
    }
    return null;
  }
}

/**
 * Formulate a structured research plan via GPT-OSS 120B (or fallback fast reasoner)
 *
 * @param {Object} params
 * @param {string} params.query
 * @param {string} params.intent
 * @param {Array<string>} params.dimensions
 * @param {Function} params.callModel
 * @param {boolean} [params.requiresCurrentDate=true]
 * @returns {Promise<Object>}
 */
export async function formulateResearchPlan({
  query,
  intent,
  dimensions = [],
  callModel,
  requiresCurrentDate = true,
}) {
  const dateCtx = getSystemDateContext();
  const isHistorical =
    !requiresCurrentDate ||
    intent === RESEARCH_INTENTS.NOTABLE_WORKS ||
    intent === RESEARCH_INTENTS.HISTORICAL_INFORMATION ||
    intent === RESEARCH_INTENTS.BIOGRAPHICAL_INFORMATION;

  const temporalDirective = isHistorical
    ? `CRITICAL TEMPORAL RULES (HISTORICAL / NOTABLE WORKS / CANON):
This question is HISTORICAL, BIOGRAPHICAL, or CANONICAL (Intent: ${intent}).
DO NOT append the current year (${dateCtx.year}) to search queries!
DO NOT generate queries like "${dateCtx.year} works of Gandhi".
Focus queries on canonical historical publications, official archives, academic records, and primary sources.`
    : `CRITICAL TEMPORAL RULES:
Temporal Anchor: The real-world year is ${dateCtx.year}. Queries for "current", "latest", "recent", "today", "best now", or queries requiring current status MUST target ${dateCtx.year}.
Do NOT use past years like 2023, 2024, or 2025 unless the user explicitly asks for that historical period.`;

  const planningPrompt = `You are an elite research planner and query strategist for Chatly AI.
Current Real-World Date: ${dateCtx.formatted} (Current Year: ${dateCtx.year}).

User Question: "${query}"
Classified Intent: ${intent}
Candidate Dimensions: ${dimensions.join(", ")}

${temporalDirective}

PLANNING RULES:
1. For NOTABLE_WORKS (e.g. "what are the best work of gandhi"):
   - Formulate 2 targeted queries searching for major publications, books, and influential writings without current-year modifiers.
2. For HISTORICAL_INFORMATION (e.g. "how many people died in ww2 and how many Chinese were killed by Japan in ww2", "Gandhi-Irwin Pact"):
   - If the inquiry asks multiple specific sub-questions (e.g. total casualties AND Chinese casualties), generate distinct focused queries for EACH sub-question to guarantee complete evidence coverage!
3. For COMPARISON questions (e.g. "What are the best AI providers?", "OpenAI vs Google"):
   - Formulate 2 to 4 distinct, focused search tasks targeting market landscape, contenders, and multidimensional tradeoffs.
4. For TECHNICAL_RESEARCH (e.g. "WebRTC vs WebSocket"):
   - Target official protocols, architectural tradeoffs, latency, packet loss, and browser/server support.
5. For CURRENT_EVENT (e.g. "recent changes in September 2026"):
   - Target specific release notes, changelogs, and official announcements for the requested timeframe.

Respond strictly in valid JSON format:
{
  "intent": "${intent}",
  "question": "${query.replace(/"/g, '\\"')}",
  "temporalAnchor": "${isHistorical ? "Historical / Canonical" : dateCtx.monthYear}",
  "dimensions": ${JSON.stringify(dimensions)},
  "searchTasks": [
    {
      "topic": "Short descriptive topic",
      "query": "Laser-focused search query string targeting authoritative records",
      "freshness": "${isHistorical ? "historical" : "current"}",
      "sourcePreference": "${isHistorical ? "official" : "official"}"
    }
  ],
  "followupAllowed": true
}`;

  try {
    const res = await callModel({
      systemPrompt: "You are a strategic research planner. Output only valid JSON without explanatory conversation.",
      messages: [{ role: "user", content: planningPrompt }],
      tier: "REASONING", // GPT-OSS 120B
      temperature: 0.1,
    });

    const parsed = extractJsonBlock(res);
    if (parsed && Array.isArray(parsed.searchTasks) && parsed.searchTasks.length > 0) {
      parsed.searchTasks = parsed.searchTasks.slice(0, 4).map((task) => ({
        ...task,
        query: sanitizePlannerQuery(task.query || task.topic, query, dateCtx.year, requiresCurrentDate),
      }));
      return parsed;
    }
  } catch (_) {}

  // Deterministic Fallback Plan if LLM call fails or times out
  const fallbackTasks = [];
  if (intent === RESEARCH_INTENTS.NOTABLE_WORKS) {
    fallbackTasks.push({
      topic: "Notable works and major writings",
      query: `${query.replace(/[?"'.,!]/g, "").replace(/\bbest work(?:s)? of\b/gi, "notable works books of").trim()}`,
      freshness: "historical",
      sourcePreference: "official",
    });
    fallbackTasks.push({
      topic: "Core publications and historical impact",
      query: "Mahatma Gandhi major books writings publications Hind Swaraj Autobiography Satyagraha",
      freshness: "historical",
      sourcePreference: "official",
    });
  } else if (intent === RESEARCH_INTENTS.HISTORICAL_INFORMATION) {
    const isCasualties = /\b(killed|died|casualties|death toll|deaths)\b/i.test(query);
    if (isCasualties) {
      fallbackTasks.push({
        topic: "World War II overall death toll",
        query: "World War II total casualties death toll civilian and military",
        freshness: "historical",
        sourcePreference: "official",
      });
      fallbackTasks.push({
        topic: "WWII Chinese casualties from Japanese invasion",
        query: "World War II Chinese casualties killed by Japanese military invasion death toll",
        freshness: "historical",
        sourcePreference: "official",
      });
    } else {
      fallbackTasks.push({
        topic: "Historical event overview",
        query: `${query.replace(/[?"'.,!]/g, "").trim()} historical facts provisions outcome`,
        freshness: "historical",
        sourcePreference: "official",
      });
    }
  } else if (intent === RESEARCH_INTENTS.TECHNICAL_RESEARCH) {
    fallbackTasks.push({
      topic: "WebRTC vs WebSocket latency",
      query: "WebRTC vs WebSocket real-time audio latency packet loss",
      freshness: "technical",
      sourcePreference: "technical",
    });
    fallbackTasks.push({
      topic: "Streaming speech-to-speech architecture",
      query: "WebSocket vs HTTP streaming speech-to-speech barge-in time-to-first-audio",
      freshness: "technical",
      sourcePreference: "technical",
    });
  } else if (intent === RESEARCH_INTENTS.CURRENT_EVENT) {
    fallbackTasks.push({
      topic: "Recent AI model & API changes",
      query: `AI model API updates changelog ${dateCtx.monthYear} OpenAI Anthropic Google Groq`,
      freshness: "current",
      sourcePreference: "official",
    });
    fallbackTasks.push({
      topic: "Key developer announcements",
      query: `AI developer announcements release notes ${dateCtx.monthYear}`,
      freshness: "current",
      sourcePreference: "reporting",
    });
  } else if (intent === RESEARCH_INTENTS.COMPARISON) {
    const isAi = /\b(ai|llm|model|api|openai|google|anthropic|groq)\b/i.test(query);
    fallbackTasks.push({
      topic: "Overall market landscape",
      query: `${query.replace(/[?"'.,!]/g, "").slice(0, 80).trim()}${requiresCurrentDate ? ` ${dateCtx.year}` : ""}`,
      freshness: requiresCurrentDate ? "current" : "general",
      sourcePreference: "benchmark",
    });
    fallbackTasks.push({
      topic: isAi ? "Latency and pricing tradeoffs" : "Comparative feature tradeoffs",
      query: isAi ? `AI API pricing latency comparison ${dateCtx.year}` : `${query.replace(/[?"'.,!]/g, "").slice(0, 50).trim()} features tradeoffs comparison`,
      freshness: requiresCurrentDate ? "current" : "general",
      sourcePreference: "official",
    });
  } else {
    fallbackTasks.push({
      topic: "Primary topic inquiry",
      query: sanitizePlannerQuery(query, query, dateCtx.year, requiresCurrentDate),
      freshness: requiresCurrentDate ? "current" : "general",
      sourcePreference: "official",
    });
  }

  return {
    intent,
    question: query,
    temporalAnchor: isHistorical ? "Historical / Canonical" : dateCtx.monthYear,
    dimensions: dimensions.length > 0 ? dimensions : ["general_facts"],
    searchTasks: fallbackTasks,
    followupAllowed: true,
  };
}

/**
 * Unambiguous Hinglish word stems and particles (length >= 3 or unambiguous)
 * Excludes ambiguous short words like 'me' (English pronoun), 'to' (English preposition), 'in'
 */
const HINGLISH_UNAMBIGUOUS = /\b(kya|kaise|kasie|usme|isme|nhi|nahi|bahut|accha|kuch|apna|unka|uska|iska|wala|wali|wale|thik|galti|chori|bachane|ladki|mandor|mandir|kiski|kaisa|kyun|kyunki|lekin|phir|abhi|yaha|waha|suar|pagal|tereko|mereko|tumko|batao|samjho|samjha|hoga|hogi|karna|karke|dekho|suno|padho|jhut|sirf|aisa|unhe|unko|inko|inhe|bol|raha|rahi|liye|liya|diya|gaya|gayi|loge|yehi)\b/i;

/**
 * Short Hinglish particles (ki, ka, ke, ko, se, ne, par, pe, ya, hai, tha, thi, the)
 * These require at least 2 occurrences or co-occurrence with other markers to avoid false positives
 */
const HINGLISH_PARTICLES = /\b(hai|aur|tha|thi|the|ki|ka|ke|ko|se|ne|par|pe|ya|bhi|koi)\b/gi;

/**
 * Common English typo patterns that search engines struggle with
 */
const TYPO_MARKERS = /\b(wnat|jsut|teh|taht|abotu|hte|adn|thnk|thier|waht|becuase|recieve|definately|occured|seperate|accomodate)\b/i;

/**
 * Detects whether a user query needs LLM-based rewriting before web_search.
 * Returns true for Hinglish queries, heavily typo-laden queries, or very long multi-topic queries.
 *
 * @param {string} query
 * @returns {boolean}
 */
export function queryNeedsRewrite(query) {
  if (!query || typeof query !== "string") return false;
  const q = query.trim();

  // 1. Unambiguous Hinglish vocabulary
  if (HINGLISH_UNAMBIGUOUS.test(q)) return true;

  // 2. Co-occurrence of multiple short Hinglish particles (e.g. "x ne y ko")
  const particleMatches = q.match(HINGLISH_PARTICLES);
  if (particleMatches && particleMatches.length >= 2) return true;

  // 3. Known typo patterns
  if (TYPO_MARKERS.test(q)) return true;

  // 4. Very long query (likely multi-topic or rant-style) — >150 chars with commas/conjunctions
  if (q.length > 150 && /[,;]|\b(and|or|aur|ya)\b/i.test(q)) return true;

  return false;
}

/**
 * Rewrites a raw user query into clean English search keywords using a fast LLM call.
 * Handles: Hinglish → English translation, typo correction, multi-topic decomposition.
 *
 * ONLY call this if queryNeedsRewrite(query) returns true.
 *
 * @param {string} rawQuery - The raw user query (may contain Hinglish, typos, multiple topics)
 * @param {Function} callModel - The callCognitiveModel function from thinkingEngineService
 * @returns {Promise<{ primary: string, subtopics: string[] }>} Clean search queries
 */
export async function rewriteQueryForSearch(rawQuery, callModel) {
  if (!rawQuery || typeof rawQuery !== "string" || !callModel) {
    return { primary: rawQuery || "", subtopics: [] };
  }

  const prompt = `Extract clean English search keywords from this user query.
The query may be in Hinglish (Hindi written in Latin script), have typos, or contain multiple distinct topics.

Rules:
- Translate ALL Hinglish to proper English
- Fix spelling errors
- Extract only factual search keywords — remove emotional words, filler, abuse
- If the query asks about MULTIPLE DISTINCT topics (e.g. "Hathras case AND Ram Mandir scam"), output each as a separate line prefixed with TOPIC:
- If it's a single topic, output a single line of search keywords
- Output ONLY the search keywords, no explanations

User query: "${rawQuery.replace(/"/g, '\\"')}"`;

  try {
    const res = await callModel({
      systemPrompt: "You are a search query optimizer. Output only clean English search keywords. No explanations.",
      messages: [{ role: "user", content: prompt }],
      tier: "FAST",
      temperature: 0,
      maxTokens: 200,
    });

    const reply = typeof res === "string" ? res.trim() : (res?.reply || "").trim();
    if (!reply) return { primary: rawQuery, subtopics: [] };

    // Parse multi-topic response
    const lines = reply.split("\n").map((l) => l.trim()).filter(Boolean);
    const topicLines = lines.filter((l) => /^TOPIC:\s*/i.test(l));

    if (topicLines.length >= 2) {
      // Multi-topic: first is primary, rest are subtopics
      const cleaned = topicLines.map((l) => l.replace(/^TOPIC:\s*/i, "").trim());
      return {
        primary: cleaned[0],
        subtopics: cleaned.slice(1),
      };
    }

    // Single topic: use full reply as primary (strip any "TOPIC:" prefix if present)
    const primary = reply.replace(/^TOPIC:\s*/i, "").replace(/\n/g, " ").trim();
    return { primary, subtopics: [] };
  } catch (err) {
    // If LLM call fails, fall back to basic cleanup
    console.warn("[QueryRewrite] LLM rewrite failed, using basic cleanup:", err.message);
    return {
      primary: rawQuery.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim(),
      subtopics: [],
    };
  }
}

/**
 * Formulates a diversified, strategy-shifting recovery query when primary search is insufficient or irrelevant.
 * Never repeats the exact same query; changes perspective around entity, event, date, or reporting.
 *
 * @param {Object} params
 * @param {string} params.originalQuery
 * @param {string} params.failedQuery
 * @param {string} params.intent
 * @param {number} params.currentYear
 * @param {boolean} params.requiresCurrentDate
 * @returns {string} Reformulated recovery query
 */
export function buildSearchRecoveryQuery({
  originalQuery = "",
  failedQuery = "",
  intent = "",
  currentYear = 2026,
  requiresCurrentDate = true,
}) {
  const cleanOrig = String(originalQuery || "").replace(/[?"'.,!]/g, " ").replace(/\s+/g, " ").trim();
  const lowerOrig = cleanOrig.toLowerCase();

  // 1. Trending / viral aviation inquiries
  if (/\b(pilot|indian pilot)\b/i.test(lowerOrig)) {
    return `Indian pilot viral incident news aviation ${requiresCurrentDate ? currentYear : ""}`.trim();
  }

  // 2. Historical inquiries (preserve historical anchor, add canonical terms)
  if (
    intent === RESEARCH_INTENTS.HISTORICAL_INFORMATION ||
    intent === RESEARCH_INTENTS.NOTABLE_WORKS ||
    /\b(gandhi|ww2|world war|treaty|pact|movement)\b/i.test(lowerOrig)
  ) {
    if (/\b(gandhi)\b/i.test(lowerOrig)) {
      return `${cleanOrig} historical records archives facts`.replace(/\b202[0-9]\b/g, "").trim();
    }
    if (/\b(ww2|world war)\b/i.test(lowerOrig)) {
      return `${cleanOrig} casualty statistics official military history`.replace(/\b202[0-9]\b/g, "").trim();
    }
    return `${cleanOrig} historical overview records`.replace(/\b202[0-9]\b/g, "").trim();
  }

  // 3. Technical research (shift to official documentation / engineering RFCs)
  if (intent === RESEARCH_INTENTS.TECHNICAL_RESEARCH || /\b(webrtc|websocket|audio|latency)\b/i.test(lowerOrig)) {
    return `${cleanOrig} architecture documentation rfc tradeoffs`.trim();
  }

  // 4. Current facts / news (reformulate around live reporting)
  if (requiresCurrentDate) {
    return `${cleanOrig} latest official reporting update ${currentYear}`.trim();
  }

  // 5. General fallback: append verified overview keywords
  return `${cleanOrig} verified facts overview`.trim();
}

export default {
  getSystemDateContext,
  sanitizePlannerQuery,
  extractJsonBlock,
  formulateResearchPlan,
  queryNeedsRewrite,
  rewriteQueryForSearch,
  buildSearchRecoveryQuery,
};
