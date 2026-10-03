/**
 * Adaptive Research Orchestrator for Chatly AI
 * backend/services/research/researchOrchestrator.js
 *
 * Implements the full autonomous research pipeline:
 *  1. Research Intent Classification & Mode Selection (FAST, SEARCH, THINKING)
 *  2. Centralized Execution Budget & Hard Resource Kill-Switches
 *  3. Dynamic Date-Anchored Planning (Gemini Flash as primary controller)
 *  4. Parallel Focused Query Generation & Search Execution
 *  5. Merging & Deduplication Across Iterations
 *  6. Source Selection & Deep Passage Extraction (SSRF-protected)
 *  7. Deterministic Evidence Quality Gate & Semantic Gap Audit (Qwen 27B specialist)
 *  8. Adaptive Iterative Research Loop: Stops on EVIDENCE_SUFFICIENT (NEVER fixed search count)
 *  9. Search Iteration Query Combination: Original + Rewritten + Missing Subtopics
 * 10. Explicit Research State Model & Concise User-Facing Telemetry
 */

import { classifyResearchIntent, RESEARCH_INTENTS } from "./researchIntentClassifier.js";
import {
  formulateResearchPlan,
  getSystemDateContext,
  sanitizePlannerQuery,
  buildSearchRecoveryQuery,
} from "./researchQueryPlanner.js";
import {
  classifySourceTier,
  evaluateEvidenceDeterministic,
  normalizeEvidencePack,
  evaluateSemanticGap,
  SOURCE_TIERS,
} from "./researchEvidenceGate.js";
import {
  MODES,
  EFFORT_LEVELS,
  REASONING_DEPTHS,
  STOP_REASONS,
  getExecutionBudget,
} from "./researchModesPolicy.js";
import { toolExecutor } from "../../tools/toolExecutor.js";
import { safeOutboundRequest, isUrlSafe } from "../../tools/network/safeHttpClient.js";
import { extractCleanArticleText } from "../../tools/modules/web/extractWebpageTool.js";
import { normalizeSearchResult } from "../../tools/modules/web/webSearchTool.js";

export const RESEARCH_LIMITS = {
  MAX_PLANNED_QUERIES: 4,
  MAX_URLS_TO_OPEN: 3,
  MAX_FOLLOWUPS: 2,
  MAX_RESEARCH_TIME_MS: 20000,
};

/**
 * Extracts publication date from HTML or URL structure
 *
 * @param {string} html
 * @param {string} url
 * @returns {string|null}
 */
export function extractPublishDate(html = "", url = "") {
  if (url) {
    const urlDateMatch = url.match(/\b(202[0-9])[/-](0[1-9]|1[0-2])[/-](0[1-9]|[12][0-9]|3[01])\b/);
    if (urlDateMatch) {
      return `${urlDateMatch[1]}-${urlDateMatch[2]}-${urlDateMatch[3]}`;
    }
  }

  if (!html || typeof html !== "string") return null;

  const metaMatches = [
    /<meta\s+property=["']article:published_time["']\s+content=["']([^"']+)["']/i,
    /<meta\s+name=["']pubdate["']\s+content=["']([^"']+)["']/i,
    /<meta\s+name=["']date["']\s+content=["']([^"']+)["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
    /<meta\s+property=["']og:updated_time["']\s+content=["']([^"']+)["']/i,
  ];

  for (const regex of metaMatches) {
    const match = html.match(regex);
    if (match && match[1]) {
      const cleanDate = match[1].trim().split("T")[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
        return cleanDate;
      }
    }
  }

  return null;
}

/**
 * Extracts the most informative sentences/passages from article text matching inquiry dimensions
 *
 * @param {string} text
 * @param {string} query
 * @param {string[]} dimensions
 * @param {number} maxPassages
 * @returns {string[]}
 */
export function extractKeyPassages(text = "", query = "", dimensions = [], maxPassages = 2) {
  if (!text || typeof text !== "string") return [];

  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 450);

  if (sentences.length === 0) return [];

  const queryTerms = (query + " " + dimensions.join(" "))
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["what", "which", "where", "tell", "about", "show", "with", "from"].includes(w));

  const scored = sentences.map((sentence) => {
    let score = 0;
    const lower = sentence.toLowerCase();
    for (const term of queryTerms) {
      if (lower.includes(term)) score += 1;
    }
    // Boost sentences containing numbers, dates, version numbers or technical specs
    if (/\b(202[4-6]|\d+\s*(?:ms|gb|mb|tokens|billion|million|\$|%))\b/i.test(sentence)) {
      score += 1.5;
    }
    return { sentence, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored
    .filter((s) => s.score > 0)
    .slice(0, maxPassages)
    .map((s) => s.sentence);
}

/**
 * Builds structured comparison dataset across dimensions for comparison & technical inquiries ONLY
 *
 * @param {Object} params
 * @param {string} params.query
 * @param {string} params.intent
 * @param {Array<Object>} params.evidencePack
 * @param {Array<string>} params.dimensions
 * @param {Function} params.callModel
 * @param {string} params.currentDateFormatted
 * @returns {Promise<Object|null>}
 */
export async function buildComparisonMatrix({
  query,
  intent,
  evidencePack = [],
  dimensions = [],
  callModel,
  currentDateFormatted,
}) {
  // CRITICAL GUARD: Never build an AI provider comparison matrix for historical or notable works!
  if (
    intent === RESEARCH_INTENTS.NOTABLE_WORKS ||
    intent === RESEARCH_INTENTS.HISTORICAL_INFORMATION ||
    intent === RESEARCH_INTENTS.BIOGRAPHICAL_INFORMATION
  ) {
    return null;
  }

  const comparisonPrompt = `User Query: "${query}"
Classified Intent: ${intent}
Date Context: ${currentDateFormatted}
Dimensions: ${dimensions.join(", ")}

Normalized Research Evidence (${evidencePack.length} items):
${evidencePack.map((e, idx) => `[Evidence ${idx + 1} (${e.sourceRole} - ${e.source} | ${e.sourceTier})]: ${e.passage}`).join("\n\n")}

Instructions:
1. Construct an objective, structured comparison matrix mapping each relevant entity/protocol across the key inquiry dimensions.
2. DO NOT declare an arbitrary overall winner. Focus on architectural or operational TRADEOFFS.
3. If information on a dimension is not in evidence, mark it as "Not specified in current evidence".

Respond strictly in JSON format:
{
  "comparisonEntities": [
    {
      "name": "Entity or Protocol Name",
      "architectureOrModel": "Primary model/architecture identifier",
      "latency": "Latency / TTFT / TTFA profile",
      "capabilities": "Core capabilities & reasoning/audio depth",
      "strengths": "Top technical/operational strengths",
      "tradeoffs": "Key limitations or cost/complexity tradeoffs",
      "bestSuitedFor": "Recommended operational use case"
    }
  ],
  "decisionTradeoffs": "2-3 sentences synthesizing the core trade-offs without declaring a single winner."
}`;

  try {
    const compAi = await callModel({
      systemPrompt: "You are an elite objective technology benchmarking analyst. Return only valid JSON without declaring an overall winner.",
      messages: [{ role: "user", content: comparisonPrompt }],
      tier: "FAST_REASONER", // Qwen 27B
      temperature: 0.1,
    });

    const raw = typeof compAi === "object" && compAi?.reply ? compAi.reply : compAi;
    let parsed = null;
    if (typeof raw === "string") {
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const target = match ? match[1] : raw;
      try {
        parsed = JSON.parse(target.trim());
      } catch (_) {
        const braceMatch = target.match(/\{[\s\S]*\}/);
        if (braceMatch) parsed = JSON.parse(braceMatch[0]);
      }
    } else {
      parsed = raw;
    }

    if (parsed && Array.isArray(parsed.comparisonEntities) && parsed.comparisonEntities.length > 0) {
      return parsed;
    }
  } catch (_) {}

  return null;
}

/**
 * Execute Adaptive Research Workflow
 *
 * Implements evidence-driven loop:
 *  - Primary stop condition: EVIDENCE_SUFFICIENT
 *  - Hard resource kill-switches: Time budget, tool call limit, emergency iteration ceiling
 *  - Zero fixed search counts (never "search counter == 6")
 *
 * @param {Object} params
 * @param {string} params.query
 * @param {Function} params.callModel
 * @param {Function} [params.recordStep]
 * @param {Object} [params.options]
 * @returns {Promise<Object>}
 */
export async function executeAdaptiveResearch({
  query,
  callModel,
  recordStep = () => {},
  options = {},
}) {
  const t0 = performance.now();
  const dateCtx = getSystemDateContext();
  const toolTrace = [];
  const allCitations = [];
  const seenUrls = new Set();
  const openedPages = [];
  const observations = [];

  // 1. Resolve Mode & Execution Budget
  const budget = options.budget || getExecutionBudget({
    mode: options.mode || MODES.SEARCH,
    effort: options.effort || EFFORT_LEVELS.MEDIUM,
  });

  // 2. Initialize explicit Research State Model
  const researchState = {
    researchIteration: 0,
    plannedQueries: [],
    executedQueries: [],
    successfulQueries: 0,
    emptyQueries: 0,
    rejectedResults: 0,
    verifiedEvidenceCount: 0,
    openSourcesCount: 0,
    missingSubtopics: [],
    contradictions: [],
    currentEvidenceState: "INITIALIZING",
    stopReason: null,
    telemetry: {
      planned: 0,
      executed: 0,
      successful: 0,
      empty: 0,
      failed: 0,
    },
    resourceUsage: {
      totalWallClockMs: 0,
      totalToolCalls: 0,
      iterationsRun: 0,
      tokensUsedEstimate: 0,
    },
  };

  // 3. Research Intent Classification
  const intentInfo = classifyResearchIntent(query);

  recordStep({
    phase: "PLANNING",
    title: `Researching: ${intentInfo.intent.replace(/_/g, " ").toLowerCase()}`,
    thought: `Inquiry categorized as ${intentInfo.intent}. Mode: ${budget.mode} | Effort: ${budget.effort} | Reasoning: ${budget.reasoningDepth}.`,
    intent: intentInfo.intent,
    confidence: intentInfo.confidence,
    requiresDeepResearch: intentInfo.requiresDeepResearch,
    requiresCurrentDate: intentInfo.requiresCurrentDate,
    dimensions: intentInfo.dimensions,
    status: "completed",
  });

  // 4. Initial Query Planning via Gemini Flash (primary research controller)
  recordStep({
    phase: "PLANNING",
    title: "Planning research",
    thought: `Decomposing inquiry across dimensions: ${intentInfo.dimensions.slice(0, 3).join(", ")}.`,
    status: "in_progress",
  });

  const researchPlan = await formulateResearchPlan({
    query,
    intent: intentInfo.intent,
    dimensions: intentInfo.dimensions,
    callModel: (params) => callModel({ ...params, tier: budget.plannerModelTier }),
    requiresCurrentDate: intentInfo.requiresCurrentDate,
  });

  // Extract initial search tasks (governed by budget.maxPlannedQueriesPerIter)
  const initialTasks = Array.isArray(researchPlan.searchTasks) && researchPlan.searchTasks.length > 0
    ? researchPlan.searchTasks.slice(0, budget.maxPlannedQueriesPerIter)
    : [{ topic: "Primary search", query: sanitizePlannerQuery(query, query, dateCtx.year, intentInfo.requiresCurrentDate), freshness: intentInfo.requiresCurrentDate ? "current" : "historical" }];

  researchState.plannedQueries.push(...initialTasks.map((t) => t.query));
  researchState.telemetry.planned += initialTasks.length;

  recordStep({
    phase: "PLANNING",
    title: `${initialTasks.length} search tasks planned`,
    thought: `Targeting: ${initialTasks.map((t) => t.topic).join("; ")}.`,
    plan: initialTasks.map((t) => `${t.topic}: "${t.query}"`),
    status: "completed",
  });

  // 5. Adaptive Research Loop (Stop Condition: Evidence Sufficiency or Hard Ceilings)
  const executedQueriesSet = new Set();
  let currentRoundTasks = [...initialTasks];
  let evidencePack = [];
  let detGate = null;
  let gapAudit = null;

  while (!researchState.stopReason) {
    researchState.researchIteration += 1;
    const iteration = researchState.researchIteration;
    researchState.resourceUsage.iterationsRun = iteration;

    // Hard ceiling check: User cancellation
    if (options.signal?.aborted) {
      researchState.stopReason = STOP_REASONS.USER_INTERRUPTED;
      console.warn(`🛑 [Research Ceilings] User interrupted active research`);
      break;
    }

    // Hard ceiling check: Wall clock
    const elapsedNow = performance.now() - t0;
    researchState.resourceUsage.totalWallClockMs = Math.round(elapsedNow);
    if (elapsedNow >= budget.maxWallClockMs) {
      console.warn(`⚠️ [Research Ceilings] Hard time ceiling reached: ${elapsedNow.toFixed(0)}ms >= ${budget.maxWallClockMs}ms`);
      researchState.stopReason = STOP_REASONS.TIME_BUDGET_REACHED;
      break;
    }

    // Hard ceiling check: Total tool calls
    if (researchState.resourceUsage.totalToolCalls >= budget.maxTotalToolCalls) {
      console.warn(`⚠️ [Research Ceilings] Total tool call ceiling reached: ${researchState.resourceUsage.totalToolCalls} >= ${budget.maxTotalToolCalls}`);
      researchState.stopReason = STOP_REASONS.TOOL_CALL_LIMIT_REACHED;
      break;
    }

    // Hard ceiling check: Emergency iteration ceiling
    if (iteration > budget.maxIterationsCeiling) {
      console.warn(`⚠️ [Research Ceilings] Emergency iteration ceiling reached: ${iteration} > ${budget.maxIterationsCeiling}`);
      researchState.stopReason = STOP_REASONS.UNRESOLVED_INSUFFICIENT_EVIDENCE;
      break;
    }

    // Deduplicate currentRoundTasks against executedQueriesSet
    const tasksToExecute = currentRoundTasks.filter((t) => {
      if (!t || !t.query) return false;
      const key = t.query.toLowerCase().trim();
      return !executedQueriesSet.has(key);
    }).slice(0, budget.maxConcurrentSearches);

    if (tasksToExecute.length === 0) {
      // No novel queries left to execute
      researchState.stopReason = detGate?.passed ? STOP_REASONS.EVIDENCE_SUFFICIENT : STOP_REASONS.UNRESOLVED_INSUFFICIENT_EVIDENCE;
      break;
    }

    // Mark as executed
    tasksToExecute.forEach((t) => {
      executedQueriesSet.add(t.query.toLowerCase().trim());
      researchState.executedQueries.push(t.query);
    });

    const progressTitle = iteration === 1
      ? `Searching ${tasksToExecute.length} angles`
      : `Research round ${iteration}`;

    recordStep({
      phase: "PLANNING",
      title: progressTitle,
      thought: `Round ${iteration}: Executing ${tasksToExecute.length} parallel queries.`,
      status: "in_progress",
    });

    // Execute parallel searches
    const roundPromises = tasksToExecute.map(async (task) => {
      let currentTaskQuery = sanitizePlannerQuery(task.query, query, dateCtx.year, intentInfo.requiresCurrentDate);
      researchState.resourceUsage.totalToolCalls += 1;
      researchState.telemetry.executed += 1;

      recordStep({
        phase: "TOOL_EXECUTION",
        title: `Executing search: ${task.topic || currentTaskQuery.slice(0, 30)}`,
        tool: "web_search",
        args: { query: currentTaskQuery },
        status: "in_progress",
      });

      let rawExecRes = null;
      try {
        rawExecRes = await toolExecutor.executeTool(
          "web_search",
          { query: currentTaskQuery },
          { context: { thinkingMode: true } }
        );
      } catch (err) {
        rawExecRes = { ok: false, state: "SEARCH_ERROR", voiceSummary: err.message };
      }

      let execRes = normalizeSearchResult(rawExecRes, currentTaskQuery);

      // Empty result recovery search
      if (!execRes.ok || execRes.state === "SEARCH_EMPTY" || execRes.sources.length === 0) {
        researchState.emptyQueries += 1;
        const yearSuffix = intentInfo.requiresCurrentDate ? ` ${dateCtx.year}` : "";
        const fallbackTopic = task.topic || query;
        const rewrittenQuery = sanitizePlannerQuery(
          `${fallbackTopic.replace(/[?"'.,!]/g, "")}${yearSuffix} overview`,
          query,
          dateCtx.year,
          intentInfo.requiresCurrentDate
        );

        if (!executedQueriesSet.has(rewrittenQuery.toLowerCase().trim())) {
          executedQueriesSet.add(rewrittenQuery.toLowerCase().trim());
          try {
            researchState.resourceUsage.totalToolCalls += 1;
            const retryRes = await toolExecutor.executeTool(
              "web_search",
              { query: rewrittenQuery },
              { context: { thinkingMode: true } }
            );
            const normalizedRetry = normalizeSearchResult(retryRes, rewrittenQuery);
            if (normalizedRetry.ok && normalizedRetry.sources.length > 0) {
              execRes = normalizedRetry;
              currentTaskQuery = rewrittenQuery;
            }
          } catch (_) {}
        }
      }

      const success = execRes.ok !== false && execRes.state !== "SEARCH_EMPTY" && execRes.sources.length > 0;
      if (success) {
        researchState.successfulQueries += 1;
        researchState.telemetry.successful += 1;
      } else if (execRes.state === "SEARCH_EMPTY" || (execRes.sources && execRes.sources.length === 0)) {
        researchState.telemetry.empty += 1;
      } else {
        researchState.telemetry.failed += 1;
      }
      const summary = execRes.voiceSummary || (execRes.data ? JSON.stringify(execRes.data).slice(0, 400) : "Search completed");

      // Ingest citations
      if (Array.isArray(execRes.sources)) {
        execRes.sources.forEach((src) => {
          if (!src || !src.url) return;
          const key = src.url.toLowerCase().trim();
          const existing = allCitations.find((c) => c.url && c.url.toLowerCase().trim() === key);
          if (existing) {
            if (!existing.matchedQueries.includes(currentTaskQuery)) {
              existing.matchedQueries.push(currentTaskQuery);
            }
          } else {
            seenUrls.add(key);
            allCitations.push({
              title: src.title || "External Reference",
              publisher: src.publisher || "Web",
              url: src.url || null,
              snippet: src.snippet || "",
              sourceType: src.sourceType || classifySourceTier(src.url, src.publisher),
              publishedAt: src.publishedAt || null,
              retrievedAt: new Date().toISOString(),
              provider: src.provider || "web_search",
              matchedQueries: [currentTaskQuery],
            });
          }
        });
      }

      observations.push({
        tool: "web_search",
        task: task.topic || currentTaskQuery,
        query: currentTaskQuery,
        success,
        state: execRes.state,
        summary,
      });

      toolTrace.push({
        tool: "web_search",
        args: { query: currentTaskQuery },
        success,
        state: execRes.state,
      });

      recordStep({
        phase: "TOOL_OBSERVATION",
        title: success ? `Found ${execRes.sources.length} sources: ${task.topic || "Search"}` : `Search returned no usable evidence`,
        tool: "web_search",
        observation: summary.slice(0, 300),
        status: success ? "completed" : "failed",
      });
    });

    await Promise.all(roundPromises);

    recordStep({
      phase: "EVALUATION",
      title: "Reviewing sources",
      thought: `Aggregated ${allCitations.length} unique sources across ${observations.length} executed queries.`,
      status: "completed",
    });

    // Deep URL opening (SSRF-safe, prioritized by Tier)
    const validUrlCitations = allCitations.filter(
      (c) => c.url && (c.url.startsWith("http://") || c.url.startsWith("https://"))
    );
    const prioritizedCandidates = [...validUrlCitations].sort((a, b) => {
      const tierScore = (t) => {
        if (t === SOURCE_TIERS.TIER_1_PRIMARY) return 4;
        if (t === SOURCE_TIERS.TIER_2_ESTABLISHED) return 3;
        if (t === SOURCE_TIERS.TIER_3_SECONDARY) return 2;
        return 1;
      };
      return tierScore(b.sourceType) - tierScore(a.sourceType);
    });

    // Open URLs up to budget.maxUrlsToOpen
    const unopenedCandidates = prioritizedCandidates
      .filter((c) => !openedPages.some((p) => p.url === c.url))
      .slice(0, Math.max(0, budget.maxUrlsToOpen - openedPages.length));

    if (unopenedCandidates.length > 0) {
      researchState.telemetry.planned += unopenedCandidates.length;

      recordStep({
        phase: "TOOL_EXECUTION",
        title: `Opening ${unopenedCandidates.length} authoritative sources`,
        thought: `Extracting primary evidence from: ${unopenedCandidates.map((c) => c.publisher || c.title).slice(0, 2).join(", ")}.`,
        urls: unopenedCandidates.map((c) => c.url),
        status: "in_progress",
      });

      const openTasks = unopenedCandidates.map(async (candidate) => {
        researchState.telemetry.executed += 1;
        try {
          const isSafe = await isUrlSafe(candidate.url);
          if (!isSafe) {
            researchState.telemetry.failed += 1;
            return null;
          }
          researchState.resourceUsage.totalToolCalls += 1;
          const res = await safeOutboundRequest(candidate.url, { timeoutMs: 4500 });
          if (!res.ok) {
            researchState.telemetry.failed += 1;
            return null;
          }

          const html = await res.text();
          const articleText = extractCleanArticleText(html);
          const passages = extractKeyPassages(articleText, query, researchPlan.dimensions, budget.maxPassagesPerSource);
          const publishDate = extractPublishDate(html, candidate.url);

          if (passages.length > 0) {
            researchState.telemetry.successful += 1;
            const deepItem = {
              url: candidate.url,
              title: candidate.title,
              publisher: candidate.publisher,
              publishedAt: publishDate || candidate.publishedAt || null,
              retrievedAt: new Date().toISOString(),
              passage: passages.join(" "),
              sourceTier: classifySourceTier(candidate.url, candidate.publisher),
            };
            openedPages.push(deepItem);
            return deepItem;
          } else {
            researchState.telemetry.empty += 1;
            return null;
          }
        } catch (_) {
          researchState.telemetry.failed += 1;
          return null;
        }
      });

      await Promise.all(openTasks);
      researchState.openSourcesCount = openedPages.length;
    }

    // Normalize evidence pack
    evidencePack = normalizeEvidencePack({
      citations: allCitations,
      extractedPassages: openedPages,
      dimensions: researchPlan.dimensions,
    });
    researchState.verifiedEvidenceCount = evidencePack.length;

    // Deterministic Quality Gate
    recordStep({
      phase: "EVALUATION",
      title: "Checking evidence",
      thought: `Evaluating source credibility, subtopic coverage, and temporal freshness.`,
      status: "in_progress",
    });

    detGate = evaluateEvidenceDeterministic({
      query,
      observations,
      citations: allCitations,
      currentYear: dateCtx.year,
      intent: intentInfo.intent,
      requiresCurrentDate: intentInfo.requiresCurrentDate,
    });

    researchState.rejectedResults = detGate.rejectedResults?.length || 0;

    // Evaluate evidence sufficiency:
    let isEvidenceSufficient = false;

    const hasMinSources = allCitations.length >= budget.minVerifiedSourcesForSufficiency;
    const baseGatePassed = detGate.passed && detGate.freshnessOk && hasMinSources;

    if (budget.reasoningDepth === REASONING_DEPTHS.SHALLOW || !callModel) {
      // Lightweight search/evidence cycle (LOW effort)
      isEvidenceSufficient = baseGatePassed;
    } else {
      // In-depth internal reasoning (MEDIUM, HIGH, MAX effort)
      if (evidencePack.length > 0 && detGate.passed) {
        gapAudit = await evaluateSemanticGap({
          query,
          evidencePack,
          dimensions: researchPlan.dimensions,
          callModel,
          currentDateFormatted: dateCtx.formatted,
        });

        researchState.missingSubtopics = gapAudit.missingInformation || [];
        researchState.contradictions = gapAudit.conflicts || [];

        const noCriticalGaps = gapAudit.sufficient && (gapAudit.missingInformation || []).length === 0;

        // If contradiction investigation enabled and contradictions found, resolve or record
        const contradictionsHandled = !budget.investigateContradictions || (gapAudit.conflicts || []).length === 0 || iteration >= 2;

        isEvidenceSufficient = baseGatePassed && noCriticalGaps && contradictionsHandled;
      } else {
        isEvidenceSufficient = false;
      }
    }

    if (isEvidenceSufficient) {
      researchState.currentEvidenceState = "SUFFICIENT";
      researchState.stopReason = STOP_REASONS.EVIDENCE_SUFFICIENT;
      recordStep({
        phase: "EVALUATION",
        title: "Evidence sufficient",
        thought: `Validated ${allCitations.length} sources satisfying coverage and freshness. Completing research.`,
        status: "completed",
      });
      break;
    }

    // Evidence NOT sufficient:
    // Check if we are allowed adaptive follow-up or if ceilings prevent next round
    if (!budget.allowAdaptiveLoop || iteration >= budget.maxIterationsCeiling) {
      researchState.currentEvidenceState = "INSUFFICIENT";
      researchState.stopReason = detGate.passed ? STOP_REASONS.EVIDENCE_SUFFICIENT : STOP_REASONS.UNRESOLVED_INSUFFICIENT_EVIDENCE;
      break;
    }

    // Apply SEARCH ITERATION RULE (Section 6 of User Request):
    // "When a search iteration is insufficient:
    //  DO NOT throw away the original query.
    //  Search using a combination of:
    //  1. original user query
    //  2. rewritten queries
    //  3. missing-subtopic queries
    //  4. targeted source-type queries when useful"
    recordStep({
      phase: "EVALUATION",
      title: "Researching missing details",
      thought: `Initial evidence insufficient (${detGate.reason || "gaps remain"}). Formulating follow-up queries.`,
      status: "in_progress",
    });

    const nextTasks = [];

    // 1. Original query / recovery query variant
    const recoveryQuery = buildSearchRecoveryQuery({
      originalQuery: query,
      failedQuery: tasksToExecute[0]?.query || query,
      intent: intentInfo.intent,
      currentYear: dateCtx.year,
      requiresCurrentDate: intentInfo.requiresCurrentDate,
    });
    if (recoveryQuery && !executedQueriesSet.has(recoveryQuery.toLowerCase().trim())) {
      nextTasks.push({ topic: "Original Anchor Recovery", query: recoveryQuery });
    }

    // 2. Missing-subtopic queries from gapAudit or detGate
    const missingItems = [
      ...(gapAudit?.missingInformation || []),
      ...(detGate.missingInformation || []),
    ];
    for (const missing of missingItems) {
      if (!missing) continue;
      const missingQuery = sanitizePlannerQuery(
        `${query} ${missing}`,
        query,
        dateCtx.year,
        intentInfo.requiresCurrentDate
      );
      if (!executedQueriesSet.has(missingQuery.toLowerCase().trim())) {
        nextTasks.push({ topic: `Missing Subtopic: ${missing.slice(0, 25)}`, query: missingQuery });
      }
    }

    // 3. Rewritten / targeted queries
    if (gapAudit?.followUpTask?.query) {
      const followQuery = sanitizePlannerQuery(
        gapAudit.followUpTask.query,
        query,
        dateCtx.year,
        intentInfo.requiresCurrentDate
      );
      if (!executedQueriesSet.has(followQuery.toLowerCase().trim())) {
        nextTasks.push({ topic: gapAudit.followUpTask.topic || "Targeted Follow-up", query: followQuery });
      }
    }

    // If no new tasks could be formulated, exit loop
    if (nextTasks.length === 0) {
      researchState.stopReason = detGate.passed ? STOP_REASONS.EVIDENCE_SUFFICIENT : STOP_REASONS.UNRESOLVED_INSUFFICIENT_EVIDENCE;
      break;
    }

    researchState.telemetry.planned += nextTasks.length;
    currentRoundTasks = nextTasks;
    recordStep({
      phase: "PLANNING",
      title: `Cross-checking sources`,
      thought: `Formulated ${nextTasks.length} targeted follow-up queries for missing aspects.`,
      status: "completed",
    });
  }

  // 6. Structured Comparison Matrix (for COMPARISON & TECHNICAL_RESEARCH ONLY)
  let comparisonMatrix = null;
  const isComparisonOrTechnical =
    (intentInfo.intent === RESEARCH_INTENTS.COMPARISON ||
     intentInfo.intent === RESEARCH_INTENTS.TECHNICAL_RESEARCH) &&
    intentInfo.intent !== RESEARCH_INTENTS.NOTABLE_WORKS &&
    intentInfo.intent !== RESEARCH_INTENTS.HISTORICAL_INFORMATION &&
    intentInfo.intent !== RESEARCH_INTENTS.BIOGRAPHICAL_INFORMATION;

  if (isComparisonOrTechnical && evidencePack.length > 0) {
    recordStep({
      phase: "EVALUATION",
      title: "Synthesizing objective comparison matrix",
      thought: `Mapping trade-offs across candidate entities and dimensions (${researchPlan.dimensions.slice(0, 3).join(", ")}).`,
      status: "in_progress",
    });

    comparisonMatrix = await buildComparisonMatrix({
      query,
      intent: intentInfo.intent,
      evidencePack,
      dimensions: researchPlan.dimensions,
      callModel,
      currentDateFormatted: dateCtx.formatted,
    });

    if (comparisonMatrix) {
      recordStep({
        phase: "EVALUATION",
        title: "Comparison criteria mapped",
        thought: comparisonMatrix.decisionTradeoffs || "Comparative trade-offs established.",
        status: "completed",
      });
    }
  }

  const durationMs = Math.round(performance.now() - t0);
  researchState.resourceUsage.totalWallClockMs = durationMs;

  // 7. Research Provenance & Metadata
  const researchMeta = {
    intent: intentInfo.intent,
    mode: budget.mode,
    effort: budget.effort,
    reasoningDepth: budget.reasoningDepth,
    temporalAnchor: intentInfo.requiresCurrentDate ? dateCtx.monthYear : "Historical / Canonical",
    queriesUsed: researchState.executedQueries.length,
    sourcesUsed: allCitations.length,
    deepPagesRead: openedPages.length,
    iterations: researchState.researchIteration,
    stopReason: researchState.stopReason || (detGate?.passed ? STOP_REASONS.EVIDENCE_SUFFICIENT : STOP_REASONS.UNRESOLVED_INSUFFICIENT_EVIDENCE),
    freshnessChecked: detGate?.freshnessOk ?? false,
    deterministicPassed: detGate?.passed ?? false,
    semanticSufficient: gapAudit?.sufficient ?? (detGate?.passed ?? false),
    researchDurationMs: durationMs,
    telemetry: researchState.telemetry,
    resourceUsage: researchState.resourceUsage,
  };

  return {
    intent: intentInfo.intent,
    intentInfo,
    researchPlan,
    evidencePack,
    comparisonMatrix,
    citations: allCitations,
    observations,
    openedPages,
    toolTrace,
    gapAudit,
    deterministicGate: detGate,
    researchMeta,
    researchState,
    telemetry: researchState.telemetry,
    durationMs,
  };
}

export default {
  RESEARCH_LIMITS,
  extractPublishDate,
  extractKeyPassages,
  buildComparisonMatrix,
  executeAdaptiveResearch,
};
