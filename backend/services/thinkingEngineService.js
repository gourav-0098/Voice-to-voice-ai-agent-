/**
 * Thinking Engine Service for Chatly AI
 * Tiered Autonomous Cognitive Architecture
 *
 * Models Deployed:
 *  - FAST_MODEL: gemini-2.5-flash (pinned stable ID for fast tool synthesis & default talk)
 *  - REASONING_MODEL: openai/gpt-oss-120b (Groq 120B for hard planning & deep research)
 *  - FAST_REASONER: qwen/qwen3.8-27b (Groq ~350ms for intermediate checks & gap evaluation)
 *  - BACKUP_REASONER: openai/gpt-oss-20b (emergency fallback)
 *
 * Routing Tiers:
 *  - Tier 1 (Simple / Deterministic): Router -> Tool -> Fast Model (1 LLM Call, ~300ms)
 *  - Tier 2 (Moderate Research): GPT-OSS 120B Planner -> Parallel Tools -> Qwen 27B Check -> Fast Synthesis
 *  - Tier 3 (Deep Contested Research): 120B Planner -> Tools -> Qwen Check -> Qwen Verification -> 120B Synthesis
 */

import { geminiKeyManager } from "./geminiKeyManager.js";
import { toolExecutor } from "../tools/toolExecutor.js";
import { toolRegistry } from "../tools/toolRegistry.js";
import { ToolRouter } from "../tools/toolRouter.js";
import { systemSettingsService } from "./systemSettingsService.js";
import aiService from "./aiService.js";
import { classifyResearchIntent, RESEARCH_INTENTS } from "./research/researchIntentClassifier.js";
import { executeAdaptiveResearch } from "./research/researchOrchestrator.js";
import { queryNeedsRewrite, rewriteQueryForSearch } from "./research/researchQueryPlanner.js";

const toolRouter = new ToolRouter();

export const COGNITIVE_MODELS = {
  FAST_MODEL: process.env.CHATLY_FAST_MODEL || "gemini-2.5-flash",
  REASONING_MODEL: process.env.CHATLY_REASONING_MODEL || "openai/gpt-oss-120b",
  FAST_REASONER: process.env.CHATLY_FAST_REASONER || "qwen/qwen3.8-27b",
  BACKUP_REASONER: process.env.CHATLY_BACKUP_REASONER || "openai/gpt-oss-20b",
};

const STABLE_GEMINI_FALLBACKS = [
  "gemini-2.5-flash",
  "gemini-3.5-flash-lite",
];

/**
 * Execute prompt with targeted tier and automatic failover
 *
 * @param {Object} opts
 * @param {string} opts.systemPrompt
 * @param {Array} opts.messages
 * @param {"FAST" | "REASONING" | "FAST_REASONER" | "BACKUP"} [opts.tier="FAST"]
 * @param {number} [opts.temperature=0.3]
 * @param {boolean} [opts.forceGroq=false]
 * @param {number} [opts.maxTokens=1200]
 */
async function callCognitiveModel({
  systemPrompt,
  messages,
  tier = "FAST",
  temperature = 0.3,
  forceGroq = false,
  maxTokens = 1200,
}) {
  const groqApiKey = process.env.GROQ_API_KEY;

  const tryGroqModel = async (modelId) => {
    if (!groqApiKey) throw new Error("GROQ_API_KEY not configured");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Groq ${modelId} HTTP ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || "";
      if (reply.trim()) {
        return { reply: reply.trim(), model: modelId, provider: "groq" };
      }
      throw new Error(`Groq ${modelId} returned empty reply`);
    } finally {
      clearTimeout(timer);
    }
  };

  const tryGemini = async (preferredModel = COGNITIVE_MODELS.FAST_MODEL) => {
    return await geminiKeyManager.executeWithFailover(async (client) => {
      const modelsToTry = [preferredModel, ...STABLE_GEMINI_FALLBACKS.filter((m) => m !== preferredModel)];
      let lastErr = null;

      for (const model of modelsToTry) {
        try {
          const contents = messages.map((m) => ({
            role: m.role === "user" || m.role === "system" ? "user" : "model",
            parts: [{ text: m.content }],
          }));

          const response = await client.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction: systemPrompt,
              temperature,
            },
          });

          const reply = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (reply.trim()) {
            return { reply: reply.trim(), model, provider: "gemini" };
          }
        } catch (err) {
          lastErr = err;
          const msg = String(err?.message || "");
          if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
            throw err; // Trigger key failover in geminiKeyManager
          }
        }
      }
      throw lastErr || new Error("All Gemini models failed");
    });
  };

  // Execution dispatch based on Tier
  if (tier === "REASONING") {
    // 120B Heavyweight planner / deep research
    if (!forceGroq && !groqApiKey) return await tryGemini();
    try {
      return await tryGroqModel(COGNITIVE_MODELS.REASONING_MODEL);
    } catch (e1) {
      console.warn(`[THINKING ENGINE] 120B failed, falling back to 27B reasoner:`, e1.message);
      try {
        return await tryGroqModel(COGNITIVE_MODELS.FAST_REASONER);
      } catch (e2) {
        return await tryGemini();
      }
    }
  }

  if (tier === "FAST_REASONER") {
    // Qwen 27B (~350ms) for gap checking & intermediate checks
    if (!forceGroq && !groqApiKey) return await tryGemini();
    try {
      return await tryGroqModel(COGNITIVE_MODELS.FAST_REASONER);
    } catch (e1) {
      try {
        return await tryGroqModel(COGNITIVE_MODELS.BACKUP_REASONER);
      } catch (e2) {
        return await tryGemini();
      }
    }
  }

  // Default: FAST_MODEL (Gemini 2.5 Flash -> Qwen 27B)
  if (forceGroq) {
    try {
      return await tryGroqModel(COGNITIVE_MODELS.FAST_REASONER);
    } catch (_) {
      return await tryGroqModel(COGNITIVE_MODELS.BACKUP_REASONER);
    }
  }

  try {
    return await tryGemini(COGNITIVE_MODELS.FAST_MODEL);
  } catch (_) {
    return await tryGroqModel(COGNITIVE_MODELS.FAST_REASONER);
  }
}

/**
 * Parses JSON blocks from model outputs safely
 */
function extractJsonBlock(text) {
  if (!text) return null;
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const target = match ? match[1] : text;
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

export const RESEARCH_BUDGET = {
  MAX_RESEARCH_QUERIES: 4,
  MAX_TOOL_CALLS: 5,
  MAX_FOLLOWUPS: 1,
  MAX_TOTAL_RESEARCH_TIME_MS: 12000,
};

/**
 * Returns current real-world date context
 */
export function getCurrentDateContext() {
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
    isoDate: now.toISOString().split("T")[0],
  };
}

/**
 * Sanitizes planner-generated search queries to prevent accidental stale-year queries
 */
export function sanitizePlannerQuery(searchQuery, rawUserQuery, currentYear) {
  if (!searchQuery || typeof searchQuery !== "string") return "";
  const clean = searchQuery.trim();
  const userHasExplicitPastYear = /\b(19\d\d|20[01]\d|202[0-5])\b/.test(rawUserQuery);
  if (!userHasExplicitPastYear) {
    // If the planner outputs a past year (2020-2025) while user did not request it, replace with currentYear
    return clean.replace(/\b(202[0-5]|201\d)\b/g, String(currentYear));
  }
  return clean;
}

/**
 * Deterministically checks evidence count, valid URLs, relevance, and freshness
 */
export function evaluateEvidenceDeterministic({ query, observations, citations, currentYear }) {
  const successfulObs = observations.filter(
    (o) => o.success && o.summary && !o.summary.includes("[SEARCH_EMPTY]") && !o.summary.includes("No recent web search results")
  );
  const sourceCount = citations.length;

  if (successfulObs.length === 0 || sourceCount === 0) {
    return {
      passed: false,
      sufficient: false,
      reason: "No valid observations or web sources retrieved.",
      missingInformation: ["Primary facts for query"],
      conflicts: [],
      freshnessOk: false,
      sourceCount: 0,
      duplicateRate: 0,
      relevance: 0,
    };
  }

  // Valid URLs
  const validUrlCount = citations.filter((c) => c.url && (c.url.startsWith("http://") || c.url.startsWith("https://"))).length;
  if (validUrlCount === 0) {
    return {
      passed: false,
      sufficient: false,
      reason: "Retrieved citations lack valid URLs.",
      missingInformation: ["Authoritative web sources"],
      conflicts: [],
      freshnessOk: false,
      sourceCount,
      duplicateRate: 0,
      relevance: 0,
    };
  }

  // Duplicate Rate
  const uniqueUrls = new Set(citations.map((c) => c.url).filter(Boolean));
  const duplicateRate = citations.length > 0 ? (citations.length - uniqueUrls.size) / citations.length : 0;

  // Use evaluateEvidenceDeterministic imported from researchEvidenceGate
  const isHistorical = /\b(gandhi|ww2|world war|irwin|treaty|pact|empire|ancient|century|dynasty|history|historical)\b/i.test(query);
  const queryNeedsRecency = !isHistorical && (/\b(current|latest|today|now|recent|update|models|providers|api)\b/i.test(query) || !/\b(19\d\d|20[01]\d|202[0-5])\b/.test(query));
  const combinedText = (
    observations.map((o) => o.summary).join(" ") + " " +
    citations.map((c) => (c.snippet || "") + " " + (c.title || "")).join(" ")
  ).toLowerCase();

  const hasCurrentYear = combinedText.includes(String(currentYear));
  const hasStalePastYearOnly = (combinedText.includes("2024") || combinedText.includes("2023")) && !hasCurrentYear;
  const freshnessOk = !queryNeedsRecency || !hasStalePastYearOnly || hasCurrentYear;

  // Relevance Check
  const queryTokens = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !["what", "which", "where", "tell", "about", "show", "with"].includes(w));
  const matches = queryTokens.filter((k) => combinedText.includes(k));
  const relevance = queryTokens.length > 0 ? matches.length / queryTokens.length : 1;

  const passed = successfulObs.length > 0 && validUrlCount > 0 && relevance >= 0.25 && duplicateRate < 0.85;

  return {
    passed,
    sufficient: passed && freshnessOk,
    reason: passed ? "Deterministic checks passed." : "Evidence failed relevance or URL validity thresholds.",
    missingInformation: passed ? [] : ["Insufficient factual coverage of key inquiry terms"],
    conflicts: [],
    freshnessOk,
    sourceCount,
    duplicateRate: Number(duplicateRate.toFixed(2)),
    relevance: Number(relevance.toFixed(2)),
  };
}

/**
 * Builds structured comparison dataset across dimensions for comparison inquiries
 */
export async function buildStructuredComparison({ query, observations, citations, forceGroq }) {
  const comparisonPrompt = `User Query: "${query}"
Retrieved research evidence:
${observations.map((o, idx) => `[Evidence ${idx + 1} (${o.tool})]: ${o.summary}`).join("\n\n")}

Based strictly on the verified evidence above, construct an objective, structured comparison dataset.
Respond strictly in JSON format:
{
  "comparisonEntities": [
    {
      "provider": "Provider / Contender Name",
      "currentModels": "Key current models in production",
      "reasoning": "Reasoning capabilities",
      "speed": "Latency / throughput characteristics",
      "multimodal": "Vision / audio / multimodal support",
      "toolCalling": "Tool calling / structured output support",
      "context": "Context window limit",
      "pricing": "Pricing tier / cost structure",
      "notableStrengths": "Top strengths",
      "limitations": "Known limitations or trade-offs"
    }
  ],
  "decisionTradeoffs": "1-2 sentences summarizing key trade-off axes (e.g. ultra-low latency vs deep reasoning vs cost)"
}`;

  try {
    const compAi = await callCognitiveModel({
      systemPrompt: "You are an objective technology benchmarking analyst. Return only valid JSON without declaring an overall winner.",
      messages: [{ role: "user", content: comparisonPrompt }],
      tier: "FAST_REASONER", // Qwen 27B
      forceGroq,
      temperature: 0.1,
    });
    return extractJsonBlock(compAi.reply);
  } catch (_) {
    return null;
  }
}

/**
 * Sanitizes spoken reply text for text-to-speech rendering.
 * Acts as a strict last-resort fallback to remove code fences, raw toolcode artifacts,
 * and conversational lead-in fillers without corrupting normal factual speech containing words like 'print' or 'search'.
 *
 * @param {string} rawReply
 * @returns {string}
 */
export function sanitizeSpokenReply(rawReply) {
  if (!rawReply || typeof rawReply !== "string") return "";
  return rawReply
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\btoolcode\b[\s\S]*/gi, "")
    .replace(/print\([a-zA-Z0-9_]+\([^)]*\)\)/gi, "")
    .replace(/^.*?(?:ek minute|ek second|hold on|let me check|main abhi check|main search karke|abhi dekh kar).*?(?:batata hoon|bata raha hoon|bata rahi hoon|dekh raha hoon)[.!?,;\s]*/i, "")
    .replace(/^(?:I will use|I am using|Let me use|Using).*?\btool\b[^.!?]*[.!?]\s*/i, "")
    .replace(/[*#`_~[\]]/g, "")
    .trim();
}

/**
 * Tiered Thinking Engine Orchestrator
 *
 * @param {Object} params
 * @param {string} params.query - User query text
 * @param {string} [params.persona="conversational"] - Persona identifier
 * @param {string} [params.voiceModel="sarvam-aditya"] - Voice model
 * @param {Array} [params.history=[]] - Conversation history
 * @param {boolean} [params.forceGroq=false] - Restrict to Groq
 * @param {Function} [params.onStep] - Callback fired on each reasoning step
 * @returns {Promise<{ answer: string, sources: Array, toolTrace: Array, verification: Object, reply: string, citations: Array, thinkingSteps: Array, totalDurationMs: number }>}
 */
export async function runThinkingLoop({
  query,
  persona = "conversational",
  voiceModel = "sarvam-aditya",
  history = [],
  forceGroq = false,
  onStep = () => {},
}) {
  const t0 = performance.now();
  const thinkingSteps = [];

  const recordStep = (stepObj) => {
    const elapsedMs = Math.round(performance.now() - t0);
    const enriched = {
      stepIndex: thinkingSteps.length + 1,
      timestamp: new Date().toISOString(),
      elapsedMs,
      ...stepObj,
    };
    thinkingSteps.push(enriched);
    try {
      onStep(enriched);
    } catch (e) {
      console.warn("Thinking step callback error:", e.message);
    }
    return enriched;
  };

  console.log(`🧠 [THINKING ENGINE] Initiating tiered cognitive loop for: "${query.slice(0, 60)}..."`);

  // =========================================================================
  // TIER 1: DETERMINISTIC FAST-PATH (< 2ms router -> 1 Tool -> 1 Fast LLM call)
  // =========================================================================
  const deterministicRoute = toolRouter.route(query);
  if (deterministicRoute.shouldRoute && deterministicRoute.directExecution && deterministicRoute.toolName) {
    const directTool = deterministicRoute.toolName;
    const directArgs = deterministicRoute.args || {};

    recordStep({
      phase: "PLANNING",
      title: `Deterministic Fast-Path: ${directTool}`,
      thought: `Query classified for immediate single-tool resolution. Bypassing multi-stage planning.`,
      status: "completed",
    });

    recordStep({
      phase: "TOOL_EXECUTION",
      title: `Invoking Tool: ${directTool}`,
      tool: directTool,
      args: directArgs,
      status: "in_progress",
    });

    let toolRes = null;
    try {
      toolRes = await toolExecutor.executeTool(directTool, directArgs, { context: { thinkingMode: true } });
    } catch (err) {
      toolRes = { ok: false, voiceSummary: `Tool error: ${err.message}` };
    }

    const obsSummary = toolRes.voiceSummary || (toolRes.data ? JSON.stringify(toolRes.data) : "Executed");
    recordStep({
      phase: "TOOL_OBSERVATION",
      title: `Result from ${directTool}`,
      tool: directTool,
      observation: obsSummary.slice(0, 300),
      status: toolRes.ok !== false ? "completed" : "failed",
    });

    // Fast Single Synthesis (Gemini Flash or Qwen 27B)
    recordStep({
      phase: "SYNTHESIS",
      title: "Synthesizing Direct Answer",
      thought: `Generating direct natural response via ${COGNITIVE_MODELS.FAST_MODEL}.`,
      status: "in_progress",
    });

    const fastSynthPrompt = `You are Chatly, an ultra-fast conversational voice AI.
Answer the user's question directly in 1 short spoken sentence using the calculated/retrieved observation.
Question: "${query}"
Observation: "${obsSummary}"

MANDATE:
- Return ONLY the direct spoken answer.
- DO NOT lecture or output reasoning text.`;

    let finalAnswer = "";
    try {
      const fastAi = await callCognitiveModel({
        systemPrompt: "You are a concise conversational voice AI. Give direct 1-sentence answers.",
        messages: [{ role: "user", content: fastSynthPrompt }],
        tier: "FAST",
        forceGroq,
        temperature: 0.2,
      });
      finalAnswer = fastAi.reply.replace(/[*#`_~[\]]/g, "").trim();
    } catch (_) {
      finalAnswer = obsSummary;
    }

    const totalDurationMs = Math.round(performance.now() - t0);
    recordStep({
      phase: "SYNTHESIS",
      title: "Complete",
      thought: `Resolved in ${totalDurationMs}ms with 1 Fast Model call.`,
      finalReply: finalAnswer,
      status: "completed",
    });

    return {
      answer: finalAnswer,
      sources: [],
      toolTrace: [{ tool: directTool, args: directArgs, success: toolRes.ok !== false }],
      verification: { checked: false, issues: [], verdict: "DIRECT_EXECUTION" },
      reply: finalAnswer,
      citations: [],
      thinkingSteps,
      totalDurationMs,
    };
  }

  // =========================================================================
  // TIER 2 & 3: ADAPTIVE RESEARCH & REASONING PIPELINE
  // =========================================================================
  const currentDate = getCurrentDateContext();
  const intentInfo = classifyResearchIntent(query);

  let researchData = null;
  let observations = [];
  let allCitations = [];
  let structuredComparison = null;
  let detEvidence = null;
  let qwenGapData = null;
  let toolTrace = [];
  let researchMeta = null;

  if (intentInfo.requiresDeepResearch) {
    // RUN ADAPTIVE RESEARCH ORCHESTRATOR (PHASES 1 - 14)
    recordStep({
      phase: "PLANNING",
      title: `Activating Adaptive Research (${intentInfo.intent})`,
      thought: `Inquiry requires multi-source evidence grounding across dimensions: ${intentInfo.dimensions.join(", ")}. Anchor: ${currentDate.formatted}.`,
      status: "in_progress",
    });

    researchData = await executeAdaptiveResearch({
      query,
      callModel: (params) => callCognitiveModel({ ...params, forceGroq }),
      recordStep,
      options: { forceGroq },
    });

    observations = researchData.observations || [];
    allCitations = researchData.citations || [];
    structuredComparison = researchData.comparisonMatrix;
    detEvidence = researchData.deterministicGate;
    qwenGapData = researchData.gapAudit;
    toolTrace = researchData.toolTrace;
    researchMeta = researchData.researchMeta;
  } else {
    // FAST PATH FOR SIMPLE FACTS / CURRENT FACTS / DIRECT DEFINITIONS (< 1.5s)
    const isCurrentFact = intentInfo.intent === RESEARCH_INTENTS.CURRENT_FACT;
    let sanitizedQuery = sanitizePlannerQuery(query, query, currentDate.year);
    let rewrittenSubtopics = [];

    // QUERY REWRITE: Translate Hinglish, fix typos, decompose multi-topic queries
    // Only triggers for queries that contain Hinglish words, common typos, or are very long multi-topic
    const needsRewrite = queryNeedsRewrite(query);
    if (needsRewrite) {
      recordStep({
        phase: "PLANNING",
        title: "Query Rewrite",
        thought: `Detected Hinglish/typo/multi-topic input. Rewriting to clean English search keywords before search.`,
        status: "in_progress",
      });

      try {
        const callModelForRewrite = (params) => callCognitiveModel({ ...params, forceGroq: false });
        const rewritten = await rewriteQueryForSearch(query, callModelForRewrite);
        if (rewritten.primary && rewritten.primary.length > 3) {
          sanitizedQuery = sanitizePlannerQuery(rewritten.primary, query, currentDate.year);
          rewrittenSubtopics = (rewritten.subtopics || []).filter(s => s && s.length > 3);
        }
      } catch (rewriteErr) {
        console.warn("[FastPath] Query rewrite failed, using raw query:", rewriteErr.message);
      }
    }

    recordStep({
      phase: "PLANNING",
      title: isCurrentFact ? "Targeted Fact Retrieval" : "Direct Knowledge Retrieval",
      thought: `Query classified as ${intentInfo.intent}. Dynamic anchor: ${currentDate.formatted}. Fast single-step resolution.${needsRewrite ? ` Rewritten search query: "${sanitizedQuery}"` : ""}`,
      status: "in_progress",
    });

    // Helper: execute a single search and collect results
    const executeAndCollect = async (searchQuery, label = "web_search") => {
      let toolRes = null;
      try {
        recordStep({
          phase: "TOOL_EXECUTION",
          title: `Invoking Tool: ${label}`,
          tool: "web_search",
          args: { query: searchQuery },
          status: "in_progress",
        });

        toolRes = await toolExecutor.executeTool("web_search", { query: searchQuery }, { context: { thinkingMode: true } });
      } catch (err) {
        toolRes = { ok: false, state: "SEARCH_ERROR", voiceSummary: err.message };
      }

      const isSearchEmpty = !toolRes.ok || toolRes.state === "SEARCH_EMPTY" || !Array.isArray(toolRes.sources) || toolRes.sources.length === 0;
      const success = toolRes.ok !== false && !isSearchEmpty;
      const summary = toolRes.voiceSummary || (toolRes.data ? JSON.stringify(toolRes.data).slice(0, 400) : "Search completed");

      if (Array.isArray(toolRes.sources)) {
        toolRes.sources.forEach((src) => {
          allCitations.push({
            title: src.title || "External Source",
            publisher: src.publisher || "Web",
            url: src.url || null,
            snippet: src.snippet || "",
            sourceType: src.sourceType || "GENERAL_WEB",
            publishedAt: src.publishedAt || null,
            retrievedAt: new Date().toISOString(),
          });
        });
      }

      observations.push({
        tool: "web_search",
        args: { query: searchQuery },
        success,
        state: toolRes.state || (success ? "SEARCH_SUCCESS" : "SEARCH_EMPTY"),
        summary,
      });

      toolTrace.push({
        tool: "web_search",
        args: { query: searchQuery },
        success,
      });

      recordStep({
        phase: "TOOL_OBSERVATION",
        title: success ? "Search Observation" : "No Results",
        tool: "web_search",
        observation: summary.slice(0, 300),
        status: success ? "completed" : "failed",
      });

      return { success, summary, toolRes };
    };

    // Primary search
    await executeAndCollect(sanitizedQuery, "web_search");

    // Multi-topic subtopic searches (run in parallel, max 2 extra)
    if (rewrittenSubtopics.length > 0) {
      const subtopicSearches = rewrittenSubtopics.slice(0, 2).map((sub) => {
        const subQuery = sanitizePlannerQuery(sub, query, currentDate.year);
        return executeAndCollect(subQuery, `web_search (subtopic)`);
      });
      await Promise.allSettled(subtopicSearches);
    }

    // Deterministic gate on initial search
    detEvidence = evaluateEvidenceDeterministic({
      query,
      observations,
      citations: allCitations,
      currentYear: currentDate.year,
    });

    // Recovery search: use LLM-rewritten broadened query (NOT raw Hinglish with punctuation stripped)
    if (!detEvidence.passed || !detEvidence.sufficient) {
      let recoveryQuery;
      if (needsRewrite) {
        // Already rewritten — try broadening: add context terms
        recoveryQuery = intentInfo.requiresCurrentDate
          ? `${sanitizedQuery} ${currentDate.year} latest news`.replace(/\s+/g, " ").trim()
          : `${sanitizedQuery} overview facts details`.replace(/\s+/g, " ").trim();
      } else {
        recoveryQuery = intentInfo.requiresCurrentDate
          ? `${query.replace(/[^\w\s]/g, " ").trim()} ${currentDate.year}`.replace(/\s+/g, " ")
          : query.replace(/[^\w\s]/g, " ").trim();
      }

      if (recoveryQuery !== sanitizedQuery) {
        recordStep({
          phase: "TOOL_EXECUTION",
          title: "Invoking Recovery Search: web_search",
          tool: "web_search",
          args: { query: recoveryQuery },
          thought: `Initial search insufficient (${detEvidence.reason}). Executing targeted 1-step recovery.`,
          status: "in_progress",
        });

        try {
          const recRes = await toolExecutor.executeTool("web_search", { query: recoveryQuery }, { context: { thinkingMode: true } });
          const recIsEmpty = !recRes.ok || recRes.state === "SEARCH_EMPTY" || !Array.isArray(recRes.sources) || recRes.sources.length === 0;
          if (recRes.ok !== false && !recIsEmpty) {
            recRes.sources.forEach((src) => {
              allCitations.push({
                title: src.title || "External Source",
                publisher: src.publisher || "Web",
                url: src.url || null,
                snippet: src.snippet || "",
                sourceType: src.sourceType || "GENERAL_WEB",
                publishedAt: src.publishedAt || null,
                retrievedAt: new Date().toISOString(),
              });
            });

            observations.push({
              tool: "web_search",
              args: { query: recoveryQuery },
              success: true,
              state: recRes.state || "SEARCH_SUCCESS",
              summary: recRes.voiceSummary || JSON.stringify(recRes.data).slice(0, 400),
            });

            toolTrace.push({
              tool: "web_search",
              args: { query: recoveryQuery },
              success: true,
            });

            // Re-evaluate deterministic gate with recovered evidence
            detEvidence = evaluateEvidenceDeterministic({
              query,
              observations,
              citations: allCitations,
              currentYear: currentDate.year,
            });
          }
        } catch (_) {}
      }
    }

    qwenGapData = {
      sufficient: detEvidence.passed && detEvidence.freshnessOk,
      missingInformation: detEvidence.missingInformation,
      conflicts: [],
      freshnessOk: detEvidence.freshnessOk,
      sourceCount: allCitations.length,
    };

    researchMeta = {
      intent: intentInfo.intent,
      temporalAnchor: currentDate.formatted,
      queriesUsed: toolTrace.length,
      sourcesUsed: allCitations.length,
      deepPagesRead: 0,
      followups: toolTrace.length > 1 ? 1 : 0,
      freshnessChecked: detEvidence.freshnessOk,
      deterministicPassed: detEvidence.passed,
      semanticSufficient: qwenGapData.sufficient,
      researchDurationMs: Math.round(performance.now() - t0),
    };
  }

  // =========================================================================
  // FINAL SYNTHESIS (PHASE 16 & 17)
  // =========================================================================
  const isHighComplexity =
    intentInfo.intent === RESEARCH_INTENTS.DEEP_RESEARCH ||
    intentInfo.intent === RESEARCH_INTENTS.TECHNICAL_RESEARCH;
  const synthesisTier = isHighComplexity ? "REASONING" : "FAST";
  const synthesisModelName = isHighComplexity ? COGNITIVE_MODELS.REASONING_MODEL : COGNITIVE_MODELS.FAST_MODEL;

  recordStep({
    phase: "SYNTHESIS",
    title: "Generating Verified Spoken Answer",
    thought: `Synthesizing direct spoken conclusion via ${synthesisModelName}.`,
    status: "in_progress",
  });

  let spokenReply = "";
  const validObservations = observations.filter((o) => o.success && !o.summary.includes("[SEARCH_EMPTY]"));

  if (validObservations.length === 0 && allCitations.length === 0) {
    spokenReply = `I was unable to verify current records for "${query}" across the search feeds right now.`;
  } else {
    const baseInstruction = typeof aiService.getSystemInstruction === "function"
      ? aiService.getSystemInstruction(persona, voiceModel, {
          intensityLevel: 0,
          intensityLabel: "CASUAL_FRIEND",
          intent: "FACTUAL_INQUIRY",
          isFactual: true,
        })
      : "Answer directly, politely, and factually.";

    const cleanBaseInstruction = baseInstruction
      .replace(/\[MANDATORY TOOL RULES\]:[\s\S]*?(?=\[(?:STRICT|EVIDENCE|FACTUAL|PERSONA))/i, "")
      .replace(/If the user asks.*?invoke the.*?tool\./gi, "");

    const isNotableWorks = intentInfo.intent === RESEARCH_INTENTS.NOTABLE_WORKS;
    const isHistoricalOrNotable =
      isNotableWorks ||
      intentInfo.intent === RESEARCH_INTENTS.HISTORICAL_INFORMATION ||
      intentInfo.intent === RESEARCH_INTENTS.BIOGRAPHICAL_INFORMATION;

    const isComparisonOrTechnical =
      !isHistoricalOrNotable &&
      (intentInfo.intent === RESEARCH_INTENTS.COMPARISON ||
      intentInfo.intent === RESEARCH_INTENTS.TECHNICAL_RESEARCH ||
      /\b(compare|versus|vs|which should i use|alternatives|difference between)\b/i.test(query));

    const comparisonBlock = (!isHistoricalOrNotable && structuredComparison?.comparisonEntities?.length)
      ? `\n[STRUCTURED COMPARISON DATASET (DO NOT DECLARE AN OVERALL WINNER - EXPLAIN TRADEOFFS)]:\n${JSON.stringify(structuredComparison.comparisonEntities, null, 2)}\nKey Tradeoff Analysis: ${structuredComparison.decisionTradeoffs || "Criteria dependent"}\n`
      : "";

    const evidencePack = researchData?.evidencePack || [];
    const evidenceText = evidencePack.length > 0
      ? evidencePack.map((e, idx) => `[Evidence ${idx + 1} (${e.sourceRole} - ${e.source} | ${e.sourceTier})]: ${e.passage}`).join("\n\n")
      : validObservations.map((o, idx) => `[Evidence ${idx + 1} (${o.tool})]: ${o.summary}`).join("\n\n");

    const synthesisPrompt = `${cleanBaseInstruction}

[TEMPORAL ANCHOR]:
Current real-world date is ${currentDate.formatted} (Year ${currentDate.year}).

[CRITICAL SYNTHESIS DIRECTIVES - READ CAREFULLY]:
1. ALL RESEARCH, TOOL EXECUTION, AND SEARCHES ARE ALREADY 100% COMPLETE.
2. The empirical evidence is provided below in [VERIFIED EVIDENCE PACK]${comparisonBlock ? " and [STRUCTURED COMPARISON DATASET]" : ""}.
3. DO NOT attempt to call tools. DO NOT write Python, code blocks, "toolcode", "print(...)", or tool function calls.
4. DO NOT promise to search or use conversational fillers (NEVER say "Ek minute", "Main check karke batata hoon", "Wait a second", or "I will use the websearch tool").
5. State the direct answer immediately and clearly in 2 to 3 natural spoken sentences for text-to-speech. Do NOT speak URLs or raw citation brackets.
${isNotableWorks ? "6. FOR NOTABLE / MAJOR WORKS: Present the recognized major works (titles, writings, philosophical contributions) directly and clearly. DO NOT frame as a comparative ranking scorecard." : ""}
${isComparisonOrTechnical ? "6. FOR COMPARISON QUESTIONS: DO NOT arbitrarily pick a single winner. Objectively explain the key criteria and trade-offs so the user can choose the best option." : ""}
7. If the user asks in Hindi or Hinglish, reply in natural conversational Hinglish using the Latin/English alphabet.

${comparisonBlock}
[VERIFIED EVIDENCE PACK]:
${evidenceText}

User Query: "${query}"`;

    try {
      const synthAi = await callCognitiveModel({
        systemPrompt: "You are Chatly, an intelligent conversational AI delivering accurate, verified spoken conclusions directly to human ears. Never output toolcode, python, or promises to search.",
        messages: [{ role: "user", content: synthesisPrompt }],
        tier: synthesisTier,
        forceGroq,
        temperature: 0.2,
      });
      spokenReply = sanitizeSpokenReply(synthAi.reply);
    } catch (err) {
      spokenReply = validObservations[0]?.summary || "Based on verified records, the information has been retrieved.";
    }
  }

  const totalDurationMs = Math.round(performance.now() - t0);

  recordStep({
    phase: "SYNTHESIS",
    title: "Thinking Complete",
    thought: `Answer synthesized in ${totalDurationMs}ms across ${thinkingSteps.length} cognitive steps.`,
    finalReply: spokenReply,
    status: "completed",
  });

  console.log(`✅ [THINKING ENGINE] Completed ${thinkingSteps.length} steps in ${totalDurationMs}ms. Spoken: "${spokenReply.slice(0, 60)}..."`);

  return {
    answer: spokenReply,
    sources: allCitations,
    toolTrace,
    verification: {
      checked: true,
      issues: qwenGapData?.conflicts || [],
      verdict: detEvidence?.passed ? "VERIFIED" : "UNVERIFIED",
      sufficiency: qwenGapData,
      deterministic: detEvidence,
    },
    reply: spokenReply,
    citations: allCitations,
    thinkingSteps,
    totalDurationMs,
    researchMeta,
  };
}

export default {
  runThinkingLoop,
  COGNITIVE_MODELS,
};
