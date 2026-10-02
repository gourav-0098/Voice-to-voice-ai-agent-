/**
 * Adaptive Research Orchestrator for Chatly AI
 * backend/services/research/researchOrchestrator.js
 *
 * Implements the full autonomous research pipeline:
 *  1. Research Intent Classification
 *  2. Dynamic Date-Anchored Planning (GPT-OSS 120B)
 *  3. Parallel Focused Query Generation & Search
 *  4. Search Quality Gate & Empty-Result Rewrite Recovery
 *  5. Source Selection & Deep Passage Extraction (SSRF-protected)
 *  6. Evidence Normalization into Structured Evidence Pack
 *  7. Deterministic Evidence Quality Gate
 *  8. Semantic Gap & Conflict Audit (Qwen 27B)
 *  9. Targeted Follow-Up Search (budget-constrained)
 * 10. Structured Comparison Matrix (for COMPARISON & TECHNICAL_RESEARCH)
 * 11. Research Provenance & Metadata Compilation
 */

import { classifyResearchIntent, RESEARCH_INTENTS } from "./researchIntentClassifier.js";
import { formulateResearchPlan, getSystemDateContext, sanitizePlannerQuery } from "./researchQueryPlanner.js";
import {
  classifySourceTier,
  evaluateEvidenceDeterministic,
  normalizeEvidencePack,
  evaluateSemanticGap,
  SOURCE_TIERS,
} from "./researchEvidenceGate.js";
import { toolExecutor } from "../../tools/toolExecutor.js";
import { safeOutboundRequest, isUrlSafe } from "../../tools/network/safeHttpClient.js";
import { extractCleanArticleText } from "../../tools/modules/web/extractWebpageTool.js";

export const RESEARCH_LIMITS = {
  MAX_PLANNED_QUERIES: 4,
  MAX_URLS_TO_OPEN: 3,
  MAX_FOLLOWUPS: 1,
  MAX_RESEARCH_TIME_MS: 12000,
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
    if (/\b(202[4-6]|\d+\s*(?:ms|gb|mb|tokens|billion|\$|%))\b/i.test(sentence)) {
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
 * Builds structured comparison dataset across dimensions for comparison & technical inquiries
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
  const comparisonPrompt = `User Query: "${query}"
Classified Intent: ${intent}
Current Real-World Date: ${currentDateFormatted}
Dimensions: ${dimensions.join(", ")}

Normalized Research Evidence (${evidencePack.length} items):
${evidencePack.map((e, idx) => `[Evidence ${idx + 1} (${e.sourceRole} - ${e.source} | ${e.sourceTier})]: ${e.passage}`).join("\n\n")}

Instructions:
1. Construct an objective, structured comparison matrix mapping each relevant entity/protocol across the key inquiry dimensions.
2. DO NOT declare an arbitrary overall winner. Focus on architectural or operational TRADEOFFS (e.g. latency vs frontier reasoning vs pricing vs implementation complexity).
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
  "decisionTradeoffs": "2-3 sentences synthesizing the core architectural/operational trade-offs without declaring a single winner."
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

  // =========================================================================
  // STAGE 1: RESEARCH INTENT CLASSIFICATION
  // =========================================================================
  const intentInfo = classifyResearchIntent(query);

  recordStep({
    phase: "PLANNING",
    title: `Research Intent: ${intentInfo.intent}`,
    thought: `Classified as ${intentInfo.intent} (confidence: ${(intentInfo.confidence * 100).toFixed(0)}%). Deep research: ${intentInfo.requiresDeepResearch ? "Active" : "Bypassed"}.`,
    intent: intentInfo.intent,
    confidence: intentInfo.confidence,
    requiresDeepResearch: intentInfo.requiresDeepResearch,
    dimensions: intentInfo.dimensions,
    status: "completed",
  });

  // =========================================================================
  // STAGE 2: DYNAMIC DATE-ANCHORED RESEARCH PLAN
  // =========================================================================
  recordStep({
    phase: "PLANNING",
    title: "Formulating Multi-Query Research Plan",
    thought: `Decomposing inquiry with temporal anchor ${dateCtx.formatted} (${dateCtx.year}).`,
    status: "in_progress",
  });

  const researchPlan = await formulateResearchPlan({
    query,
    intent: intentInfo.intent,
    dimensions: intentInfo.dimensions,
    callModel,
  });

  const searchTasks = Array.isArray(researchPlan.searchTasks) && researchPlan.searchTasks.length > 0
    ? researchPlan.searchTasks.slice(0, RESEARCH_LIMITS.MAX_PLANNED_QUERIES)
    : [{ topic: "Primary search", query: sanitizePlannerQuery(query, query, dateCtx.year), freshness: "current" }];

  recordStep({
    phase: "PLANNING",
    title: `Research Plan: ${searchTasks.length} Targeted Task(s)`,
    thought: `Plan formulated covering dimensions: ${researchPlan.dimensions.join(", ")}.`,
    plan: searchTasks.map((t) => `${t.topic}: "${t.query}"`),
    temporalAnchor: dateCtx.monthYear,
    status: "completed",
  });

  // =========================================================================
  // STAGE 3: PARALLEL SEARCH & QUALITY GATE
  // =========================================================================
  const observations = [];

  const searchPromises = searchTasks.map(async (task, taskIdx) => {
    let currentTaskQuery = sanitizePlannerQuery(task.query, query, dateCtx.year);

    recordStep({
      phase: "TOOL_EXECUTION",
      title: `Search Task ${taskIdx + 1}: ${task.topic}`,
      tool: "web_search",
      args: { query: currentTaskQuery },
      status: "in_progress",
    });

    let execRes = null;
    try {
      execRes = await toolExecutor.executeTool(
        "web_search",
        { query: currentTaskQuery },
        { context: { thinkingMode: true } }
      );
    } catch (err) {
      execRes = { ok: false, state: "SEARCH_ERROR", voiceSummary: err.message };
    }

    // PHASE 7: QUERY REWRITE & RECOVERY IF SEARCH IS EMPTY
    const isSearchEmpty = !execRes.ok || execRes.state === "SEARCH_EMPTY" || !Array.isArray(execRes.sources) || execRes.sources.length === 0;

    if (isSearchEmpty) {
      // Formulate non-identical fallback query
      const rewrittenQuery = `${task.topic.replace(/[?"'.,!]/g, "")} ${dateCtx.year} official overview`.trim();

      recordStep({
        phase: "EVALUATION",
        title: `Search Task ${taskIdx + 1}: Empty Result - Triggering Query Rewrite`,
        thought: `Query "${currentTaskQuery}" returned SEARCH_EMPTY. Rewriting to: "${rewrittenQuery}".`,
        status: "in_progress",
      });

      try {
        const retryRes = await toolExecutor.executeTool(
          "web_search",
          { query: rewrittenQuery },
          { context: { thinkingMode: true } }
        );
        if (retryRes.ok && Array.isArray(retryRes.sources) && retryRes.sources.length > 0) {
          execRes = retryRes;
          currentTaskQuery = rewrittenQuery;
        }
      } catch (_) {}
    }

    const success = execRes.ok !== false && execRes.state !== "SEARCH_EMPTY" && Array.isArray(execRes.sources) && execRes.sources.length > 0;
    const summary = execRes.voiceSummary || (execRes.data ? JSON.stringify(execRes.data).slice(0, 400) : "Search completed");

    // Ingest citations
    if (Array.isArray(execRes.sources)) {
      execRes.sources.forEach((src) => {
        const key = src.url || src.title;
        if (key && !seenUrls.has(key)) {
          seenUrls.add(key);
          allCitations.push({
            title: src.title || "External Reference",
            publisher: src.publisher || "Web",
            url: src.url || null,
            snippet: src.snippet || "",
            sourceType: src.sourceType || classifySourceTier(src.url, src.publisher),
            publishedAt: src.publishedAt || null,
            retrievedAt: new Date().toISOString(),
          });
        }
      });
    }

    observations.push({
      tool: "web_search",
      task: task.topic,
      query: currentTaskQuery,
      success,
      state: execRes.state || (success ? "SEARCH_SUCCESS" : "SEARCH_EMPTY"),
      summary,
    });

    toolTrace.push({
      tool: "web_search",
      args: { query: currentTaskQuery },
      success,
      state: execRes.state || (success ? "SEARCH_SUCCESS" : "SEARCH_EMPTY"),
    });

    recordStep({
      phase: "TOOL_OBSERVATION",
      title: success ? `Results: ${task.topic}` : `No Results: ${task.topic}`,
      tool: "web_search",
      observation: summary.slice(0, 300),
      status: success ? "completed" : "failed",
    });
  });

  await Promise.all(searchPromises);

  // =========================================================================
  // STAGE 4: SOURCE SELECTION & DEEP URL OPENING (PHASE 8)
  // =========================================================================
  const validUrlCitations = allCitations.filter(
    (c) => c.url && (c.url.startsWith("http://") || c.url.startsWith("https://"))
  );

  // Prioritize primary and established sources for deep extraction
  const prioritizedCandidates = [...validUrlCitations].sort((a, b) => {
    const tierScore = (t) => {
      if (t === SOURCE_TIERS.TIER_1_PRIMARY) return 4;
      if (t === SOURCE_TIERS.TIER_2_ESTABLISHED) return 3;
      if (t === SOURCE_TIERS.TIER_3_SECONDARY) return 2;
      return 1;
    };
    return tierScore(b.sourceType) - tierScore(a.sourceType);
  });

  const candidatesToOpen = prioritizedCandidates.slice(0, RESEARCH_LIMITS.MAX_URLS_TO_OPEN);
  const extractedPassages = [];

  if (candidatesToOpen.length > 0) {
    recordStep({
      phase: "TOOL_EXECUTION",
      title: `Opening & Extracting ${candidatesToOpen.length} Authoritative Source(s)`,
      thought: `Extracting deep technical/factual evidence from top URLs: ${candidatesToOpen.map((c) => c.publisher || c.title).join(", ")}.`,
      urls: candidatesToOpen.map((c) => c.url),
      status: "in_progress",
    });

    const openTasks = candidatesToOpen.map(async (candidate) => {
      try {
        const isSafe = await isUrlSafe(candidate.url);
        if (!isSafe) return null;

        const res = await safeOutboundRequest(candidate.url, { timeoutMs: 4500 });
        if (!res.ok) return null;

        const html = await res.text();
        const articleText = extractCleanArticleText(html);
        const passages = extractKeyPassages(articleText, query, researchPlan.dimensions, 2);
        const publishDate = extractPublishDate(html, candidate.url);

        if (passages.length > 0) {
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
          extractedPassages.push(deepItem);
          return deepItem;
        }
      } catch (_) {
        return null;
      }
    });

    await Promise.all(openTasks);

    if (openedPages.length > 0) {
      recordStep({
        phase: "TOOL_OBSERVATION",
        title: `Extracted Deep Evidence from ${openedPages.length} Source(s)`,
        thought: `Extracted primary verified passages from ${openedPages.map((p) => p.publisher || p.title).join(", ")}.`,
        status: "completed",
      });
    }
  }

  // =========================================================================
  // STAGE 5: EVIDENCE NORMALIZATION (PHASE 9)
  // =========================================================================
  const evidencePack = normalizeEvidencePack({
    citations: allCitations,
    extractedPassages,
    dimensions: researchPlan.dimensions,
  });

  // =========================================================================
  // STAGE 6: DETERMINISTIC QUALITY GATE (PHASE 6 & 10)
  // =========================================================================
  let detGate = evaluateEvidenceDeterministic({
    query,
    observations,
    citations: allCitations,
    currentYear: dateCtx.year,
  });

  recordStep({
    phase: "EVALUATION",
    title: detGate.passed ? "Deterministic Quality Gate: PASSED" : "Deterministic Quality Gate: WARNING",
    thought: detGate.passed
      ? `Validated ${allCitations.length} source(s), diversity: ${detGate.sourceDiversity}, freshnessOk: ${detGate.freshnessOk}.`
      : `Quality gate flagged: ${detGate.reason}`,
    deterministicEvaluation: detGate,
    status: detGate.passed ? "completed" : "failed",
  });

  // =========================================================================
  // STAGE 7: SEMANTIC GAP AUDIT & TARGETED FOLLOW-UP (PHASE 10 & 11)
  // =========================================================================
  let gapAudit = {
    sufficient: detGate.passed && detGate.freshnessOk,
    sourceCount: evidencePack.length,
    missingInformation: detGate.passed ? [] : detGate.missingInformation,
    conflicts: [],
    freshnessOk: detGate.freshnessOk,
    unsupportedClaims: [],
    followUpTask: null,
  };

  let followupsExecuted = 0;

  if (evidencePack.length > 0 && detGate.passed) {
    recordStep({
      phase: "EVALUATION",
      title: "Auditing Evidence Coverage (Qwen 27B)",
      thought: `Verifying multidimensional coverage for ${query} as of ${dateCtx.formatted}.`,
      status: "in_progress",
    });

    gapAudit = await evaluateSemanticGap({
      query,
      evidencePack,
      dimensions: researchPlan.dimensions,
      callModel,
      currentDateFormatted: dateCtx.formatted,
    });

    // Targeted Follow-Up if missing essential dimension
    if (
      !gapAudit.sufficient &&
      gapAudit.followUpTask &&
      gapAudit.followUpTask.query &&
      followupsExecuted < RESEARCH_LIMITS.MAX_FOLLOWUPS
    ) {
      followupsExecuted += 1;
      const followQuery = sanitizePlannerQuery(gapAudit.followUpTask.query, query, dateCtx.year);

      recordStep({
        phase: "EVALUATION",
        title: `Targeted Follow-up: ${gapAudit.followUpTask.topic || "Missing Dimension"}`,
        thought: `Semantic gap detected (${gapAudit.missingInformation?.join(", ") || "missing specifics"}). Executing targeted search: "${followQuery}".`,
        status: "in_progress",
      });

      try {
        const followRes = await toolExecutor.executeTool(
          "web_search",
          { query: followQuery },
          { context: { thinkingMode: true } }
        );

        if (followRes.ok && Array.isArray(followRes.sources) && followRes.sources.length > 0) {
          followRes.sources.forEach((src) => {
            const key = src.url || src.title;
            if (key && !seenUrls.has(key)) {
              seenUrls.add(key);
              allCitations.push({
                title: src.title || "External Reference",
                publisher: src.publisher || "Web",
                url: src.url || null,
                snippet: src.snippet || "",
                sourceType: src.sourceType || classifySourceTier(src.url, src.publisher),
                publishedAt: src.publishedAt || null,
                retrievedAt: new Date().toISOString(),
              });
              // Append to evidence pack
              evidencePack.push({
                source: src.publisher || src.title || "Web",
                url: src.url,
                publishedAt: src.publishedAt || null,
                retrievedAt: new Date().toISOString(),
                passage: src.snippet || src.title || "",
                sourceTier: classifySourceTier(src.url, src.publisher),
                sourceRole: "FOLLOWUP",
                relevance: 0.90,
              });
            }
          });

          toolTrace.push({
            tool: "web_search",
            args: { query: followQuery },
            success: true,
            isFollowup: true,
          });

          recordStep({
            phase: "TOOL_OBSERVATION",
            title: `Follow-up Results Retrieved`,
            tool: "web_search",
            observation: followRes.voiceSummary?.slice(0, 300) || "Follow-up completed",
            status: "completed",
          });
        }
      } catch (_) {}
    } else {
      recordStep({
        phase: "EVALUATION",
        title: "Semantic Gap Audit: Sufficient",
        thought: "Retrieved evidence pack satisfies key research dimensions.",
        status: "completed",
      });
    }
  }

  // =========================================================================
  // STAGE 8: STRUCTURED COMPARISON MATRIX (PHASE 12 & 13)
  // =========================================================================
  let comparisonMatrix = null;
  const isComparisonOrTechnical =
    intentInfo.intent === RESEARCH_INTENTS.COMPARISON ||
    intentInfo.intent === RESEARCH_INTENTS.TECHNICAL_RESEARCH ||
    /\b(best|compare|versus|vs|which should i use|alternatives|difference between)\b/i.test(query);

  if (isComparisonOrTechnical && evidencePack.length > 0) {
    recordStep({
      phase: "EVALUATION",
      title: "Synthesizing Objective Comparison Matrix",
      thought: `Mapping trade-offs across candidate entities and dimensions (${researchPlan.dimensions.join(", ")}).`,
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
        title: "Comparison Matrix Formulated",
        thought: comparisonMatrix.decisionTradeoffs || "Comparative criteria and operational trade-offs established.",
        status: "completed",
      });
    }
  }

  const durationMs = Math.round(performance.now() - t0);

  // =========================================================================
  // STAGE 9: COMPILE RESEARCH PROVENANCE & METADATA (PHASE 16)
  // =========================================================================
  const researchMeta = {
    intent: intentInfo.intent,
    temporalAnchor: dateCtx.monthYear,
    queriesUsed: searchTasks.length + followupsExecuted,
    sourcesUsed: allCitations.length,
    deepPagesRead: openedPages.length,
    followups: followupsExecuted,
    freshnessChecked: detGate.freshnessOk,
    deterministicPassed: detGate.passed,
    semanticSufficient: gapAudit.sufficient,
    researchDurationMs: durationMs,
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
