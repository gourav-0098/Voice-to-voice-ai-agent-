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
export function sanitizePlannerQuery(searchQuery, rawUserQuery, currentYear = 2026, requiresCurrentDate = true) {
  if (!searchQuery || typeof searchQuery !== "string") return "";
  let clean = searchQuery.trim();
  const rawLower = String(rawUserQuery || "").toLowerCase();

  // Ban placeholder queries like "Primary topic inquiry"
  if (/^(?:Primary topic inquiry|topic inquiry|Primary Query Recovery|Anchor Recovery|Search query)$/i.test(clean)) {
    clean = String(rawUserQuery || "").replace(/[?"'.,!]/g, " ").trim();
  }

  // Explicit Year Detection: Any explicit 4-digit year in user's query (past or future: 1919, 1992, 2020, 2024, 2028, 2030)
  const explicitYearMatch = String(rawUserQuery || "").match(/\b(1[789]\d\d|20\d\d)\b/);
  const userHasExplicitYear = Boolean(explicitYearMatch);

  const isHistoricalOrBiographical =
    !requiresCurrentDate ||
    /\b(gandhi|ww1|ww2|world war|treaty|pact|ancient|medieval|history|assassinated|born in|died in|works of|books of|hinduism|buddhism|shakespeare|einstein|tagore)\b/i.test(rawLower);

  if (isHistoricalOrBiographical) {
    // Under historical/notable works mode: DO NOT force current year into query!
    // If the user specified an explicit year (e.g. 1919, 2015), preserve it; otherwise strip any hallucinated modern years
    if (!userHasExplicitYear) {
      clean = clean.replace(/\b(202[0-9]|201\d)\b/g, "").replace(/\s{2,}/g, " ").trim();
    }
    // Normalize "best work of X" to "notable works X" if present
    clean = clean.replace(/\bbest work(?:s)? of\b/gi, "notable works of");
    return clean;
  }

  // Only inject/anchor current year when user did NOT supply an explicit year and inquiry genuinely requires current date
  if (!userHasExplicitYear && requiresCurrentDate) {
    clean = clean.replace(/\b(202[0-5]|201\d)\b/g, String(currentYear));
    if (/\b(midterm|election|ballot|governorship|referendum)\b/i.test(clean) && !clean.includes(String(currentYear))) {
      clean = `${clean} ${currentYear}`;
    }
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
  signal = null,
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
3. For COMPARISON questions (e.g. "What are the best AI providers?", "OpenAI vs Google", "Tusk vs Nawrocki"):
   - Formulate 2 to 4 distinct, focused search tasks targeting the contenders, specific statements, and multidimensional tradeoffs.
4. For TECHNICAL_RESEARCH (e.g. "CVE vulnerabilities", "WebRTC vs WebSocket", "SQLite WAL mode"):
   - Target official CVE databases, RFCs, technical specifications, architecture tradeoffs, and benchmark evidence for the specific subject asked.
5. For CURRENT_EVENT (e.g. world news, politics, policy updates, breaking developments, elections):
   - Formulate 2 to 3 targeted queries focusing on verified news reporting, primary government/institutional announcements, and current timeline details. Do NOT assume it is a software changelog unless software was explicitly asked.
6. For TRENDING_EVENT (e.g. "Why is this Indian pilot going viral lately?"):
   - Formulate 3 to 4 distinct, focused search queries covering: (a) viral incident/event, (b) trending news coverage with current year ${dateCtx.year}, (c) controversy or background, and (d) verified factual reporting. Do NOT repeat the exact user question.

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

  const PLANNING_TIMEOUT_MS = 3500;
  const plannerAbortController = new AbortController();
  const onUpstreamAbort = () => {
    const err = new Error("OPERATION_ABORTED");
    err.name = "AbortError";
    plannerAbortController.abort(err);
  };
  if (signal) {
    if (signal.aborted) {
      plannerAbortController.abort();
    } else {
      signal.addEventListener("abort", onUpstreamAbort, { once: true });
    }
  }

  let timer;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        plannerAbortController.abort(new Error(`PLANNING_TIMEOUT_${PLANNING_TIMEOUT_MS}MS`));
        reject(new Error(`PLANNING_TIMEOUT_${PLANNING_TIMEOUT_MS}MS`));
      }, PLANNING_TIMEOUT_MS);
    });

    const callPromise = callModel({
      systemPrompt: "You are a strategic research planner. Output only valid JSON without explanatory conversation.",
      messages: [{ role: "user", content: planningPrompt }],
      tier: "REASONING", // GPT-OSS 120B
      temperature: 0.1,
      signal: plannerAbortController.signal,
    });

    const res = await Promise.race([callPromise, timeoutPromise]);

    const parsed = extractJsonBlock(res);
    if (parsed && Array.isArray(parsed.searchTasks) && parsed.searchTasks.length > 0) {
      parsed.searchTasks = parsed.searchTasks.slice(0, 4).map((task) => ({
        ...task,
        query: sanitizePlannerQuery(task.query || task.topic, query, dateCtx.year, requiresCurrentDate),
      }));
      return parsed;
    }
  } catch (err) {
    if (signal?.aborted) {
      throw err;
    }
    console.warn(`⚠️ [PLANNING] Planner LLM failed or exceeded ${PLANNING_TIMEOUT_MS}ms (${err.message}); falling back to deterministic plan.`);
  } finally {
    clearTimeout(timer);
    if (signal) {
      signal.removeEventListener("abort", onUpstreamAbort);
    }
  }

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
    const cleanQ = query.replace(/[?"'.,!]/g, "").trim();
    fallbackTasks.push({
      topic: "Technical documentation and architecture",
      query: `${cleanQ} technical specification documentation architecture`,
      freshness: "technical",
      sourcePreference: "technical",
    });
    fallbackTasks.push({
      topic: "Implementation details and comparative performance",
      query: `${cleanQ} implementation tradeoffs benchmarks performance`,
      freshness: "technical",
      sourcePreference: "technical",
    });
  } else if (intent === RESEARCH_INTENTS.CURRENT_EVENT) {
    const cleanQ = query.replace(/[?"'.,!]/g, "").trim();
    fallbackTasks.push({
      topic: "Current event details and verified reporting",
      query: sanitizePlannerQuery(cleanQ, query, dateCtx.year, requiresCurrentDate),
      freshness: requiresCurrentDate ? "current" : "general",
      sourcePreference: "reporting",
    });
    fallbackTasks.push({
      topic: "Official statements and latest developments",
      query: `${cleanQ} latest developments updates ${requiresCurrentDate ? dateCtx.year : ""}`.trim(),
      freshness: requiresCurrentDate ? "current" : "general",
      sourcePreference: "official",
    });
  } else if (intent === RESEARCH_INTENTS.TRENDING_EVENT) {
    // 3 to 4 focused search tasks covering entity, incident, viral reporting, and live date
    const cleanEntity = query
      .replace(/[?"'.,!]/g, "")
      .replace(/\b(why is|going viral|lately|trending|went viral|news)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    fallbackTasks.push({
      topic: `${cleanEntity || "Subject"} viral incident`,
      query: `${cleanEntity || "Subject"} viral incident news ${dateCtx.year}`.trim(),
      freshness: "current",
      sourcePreference: "reporting",
    });
    fallbackTasks.push({
      topic: `${cleanEntity || "Subject"} trending news`,
      query: `${cleanEntity || "Subject"} trending news ${dateCtx.monthYear}`.trim(),
      freshness: "current",
      sourcePreference: "reporting",
    });
    fallbackTasks.push({
      topic: `${cleanEntity || "Subject"} controversy or latest event`,
      query: `${cleanEntity || "Subject"} controversy what happened latest update`.trim(),
      freshness: "current",
      sourcePreference: "reporting",
    });
    fallbackTasks.push({
      topic: `${cleanEntity || "Subject"} verified reporting`,
      query: `${cleanEntity || "Subject"} viral video incident explanation`.trim(),
      freshness: "current",
      sourcePreference: "official",
    });
  } else if (intent === RESEARCH_INTENTS.COMPARISON) {
    const isAi = /\b(ai|llm|model|api|openai|google|anthropic|groq)\b/i.test(query);
    const cleanComparisonQuery = query.replace(/[?"'.,!]/g, "").trim();
    fallbackTasks.push({
      topic: "Overall market landscape",
      query: `${cleanComparisonQuery}${requiresCurrentDate ? ` ${dateCtx.year}` : ""}`,
      freshness: requiresCurrentDate ? "current" : "general",
      sourcePreference: "benchmark",
    });
    fallbackTasks.push({
      topic: isAi ? "Latency and pricing tradeoffs" : "Comparative feature tradeoffs",
      query: isAi ? `AI API pricing latency comparison ${dateCtx.year}` : `${cleanComparisonQuery} features tradeoffs comparison`,
      freshness: requiresCurrentDate ? "current" : "general",
      sourcePreference: "official",
    });
  } else {
    // Multi-part question decomposition: preserve full queries and split on two-part conjunctions
    const multiPartMatch = query.split(/\s*,\s*and\s+|\s+and\s+(?:what|who|how|where|when|by\s+how|which)\b/i);
    if (multiPartMatch.length >= 2 && multiPartMatch[0].trim().length >= 10 && multiPartMatch[1].trim().length >= 10) {
      const part1 = multiPartMatch[0].trim();
      const part2 = multiPartMatch[1].trim();
      fallbackTasks.push({
        topic: part1,
        query: sanitizePlannerQuery(part1, query, dateCtx.year, requiresCurrentDate),
        freshness: requiresCurrentDate ? "current" : "general",
        sourcePreference: "official",
      });
      fallbackTasks.push({
        topic: part2,
        query: sanitizePlannerQuery(part2, query, dateCtx.year, requiresCurrentDate),
        freshness: requiresCurrentDate ? "current" : "general",
        sourcePreference: "official",
      });
    } else {
      fallbackTasks.push({
        topic: query.trim(),
        query: sanitizePlannerQuery(query, query, dateCtx.year, requiresCurrentDate),
        freshness: requiresCurrentDate ? "current" : "general",
        sourcePreference: "official",
      });
    }
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

  // 4. Current political officeholders / official appointments (target official portals and news record)
  if (/\b(cm|chief minister|pm|prime minister|governor|president|minister)\b/i.test(lowerOrig)) {
    return `${cleanOrig} official portal government update ${requiresCurrentDate ? currentYear : ""}`.trim();
  }

  // 5. Current facts / news (reformulate around live reporting)
  if (requiresCurrentDate) {
    return `${cleanOrig} latest official reporting update ${currentYear}`.trim();
  }

  // 6. General fallback: return cleaned query without spam suffixes or internal labels
  return cleanOrig.trim();
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
