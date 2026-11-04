/**
 * Research Modes and Execution Policy for Chatly AI
 * backend/services/research/researchModesPolicy.js
 *
 * Centralized governance for:
 *  1. Exactly TWO primary operating modes: FAST and SEARCH
 *  2. Global Effort setting: LOW, MEDIUM, HIGH, MAX
 *  3. Thinking as an INTERNAL execution capability that scales with Effort
 *  4. Unified execution budgets & hard safety kill-switches
 *
 * NOTE: Search count is an OUTPUT of the research process, NEVER a fixed stop condition.
 * Stop conditions: EVIDENCE_SUFFICIENT or an explicit resource kill-switch ceiling.
 */

export const MODES = Object.freeze({
  FAST: "FAST",
  SEARCH: "SEARCH",
});

export const EFFORT_LEVELS = Object.freeze({
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  MAX: "MAX",
});

export const REASONING_DEPTHS = Object.freeze({
  SHALLOW: "SHALLOW",
  STANDARD: "STANDARD",
  DEEP: "DEEP",
  MAX: "MAX",
});

export const STOP_REASONS = Object.freeze({
  EVIDENCE_SUFFICIENT: "EVIDENCE_SUFFICIENT",
  USER_INTERRUPTED: "USER_INTERRUPTED",
  TIME_BUDGET_REACHED: "TIME_BUDGET_REACHED",
  TOKEN_BUDGET_REACHED: "TOKEN_BUDGET_REACHED",
  COST_BUDGET_REACHED: "COST_BUDGET_REACHED",
  TOOL_CALL_LIMIT_REACHED: "TOOL_CALL_LIMIT_REACHED",
  PROVIDER_FAILURE: "PROVIDER_FAILURE",
  UNRESOLVED_INSUFFICIENT_EVIDENCE: "UNRESOLVED_INSUFFICIENT_EVIDENCE",
});

/**
 * Normalizes input mode string or legacy boolean to valid MODE (FAST or SEARCH)
 *
 * @param {string|boolean} mode
 * @returns {"FAST"|"SEARCH"}
 */
export function normalizeMode(mode) {
  if (typeof mode === "boolean") {
    return mode ? MODES.SEARCH : MODES.FAST;
  }
  if (!mode || typeof mode !== "string") {
    return MODES.FAST;
  }
  const upper = mode.trim().toUpperCase();
  if (upper === MODES.SEARCH) return MODES.SEARCH;
  // Legacy "THINKING" requests map to SEARCH with deep internal reasoning
  if (upper === "THINKING") return MODES.SEARCH;
  return MODES.FAST;
}

/**
 * Normalizes effort level string to valid EFFORT_LEVEL
 *
 * @param {string} effort
 * @returns {"LOW"|"MEDIUM"|"HIGH"|"MAX"}
 */
export function normalizeEffort(effort) {
  if (!effort || typeof effort !== "string") {
    return EFFORT_LEVELS.MEDIUM;
  }
  const upper = effort.trim().toUpperCase();
  if (upper === EFFORT_LEVELS.LOW) return EFFORT_LEVELS.LOW;
  if (upper === EFFORT_LEVELS.HIGH) return EFFORT_LEVELS.HIGH;
  if (upper === EFFORT_LEVELS.MAX) return EFFORT_LEVELS.MAX;
  return EFFORT_LEVELS.MEDIUM;
}

/**
 * Derives unified execution budget and hard kill-switch ceilings from Mode × Effort.
 * Thinking/reasoning depth is an INTERNAL capability governed by Effort.
 *
 * All search iteration limits here are EMERGENCY SAFETY CEILINGS, not goal counters.
 * Normal research terminates as soon as evidence is sufficient.
 *
 * @param {Object} params
 * @param {string} [params.mode="FAST"]
 * @param {string} [params.effort="MEDIUM"]
 * @returns {Object} Unified execution budget
 */
export function getExecutionBudget({
  mode = MODES.FAST,
  effort = EFFORT_LEVELS.MEDIUM,
  query = "",
} = {}) {
  const normMode = normalizeMode(mode);
  const normEffort = normalizeEffort(effort);

  // Dynamic token scaling based on explicit user length or complexity requests
  let dynamicMinTokens = 0;
  let dynamicMinWallClockMs = 0;
  if (typeof query === "string" && query.length > 0) {
    if (/\b(?:2000|2,?000)\s*(?:word|words)\b/i.test(query)) {
      dynamicMinTokens = 4500;
      dynamicMinWallClockMs = 60000;
    } else if (/\b(?:1000|1,?000|1500|1,?500)\s*(?:word|words)\b/i.test(query)) {
      dynamicMinTokens = 3000;
      dynamicMinWallClockMs = 45000;
    } else if (/\b(?:multi-?file|complete code|full implementation|exhaustive|treatise|architecture design)\b/i.test(query)) {
      dynamicMinTokens = 7500;
      dynamicMinWallClockMs = 60000;
    }
  }

  // =========================================================================
  // 1. FAST MODE (Lowest-Latency Conversational & Fast Engineering)
  // Direct answer / deterministic tools. Internal reasoning increases with Effort.
  // Avoids adaptive web-research loops.
  // =========================================================================
  if (normMode === MODES.FAST) {
    const fastBudgets = {
      [EFFORT_LEVELS.LOW]: {
        maxWallClockMs: 8000,
        maxTotalToolCalls: 1,
        maxIterationsCeiling: 1,
        maxPlannedQueriesPerIter: 0,
        maxConcurrentSearches: 1,
        maxUrlsToOpen: 0,
        maxTokens: 600,
        reasoningDepth: REASONING_DEPTHS.SHALLOW,
      },
      [EFFORT_LEVELS.MEDIUM]: {
        maxWallClockMs: 15000,
        maxTotalToolCalls: 2,
        maxIterationsCeiling: 1,
        maxPlannedQueriesPerIter: 1,
        maxConcurrentSearches: 1,
        maxUrlsToOpen: 0,
        maxTokens: 1500,
        reasoningDepth: REASONING_DEPTHS.STANDARD,
      },
      [EFFORT_LEVELS.HIGH]: {
        maxWallClockMs: 30000,
        maxTotalToolCalls: 2,
        maxIterationsCeiling: 1,
        maxPlannedQueriesPerIter: 1,
        maxUrlsToOpen: 1,
        maxTokens: 3500,
        reasoningDepth: REASONING_DEPTHS.DEEP,
      },
      [EFFORT_LEVELS.MAX]: {
        maxWallClockMs: 60000,
        maxTotalToolCalls: 3,
        maxIterationsCeiling: 1,
        maxPlannedQueriesPerIter: 1,
        maxUrlsToOpen: 1,
        maxTokens: 7500,
        reasoningDepth: REASONING_DEPTHS.MAX,
      },
    };

    const b = fastBudgets[normEffort];
    const finalTokens = Math.max(b.maxTokens, dynamicMinTokens);
    const finalWallClock = Math.max(b.maxWallClockMs, dynamicMinWallClockMs);

    return {
      mode: MODES.FAST,
      effort: normEffort,
      reasoningDepth: b.reasoningDepth,
      modelTier: (normEffort === EFFORT_LEVELS.MAX || finalTokens > 2000) ? "REASONING" : "FAST",
      responseBudgetTokens: finalTokens,
      maxWallClockMs: finalWallClock,
      maxTotalToolCalls: b.maxTotalToolCalls,
      maxIterationsCeiling: b.maxIterationsCeiling,
      maxPlannedQueriesPerIter: b.maxPlannedQueriesPerIter,
      maxConcurrentSearches: b.maxConcurrentSearches,
      maxUrlsToOpen: b.maxUrlsToOpen,
      maxPassagesPerSource: 2,
      maxTokens: finalTokens,
      plannerModelTier: "FAST",
      specialistModelTier: "FAST_REASONER",
      synthesizerModelTier: (normEffort === EFFORT_LEVELS.MAX || finalTokens > 2000) ? "REASONING" : "FAST",
      allowMultiQuerySearch: false,
      allowAdaptiveLoop: false,
      allowDeepReasoning: false,
      investigateContradictions: false,
      minVerifiedSourcesForSufficiency: 1,
    };
  }

  // =========================================================================
  // 2. SEARCH MODE (Research-Capable Mode)
  // Search + Evidence + Internal Reasoning.
  // Internal thinking becomes deeper as Effort increases:
  // - LOW: quick search & basic evidence convergence
  // - MEDIUM: multi-query research with gap analysis
  // - HIGH: deeper decomposition, broader searches, contradiction checks
  // - MAX: long-horizon adaptive research, highest resource budget
  // =========================================================================
  const searchBudgets = {
    [EFFORT_LEVELS.LOW]: {
      maxWallClockMs: 15000,
      maxTotalToolCalls: 8,
      maxIterationsCeiling: 2,
      maxPlannedQueriesPerIter: 2,
      maxConcurrentSearches: 2,
      maxUrlsToOpen: 2,
      maxPassagesPerSource: 3,
      maxTokens: 1200,
      reasoningDepth: REASONING_DEPTHS.SHALLOW,
      minVerifiedSourcesForSufficiency: 1,
      investigateContradictions: false,
      plannerModelTier: "FAST",
      synthesizerModelTier: "FAST",
    },
    [EFFORT_LEVELS.MEDIUM]: {
      maxWallClockMs: 32000,
      maxTotalToolCalls: 16,
      maxIterationsCeiling: 3,
      maxPlannedQueriesPerIter: 3,
      maxConcurrentSearches: 3,
      maxUrlsToOpen: 5,
      maxPassagesPerSource: 4,
      maxTokens: 2500,
      reasoningDepth: REASONING_DEPTHS.STANDARD,
      minVerifiedSourcesForSufficiency: 2,
      investigateContradictions: false,
      plannerModelTier: "FAST",
      synthesizerModelTier: "FAST",
    },
    [EFFORT_LEVELS.HIGH]: {
      maxWallClockMs: 50000,
      maxTotalToolCalls: 24,
      maxIterationsCeiling: 4,
      maxPlannedQueriesPerIter: 4,
      maxConcurrentSearches: 4,
      maxUrlsToOpen: 8,
      maxPassagesPerSource: 5,
      maxTokens: 4000,
      reasoningDepth: REASONING_DEPTHS.DEEP,
      minVerifiedSourcesForSufficiency: 3,
      investigateContradictions: true,
      plannerModelTier: "FAST",
      synthesizerModelTier: "FAST",
    },
    [EFFORT_LEVELS.MAX]: {
      maxWallClockMs: 90000,
      maxTotalToolCalls: 36,
      maxIterationsCeiling: 6,
      maxPlannedQueriesPerIter: 5,
      maxConcurrentSearches: 5,
      maxUrlsToOpen: 12,
      maxPassagesPerSource: 6,
      maxTokens: 7500,
      reasoningDepth: REASONING_DEPTHS.MAX,
      minVerifiedSourcesForSufficiency: 3,
      investigateContradictions: true,
      plannerModelTier: "FAST",
      synthesizerModelTier: "REASONING",
    },
  };

  const b = searchBudgets[normEffort];
  const finalTokens = Math.max(b.maxTokens, dynamicMinTokens);
  const finalWallClock = Math.max(b.maxWallClockMs, dynamicMinWallClockMs);
  return {
    mode: MODES.SEARCH,
    effort: normEffort,
    reasoningDepth: b.reasoningDepth,
    maxWallClockMs: b.maxWallClockMs,
    maxTotalToolCalls: b.maxTotalToolCalls,
    maxIterationsCeiling: b.maxIterationsCeiling,
    maxPlannedQueriesPerIter: b.maxPlannedQueriesPerIter,
    maxConcurrentSearches: b.maxConcurrentSearches,
    maxUrlsToOpen: b.maxUrlsToOpen,
    maxPassagesPerSource: b.maxPassagesPerSource,
    maxTokens: b.maxTokens,
    plannerModelTier: b.plannerModelTier, // Gemini Flash as primary research controller
    specialistModelTier: "FAST_REASONER", // Qwen 27B for fast specialist tasks
    synthesizerModelTier: b.synthesizerModelTier,
    allowMultiQuerySearch: true,
    allowAdaptiveLoop: true,
    allowDeepReasoning: normEffort === EFFORT_LEVELS.HIGH || normEffort === EFFORT_LEVELS.MAX,
    investigateContradictions: b.investigateContradictions,
    minVerifiedSourcesForSufficiency: b.minVerifiedSourcesForSufficiency,
  };
}

export default {
  MODES,
  EFFORT_LEVELS,
  REASONING_DEPTHS,
  STOP_REASONS,
  normalizeMode,
  normalizeEffort,
  getExecutionBudget,
};
