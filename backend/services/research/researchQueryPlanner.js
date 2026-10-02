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
 * Sanitizes planner-generated search queries to prevent accidental stale-year queries
 * unless the user explicitly requested a historical year.
 */
export function sanitizePlannerQuery(searchQuery, rawUserQuery, currentYear) {
  if (!searchQuery || typeof searchQuery !== "string") return "";
  const clean = searchQuery.trim();
  const userHasExplicitPastYear = /\b(19\d\d|20[01]\d|202[0-5])\b/.test(rawUserQuery);
  if (!userHasExplicitPastYear) {
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
 * @returns {Promise<Object>}
 */
export async function formulateResearchPlan({ query, intent, dimensions = [], callModel }) {
  const dateCtx = getSystemDateContext();
  const userHasExplicitPastYear = /\b(19\d\d|20[01]\d|202[0-5])\b/.test(query);

  const planningPrompt = `You are an elite research planner and query strategist for Chatly AI.
Current Real-World Date: ${dateCtx.formatted} (Current Year: ${dateCtx.year}).

User Question: "${query}"
Classified Intent: ${intent}
Candidate Dimensions: ${dimensions.join(", ")}

CRITICAL PLANNING RULES:
1. Temporal Anchor: The real-world year is ${dateCtx.year}. Queries for "current", "latest", "recent", "today", "best now", or questions with no explicit past year MUST target ${dateCtx.year}.
2. Do NOT use past years like 2023, 2024, or 2025 unless the user explicitly asks for that historical period.
3. For COMPARISON questions (e.g. "What are the best AI providers?", "OpenAI vs Google"):
   - Formulate 2 to 4 distinct, focused search tasks targeting:
     a) Overall leaderboards and current market landscape
     b) Specific leading candidates/providers relevant to the user query
     c) Key capability tradeoffs (latency, reasoning depth, pricing, context window)
   - Do NOT hardcode fixed providers into your plan; dynamically select the most relevant contenders based on the user's inquiry.
4. For TECHNICAL_RESEARCH (e.g. "WebRTC vs WebSocket"):
   - Target official protocols, architectural tradeoffs, latency, packet loss, and browser/server support.
5. For CURRENT_EVENT (e.g. "recent changes in September 2026"):
   - Target specific release notes, changelogs, and official announcements for the requested timeframe.

Respond strictly in valid JSON format:
{
  "intent": "${intent}",
  "question": "${query.replace(/"/g, '\\"')}",
  "temporalAnchor": "${dateCtx.monthYear}",
  "dimensions": ["dimension1", "dimension2"],
  "searchTasks": [
    {
      "topic": "Short descriptive topic",
      "query": "Laser-focused search query string targeting authoritative records",
      "freshness": "current",
      "sourcePreference": "official" | "technical" | "benchmark" | "reporting"
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
      // Sanitize all generated query strings to eliminate latent stale years
      parsed.searchTasks = parsed.searchTasks.slice(0, 4).map((task) => ({
        ...task,
        query: sanitizePlannerQuery(task.query || task.topic, query, dateCtx.year),
      }));
      return parsed;
    }
  } catch (_) {}

  // Deterministic Fallback Plan if LLM call fails or times out
  const fallbackTasks = [];
  if (intent === RESEARCH_INTENTS.TECHNICAL_RESEARCH) {
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
    fallbackTasks.push({
      topic: "Overall market landscape",
      query: `${query.replace(/[?"'.,!]/g, "").slice(0, 80).trim()} ${dateCtx.year}`,
      freshness: "current",
      sourcePreference: "benchmark",
    });
    fallbackTasks.push({
      topic: "Latency and pricing tradeoffs",
      query: `AI API pricing latency comparison ${dateCtx.year}`,
      freshness: "current",
      sourcePreference: "official",
    });
  } else {
    fallbackTasks.push({
      topic: "Primary topic inquiry",
      query: sanitizePlannerQuery(query, query, dateCtx.year),
      freshness: "current",
      sourcePreference: "official",
    });
  }

  return {
    intent,
    question: query,
    temporalAnchor: dateCtx.monthYear,
    dimensions: dimensions.length > 0 ? dimensions : ["general_facts"],
    searchTasks: fallbackTasks,
    followupAllowed: true,
  };
}

export default {
  getSystemDateContext,
  sanitizePlannerQuery,
  formulateResearchPlan,
};
