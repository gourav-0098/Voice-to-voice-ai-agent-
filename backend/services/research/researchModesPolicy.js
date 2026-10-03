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
} = {}) {
  const normMode = normalizeMode(mode);
  const normEffort = normalizeEffort(effort);

  // =========================================================================
  // 1. FAST MODE (Lowest-Latency Conversational)
  // Direct answer / deterministic tools. Internal reasoning increases with Effort.
  // Avoids adaptive web-research loops.
  // =========================================================================
  if (normMode === MODES.FAST) {
    const fastBudgets = {
      [EFFORT_LEVELS.LOW]: {
        maxWallClockMs: 4000,
        maxTotalToolCalls: 1,
        maxIterationsCeiling: 1,
        maxPlannedQueriesPerIter: 0,
        maxConcurrentSearches: 1,
        maxUrlsToOpen: 0,
        maxTokens: 400,
        reasoningDepth: REASONING_DEPTHS.SHALLOW,
      },
      [EFFORT_LEVELS.MEDIUM]: {
        maxWallClockMs: 6000,
        maxTotalToolCalls: 2,
        maxIterationsCeiling: 1,
        maxPlannedQueriesPerIter: 1,
        maxConcurrentSearches: 1,
        maxUrlsToOpen: 0,
        maxTokens: 600,
        reasoningDepth: REASONING_DEPTHS.STANDARD,
      },
      [EFFORT_LEVELS.HIGH]: {
        maxWallClockMs: 8000,
        maxTotalToolCalls: 2,
        maxIterationsCeiling: 1,
        maxPlannedQueriesPerIter: 1,
        maxUrlsToOpen: 1,
        maxTokens: 900,
        reasoningDepth: REASONING_DEPTHS.DEEP,
      },
      [EFFORT_LEVELS.MAX]: {
        maxWallClockMs: 10000,
        maxTotalToolCalls: 3,
        maxIterationsCeiling: 1,
        maxPlannedQueriesPerIter: 1,
        maxUrlsToOpen: 1,
        maxTokens: 1400,
        reasoningDepth: REASONING_DEPTHS.MAX,
      },
    };

    const b = fastBudgets[normEffort];
    return {
      mode: MODES.FAST,
      effort: normEffort,
      reasoningDepth: b.reasoningDepth,
      modelTier: normEffort === EFFORT_LEVELS.MAX ? "REASONING" : "FAST",
      responseBudgetTokens: b.maxTokens,
      maxWallClockMs: b.maxWallClockMs,
      maxTotalToolCalls: b.maxTotalToolCalls,
      maxIterationsCeiling: b.maxIterationsCeiling,
      maxPlannedQueriesPerIter: b.maxPlannedQueriesPerIter,
      maxConcurrentSearches: b.maxConcurrentSearches,
      maxUrlsToOpen: b.maxUrlsToOpen,
      maxPassagesPerSource: 2,
      maxTokens: b.maxTokens,
      plannerModelTier: "FAST",
      specialistModelTier: "FAST_REASONER",
      synthesizerModelTier: normEffort === EFFORT_LEVELS.MAX ? "REASONING" : "FAST",
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
      maxWallClockMs: 10000,
      maxTotalToolCalls: 6,
      maxIterationsCeiling: 2,
      maxPlannedQueriesPerIter: 2,
      maxConcurrentSearches: 2,
      maxUrlsToOpen: 1,
      maxPassagesPerSource: 2,
      maxTokens: 900,
      reasoningDepth: REASONING_DEPTHS.SHALLOW,
      minVerifiedSourcesForSufficiency: 1,
      investigateContradictions: false,
      plannerModelTier: "FAST",
      synthesizerModelTier: "FAST",
    },
    [EFFORT_LEVELS.MEDIUM]: {
      maxWallClockMs: 18000,
      maxTotalToolCalls: 12,
      maxIterationsCeiling: 3,
      maxPlannedQueriesPerIter: 3,
      maxConcurrentSearches: 3,
      maxUrlsToOpen: 3,
      maxPassagesPerSource: 2,
      maxTokens: 1600,
      reasoningDepth: REASONING_DEPTHS.STANDARD,
      minVerifiedSourcesForSufficiency: 2,
      investigateContradictions: false,
      plannerModelTier: "FAST",
      synthesizerModelTier: "FAST",
    },
    [EFFORT_LEVELS.HIGH]: {
      maxWallClockMs: 30000,
      maxTotalToolCalls: 22,
      maxIterationsCeiling: 4,
      maxPlannedQueriesPerIter: 4,
      maxConcurrentSearches: 4,
      maxUrlsToOpen: 5,
      maxPassagesPerSource: 3,
      maxTokens: 2600,
      reasoningDepth: REASONING_DEPTHS.DEEP,
      minVerifiedSourcesForSufficiency: 3,
      investigateContradictions: true,
      plannerModelTier: "FAST",
      synthesizerModelTier: "FAST",
    },
    [EFFORT_LEVELS.MAX]: {
      maxWallClockMs: 50000,
      maxTotalToolCalls: 36,
      maxIterationsCeiling: 6,
      maxPlannedQueriesPerIter: 5,
      maxConcurrentSearches: 5,
      maxUrlsToOpen: 8,
      maxPassagesPerSource: 3,
      maxTokens: 4000,
      reasoningDepth: REASONING_DEPTHS.MAX,
      minVerifiedSourcesForSufficiency: 3,
      investigateContradictions: true,
      plannerModelTier: "FAST",
      synthesizerModelTier: "REASONING",
    },
  };

  const b = searchBudgets[normEffort];
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
