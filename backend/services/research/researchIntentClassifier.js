/**
 * Research Intent Classifier
 * backend/services/research/researchIntentClassifier.js
 *
 * Classifies inquiries into distinct research tiers:
 * - SIMPLE_FACT: Static, evergreen, definitional facts (e.g. "What is TCP?", "Capital of France")
 * - CALCULATION: Math, percentage, currency, unit conversion
 * - CURRENT_FACT: Single current entity facts (e.g. "Current CEO of Nvidia", "NVIDIA stock price")
 * - CURRENT_EVENT: Recent news, announcements, updates (e.g. "What changed in AI APIs this month?")
 * - COMPARISON: Multi-entity evaluation (e.g. "OpenAI vs Google for voice AI", "What are the best AI providers?")
 * - TECHNICAL_RESEARCH: Protocols, architectures, engineering tradeoffs (e.g. "WebRTC vs WebSocket for voice AI")
 * - DEEP_RESEARCH: Multi-dimensional investigation or comprehensive review
 * - MULTI_SOURCE_ANALYSIS: Contested claims, scientific study comparisons, conflicting reports
 */

export const RESEARCH_INTENTS = {
  SIMPLE_FACT: "SIMPLE_FACT",
  CALCULATION: "CALCULATION",
  CURRENT_FACT: "CURRENT_FACT",
  CURRENT_EVENT: "CURRENT_EVENT",
  COMPARISON: "COMPARISON",
  TECHNICAL_RESEARCH: "TECHNICAL_RESEARCH",
  DEEP_RESEARCH: "DEEP_RESEARCH",
  MULTI_SOURCE_ANALYSIS: "MULTI_SOURCE_ANALYSIS",
};

/**
 * Fast deterministic classification (< 1ms)
 *
 * @param {string} query
 * @returns {{ intent: string, confidence: number, requiresDeepResearch: boolean, dimensions: string[] }}
 */
export function classifyResearchIntent(query = "") {
  const q = String(query || "").trim();
  const lower = q.toLowerCase();

  // 1. CALCULATION
  if (
    /^(?:what is |calculate |evaluate |compute )?[\d.\s+\-*/()^%x]+$/i.test(q) ||
    /\b\d+\s*%\s*of\s*\d+\b/i.test(lower) ||
    /\b(convert|exchange rate|to usd|to inr|in celsius|in fahrenheit)\b/i.test(lower)
  ) {
    return {
      intent: RESEARCH_INTENTS.CALCULATION,
      confidence: 0.98,
      requiresDeepResearch: false,
      dimensions: ["computation"],
    };
  }

  // 2. TECHNICAL_RESEARCH: protocols, networking, real-time architectures, codecs, audio pipelines
  const isTechnicalArchitecture = /\b(webrtc|websocket|http streaming|sse|server-sent events|grpc|rest api|codec|opus|pcm|g\.711|jitter|barge-in|aec|echo cancellation|packet loss|tcp|udp|quic|tls|latency optimization|time-to-first-audio|ttfa|full duplex)\b/i.test(lower);
  const isComparisonWords = /\b(vs|versus|compare|comparison|difference between|pros and cons|which is better|architectures|tradeoffs|trade-offs)\b/i.test(lower);

  if (isTechnicalArchitecture && (isComparisonWords || /\b(how does|architecture|production|implementation|protocol)\b/i.test(lower))) {
    return {
      intent: RESEARCH_INTENTS.TECHNICAL_RESEARCH,
      confidence: 0.95,
      requiresDeepResearch: true,
      dimensions: ["latency", "full_duplex", "packet_loss", "interruption_barge_in", "scaling", "browser_support", "complexity"],
    };
  }

  // 3. MULTI_SOURCE_ANALYSIS: studies, scientific papers, disputed facts, controversies
  if (
    /\b(studies|papers|disagreements|controversy|conflicting reports|meta-analysis|scientific consensus|differing opinions|allegations|fact check)\b/i.test(lower)
  ) {
    return {
      intent: RESEARCH_INTENTS.MULTI_SOURCE_ANALYSIS,
      confidence: 0.92,
      requiresDeepResearch: true,
      dimensions: ["methodology", "source_consensus", "contradictions", "empirical_evidence"],
    };
  }

  // 4. COMPARISON: "best X", "X vs Y", "compare A, B, and C", "top providers", "which API should I use"
  if (
    isComparisonWords ||
    /\b(best|top \d+|leading|rank|ranking|alternatives to|which provider|which ai|which model|which api)\b/i.test(lower)
  ) {
    return {
      intent: RESEARCH_INTENTS.COMPARISON,
      confidence: 0.94,
      requiresDeepResearch: true,
      dimensions: ["model_quality", "latency", "tool_calling", "multimodal", "context_window", "pricing", "reliability", "developer_ecosystem"],
    };
  }

  // 5. CURRENT_EVENT: monthly changes, recent updates, breaking developments, changelogs
  if (
    /\b(this month|last month|recent changes|what changed|new models announced|updates in|september 2026|october 2026|latest release|new features in|changelog)\b/i.test(lower)
  ) {
    return {
      intent: RESEARCH_INTENTS.CURRENT_EVENT,
      confidence: 0.91,
      requiresDeepResearch: true,
      dimensions: ["announcement_date", "specific_changes", "developer_impact", "official_source"],
    };
  }

  // 6. CURRENT_FACT: single entity current status, leadership, stock price, single model status
  if (
    /\b(current ceo|who is the ceo|current price|stock price|market cap|founder of|net worth|headquarters|when did)\b/i.test(lower) ||
    (/\b(who is|what is the latest)\b/i.test(lower) && !isComparisonWords)
  ) {
    return {
      intent: RESEARCH_INTENTS.CURRENT_FACT,
      confidence: 0.88,
      requiresDeepResearch: false, // Fast 1-step retrieval is sufficient!
      dimensions: ["current_entity_value"],
    };
  }

  // 7. DEEP_RESEARCH: explicit deep investigation keywords
  if (/\b(deep research|comprehensive investigation|detailed breakdown|thorough analysis|investigate)\b/i.test(lower)) {
    return {
      intent: RESEARCH_INTENTS.DEEP_RESEARCH,
      confidence: 0.95,
      requiresDeepResearch: true,
      dimensions: ["background", "technical_mechanisms", "industry_landscape", "future_outlook"],
    };
  }

  // 8. Default: SIMPLE_FACT (evergreen definitions, explanations, coding questions)
  return {
    intent: RESEARCH_INTENTS.SIMPLE_FACT,
    confidence: 0.80,
    requiresDeepResearch: false,
    dimensions: ["definitional_explanation"],
  };
}

export default {
  RESEARCH_INTENTS,
  classifyResearchIntent,
};
