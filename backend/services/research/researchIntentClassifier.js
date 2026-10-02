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
 * - HISTORICAL_INFORMATION: Historical events, wars, treaties, pacts, historical death tolls
 * - NOTABLE_WORKS: Major works, books, writings, philosophy, speeches of notable/historical figures
 * - BIOGRAPHICAL_INFORMATION: Life, biography, history of notable historical individuals
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
  HISTORICAL_INFORMATION: "HISTORICAL_INFORMATION",
  NOTABLE_WORKS: "NOTABLE_WORKS",
  BIOGRAPHICAL_INFORMATION: "BIOGRAPHICAL_INFORMATION",
};

/**
 * Fast deterministic classification (< 1ms)
 *
 * @param {string} query
 * @returns {{ intent: string, confidence: number, requiresDeepResearch: boolean, requiresCurrentDate: boolean, dimensions: string[] }}
 */
export function classifyResearchIntent(query = "") {
  const q = String(query || "").trim();
  const lower = q.toLowerCase();

  // Temporal Need Detection: Determine if query requires live current-year anchoring
  const hasExplicitCurrentTrigger =
    /\b(latest|current|today|this month|this year|recent|new|upcoming|now|best now|as of|right now)\b/i.test(lower) ||
    /\b(current ceo|current president|who is currently|who is the current|stock price|market cap|exchange rate|live score)\b/i.test(lower);
  const hasExplicitPastPeriod =
    /\b(in (?:18\d\d|19\d\d|20[01]\d|202[0-5])|century|ancient|medieval|ww1|ww2|world war|dynasty|empire|historic|pact|treaty|assassinated|born in|died in|killed in)\b/i.test(lower);
  const requiresCurrentDate = hasExplicitCurrentTrigger && !hasExplicitPastPeriod;

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
      requiresCurrentDate: false,
      dimensions: ["computation"],
    };
  }

  // 2. NOTABLE_WORKS: "best work of gandhi", "notable works of shakespeare", "major writings of tagore"
  // Must be checked BEFORE general comparison to prevent "best works of X" from triggering AI/product comparison schemas!
  const isNotableWorksPattern =
    /\b(?:best|major|notable|famous|greatest|important|key)\s+(?:works?|books?|writings?|essays?|speeches?|publications?|paintings?|contributions?)\s+(?:of|by)\s+/i.test(lower) ||
    /\b(?:works?|books?|writings?|essays?|speeches?)\s+(?:of|by)\s+[a-z]+/i.test(lower) ||
    /\b(gandhi|shakespeare|einstein|tagore|newton|plato|aristotle|confucius|churchill|mandela|tolstoy|dostoevsky)\b/i.test(lower) && /\b(work|works|book|books|writing|writings|ideas|philosophy)\b/i.test(lower);

  if (isNotableWorksPattern && !hasExplicitCurrentTrigger) {
    return {
      intent: RESEARCH_INTENTS.NOTABLE_WORKS,
      confidence: 0.96,
      requiresDeepResearch: true,
      requiresCurrentDate: false,
      dimensions: ["major_publications", "historical_context", "core_themes", "philosophical_impact"],
    };
  }

  // 3. HISTORICAL_INFORMATION: Wars, treaties, pacts, historical death tolls, historical pacts
  // e.g. "Gandhi-Irwin Pact", "how many people killed in ww2 and how many Japanese killed the Chinese in ww2"
  const isHistoricalEvent =
    /\b(pact|treaty|world war|ww1|ww2|battle of|revolution|independence movement|civil war|historic|history of|assassination of|dynasty|empire)\b/i.test(lower) ||
    (/\b(when did|what happened (?:in|during|at)|how many (?:died|killed|casualties)|who won the)\b/i.test(lower) && !hasExplicitCurrentTrigger);

  if (isHistoricalEvent) {
    const isCasualtiesQuery = /\b(killed|died|casualties|death toll|deaths)\b/i.test(lower);
    const isTreatyOrPact = /\b(pact|treaty|agreement|accord)\b/i.test(lower);

    let histDimensions = ["historical_events", "timeline", "key_figures", "historical_impact"];
    if (isCasualtiesQuery) {
      histDimensions = ["overall_casualties", "chinese_casualties", "historical_consensus", "primary_sources"];
    } else if (isTreatyOrPact) {
      histDimensions = ["historical_date", "key_provisions", "signatories", "historical_significance"];
    }

    return {
      intent: RESEARCH_INTENTS.HISTORICAL_INFORMATION,
      confidence: 0.95,
      requiresDeepResearch: true,
      requiresCurrentDate: false,
      dimensions: histDimensions,
    };
  }

  // 4. BIOGRAPHICAL_INFORMATION: "who was Mahatma Gandhi", "biography of Nikola Tesla"
  if (/\b(who was|biography of|life of|early life of|when was [a-z]+ born|when did [a-z]+ die)\b/i.test(lower) && !hasExplicitCurrentTrigger) {
    return {
      intent: RESEARCH_INTENTS.BIOGRAPHICAL_INFORMATION,
      confidence: 0.93,
      requiresDeepResearch: false,
      requiresCurrentDate: false,
      dimensions: ["biographical_summary", "key_achievements", "historical_era"],
    };
  }

  // 5. TECHNICAL_RESEARCH: protocols, networking, real-time architectures, codecs, audio pipelines
  const isTechnicalArchitecture = /\b(webrtc|websocket|http streaming|sse|server-sent events|grpc|rest api|codec|opus|pcm|g\.711|jitter|barge-in|aec|echo cancellation|packet loss|tcp|udp|quic|tls|latency optimization|time-to-first-audio|ttfa|full duplex)\b/i.test(lower);
  const isComparisonWords = /\b(vs|versus|compare|comparison|difference between|pros and cons|which is better|architectures|tradeoffs|trade-offs)\b/i.test(lower);

  if (isTechnicalArchitecture && (isComparisonWords || /\b(how does|architecture|production|implementation|protocol)\b/i.test(lower))) {
    return {
      intent: RESEARCH_INTENTS.TECHNICAL_RESEARCH,
      confidence: 0.95,
      requiresDeepResearch: true,
      requiresCurrentDate: false,
      dimensions: ["latency", "full_duplex", "packet_loss", "interruption_barge_in", "scaling", "browser_support", "complexity"],
    };
  }

  // 6. MULTI_SOURCE_ANALYSIS: studies, scientific papers, disputed facts, controversies
  if (
    /\b(studies|papers|disagreements|controversy|conflicting reports|meta-analysis|scientific consensus|differing opinions|allegations|fact check)\b/i.test(lower)
  ) {
    return {
      intent: RESEARCH_INTENTS.MULTI_SOURCE_ANALYSIS,
      confidence: 0.92,
      requiresDeepResearch: true,
      requiresCurrentDate,
      dimensions: ["methodology", "source_consensus", "contradictions", "empirical_evidence"],
    };
  }

  // 7. CURRENT_EVENT: monthly changes, recent updates, breaking developments, changelogs
  if (
    /\b(this month|last month|recent changes|what changed|new models announced|updates in|september 2026|october 2026|latest release|new features in|changelog)\b/i.test(lower) ||
    (hasExplicitCurrentTrigger && /\b(news|updates|release|announcement|change)\b/i.test(lower))
  ) {
    return {
      intent: RESEARCH_INTENTS.CURRENT_EVENT,
      confidence: 0.91,
      requiresDeepResearch: true,
      requiresCurrentDate: true,
      dimensions: ["announcement_date", "specific_changes", "developer_impact", "official_source"],
    };
  }

  // 8. COMPARISON: "best X", "X vs Y", "compare A, B, and C", "top providers", "which API should I use"
  if (
    isComparisonWords ||
    /\b(best|top \d+|leading|rank|ranking|alternatives to|which provider|which ai|which model|which api)\b/i.test(lower)
  ) {
    // Determine domain-specific dimensions so AI metrics never leak into non-AI queries!
    const isAiDomain = /\b(ai|llm|model|api|openai|google|anthropic|groq|meta|cohere|mistral|deepseek|claude|gemini|gpt|speech|tts|stt|vision)\b/i.test(lower);
    const comparisonDimensions = isAiDomain
      ? ["model_quality", "latency", "tool_calling", "multimodal", "context_window", "pricing", "reliability", "developer_ecosystem"]
      : ["core_features", "performance", "cost", "reliability", "pros_and_cons", "suitability"];

    return {
      intent: RESEARCH_INTENTS.COMPARISON,
      confidence: 0.94,
      requiresDeepResearch: true,
      requiresCurrentDate: hasExplicitCurrentTrigger || isAiDomain,
      dimensions: comparisonDimensions,
    };
  }

  // 9. CURRENT_FACT: single entity current status, leadership, stock price, single model status
  if (
    /\b(current ceo|who is the ceo|current price|stock price|market cap|founder of|net worth|headquarters)\b/i.test(lower) ||
    (/\b(who is the current|what is the latest)\b/i.test(lower) && !isComparisonWords)
  ) {
    return {
      intent: RESEARCH_INTENTS.CURRENT_FACT,
      confidence: 0.88,
      requiresDeepResearch: false,
      requiresCurrentDate: true,
      dimensions: ["current_entity_value"],
    };
  }

  // 10. DEEP_RESEARCH: explicit deep investigation keywords
  if (/\b(deep research|comprehensive investigation|detailed breakdown|thorough analysis|investigate)\b/i.test(lower)) {
    return {
      intent: RESEARCH_INTENTS.DEEP_RESEARCH,
      confidence: 0.95,
      requiresDeepResearch: true,
      requiresCurrentDate,
      dimensions: ["background", "technical_mechanisms", "industry_landscape", "future_outlook"],
    };
  }

  // 11. Default: SIMPLE_FACT (evergreen definitions, explanations, coding questions)
  return {
    intent: RESEARCH_INTENTS.SIMPLE_FACT,
    confidence: 0.80,
    requiresDeepResearch: false,
    requiresCurrentDate: false,
    dimensions: ["definitional_explanation"],
  };
}

export default {
  RESEARCH_INTENTS,
  classifyResearchIntent,
};
