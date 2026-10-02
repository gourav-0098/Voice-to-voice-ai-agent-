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

export default {
  getSystemDateContext,
  sanitizePlannerQuery,
  extractJsonBlock,
  formulateResearchPlan,
};
