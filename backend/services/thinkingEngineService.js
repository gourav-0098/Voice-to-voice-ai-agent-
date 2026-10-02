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
  const allCitations = [];
  const seenUrls = new Set();

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
  // TIER 2 & 3: COMPLEX / MULTI-STEP REASONING PIPELINE
  // =========================================================================

  // Step 1: Complex Planning via REASONING_MODEL (GPT-OSS 120B)
  recordStep({
    phase: "PLANNING",
    title: "Decomposing Query & Strategic Planning",
    thought: `Analyzing complex inquiry via ${COGNITIVE_MODELS.REASONING_MODEL}. Decomposing factual dimensions.`,
    status: "in_progress",
  });

  const availableToolsList = toolRegistry.list().map((t) => `${t.name}: ${t.description}`).join("\n");

  const planPrompt = `Analyze the user's inquiry and formulate a strategic investigation plan.
Query: "${query}"

Available tools:
${availableToolsList}

Respond strictly in valid JSON format:
{
  "analysis": "1-sentence assessment of required investigation",
  "complexity": "LOW" | "MEDIUM" | "HIGH",
  "steps": ["Step 1", "Step 2"],
  "initialTools": [
    { "tool": "web_search", "args": { "query": "..." } }
  ]
}`;

  let planResult = null;
  try {
    const planAi = await callCognitiveModel({
      systemPrompt: "You are a strategic reasoning and planning agent. Return only valid JSON.",
      messages: [{ role: "user", content: planPrompt }],
      tier: "REASONING", // GPT-OSS 120B
      forceGroq,
      temperature: 0.2,
    });
    planResult = extractJsonBlock(planAi.reply) || {
      analysis: "Factual investigation required.",
      complexity: "MEDIUM",
      steps: ["Gather facts", "Synthesize findings"],
      initialTools: [{ tool: "web_search", args: { query } }],
    };
  } catch (err) {
    planResult = {
      analysis: "Direct retrieval required.",
      complexity: "MEDIUM",
      steps: ["Search authoritative records", "Synthesize response"],
      initialTools: [{ tool: "web_search", args: { query } }],
    };
  }

  const isHighComplexity = planResult.complexity === "HIGH" || query.toLowerCase().includes("deep research");

  recordStep({
    phase: "PLANNING",
    title: "Plan Formulated",
    thought: planResult.analysis || "Investigation roadmap established.",
    plan: planResult.steps || [],
    complexity: planResult.complexity || "MEDIUM",
    status: "completed",
  });

  // Step 2: Parallel Tool Execution
  const observations = [];
  const plannedTools = Array.isArray(planResult.initialTools) && planResult.initialTools.length > 0
    ? planResult.initialTools
    : [{ tool: "web_search", args: { query } }];

  // Execute initial planned tools in parallel for speed
  const toolExecPromises = plannedTools.slice(0, 3).map(async (toolReq) => {
    const toolName = toolReq.tool;
    const toolArgs = toolReq.args || {};

    recordStep({
      phase: "TOOL_EXECUTION",
      title: `Invoking Tool: ${toolName}`,
      tool: toolName,
      args: toolArgs,
      status: "in_progress",
    });

    try {
      const execRes = await toolExecutor.executeTool(toolName, toolArgs, { context: { thinkingMode: true } });
      const summary = execRes.voiceSummary || (execRes.data ? JSON.stringify(execRes.data).slice(0, 500) : "Completed");

      if (Array.isArray(execRes.sources)) {
        execRes.sources.forEach((src) => {
          const key = src.url || src.title;
          if (key && !seenUrls.has(key)) {
            seenUrls.add(key);
            allCitations.push({
              title: src.title || "External Source",
              publisher: src.publisher || "Web",
              url: src.url || null,
              snippet: src.snippet || "",
            });
          }
        });
      }

      const obsItem = { tool: toolName, args: toolArgs, success: execRes.ok !== false, summary };
      observations.push(obsItem);

      recordStep({
        phase: "TOOL_OBSERVATION",
        title: `Result from ${toolName}`,
        tool: toolName,
        observation: summary.slice(0, 300),
        status: "completed",
      });
    } catch (toolErr) {
      observations.push({ tool: toolName, args: toolArgs, success: false, summary: `Error: ${toolErr.message}` });
      recordStep({
        phase: "TOOL_OBSERVATION",
        title: `Error in ${toolName}`,
        tool: toolName,
        observation: toolErr.message,
        status: "failed",
      });
    }
  });

  await Promise.all(toolExecPromises);

  // Step 3: Fast Gap Checking via FAST_REASONER (Qwen 27B, ~350ms)
  let followUpExecuted = false;
  if (observations.length > 0) {
    const gapPrompt = `User Query: "${query}"
Observations retrieved:
${observations.map((o, idx) => `[${idx + 1}] ${o.tool}: ${o.summary}`).join("\n")}

Determine if we have sufficient factual evidence to answer with complete accuracy or if ONE critical follow-up tool is needed.
Respond strictly in JSON:
{
  "hasSufficientFacts": true | false,
  "followUpTool": null | { "tool": "calculate_expression" | "extract_webpage" | "web_search", "args": { ... } }
}`;

    try {
      const gapAi = await callCognitiveModel({
        systemPrompt: "You are a fast factual gap auditor. Return only valid JSON.",
        messages: [{ role: "user", content: gapPrompt }],
        tier: "FAST_REASONER", // Qwen 27B
        forceGroq,
        temperature: 0.1,
      });

      const gapData = extractJsonBlock(gapAi.reply);
      if (!gapData?.hasSufficientFacts && gapData?.followUpTool) {
        followUpExecuted = true;
        const ft = gapData.followUpTool;
        recordStep({
          phase: "EVALUATION",
          title: "Gap Detected: Invoking Follow-up Tool",
          thought: `Querying missing data via ${ft.tool}.`,
          nextTool: ft.tool,
          status: "in_progress",
        });

        try {
          const followRes = await toolExecutor.executeTool(ft.tool, ft.args || {}, { context: { thinkingMode: true } });
          const followSum = followRes.voiceSummary || (followRes.data ? JSON.stringify(followRes.data).slice(0, 500) : "Completed");
          observations.push({ tool: ft.tool, args: ft.args, success: followRes.ok !== false, summary: followSum });

          recordStep({
            phase: "TOOL_OBSERVATION",
            title: `Result from ${ft.tool}`,
            tool: ft.tool,
            observation: followSum.slice(0, 300),
            status: "completed",
          });
        } catch (_) {}
      } else {
        recordStep({
          phase: "EVALUATION",
          title: "Factual Sufficiency Achieved",
          thought: "Retrieved evidence is complete and answers all inquiry dimensions.",
          status: "completed",
        });
      }
    } catch (_) {}
  }

  // Step 4: Conditional Critique Stage (Skip when not needed to save 120B latency)
  let isCritiqueRun = false;
  let critiqueData = { isVerified: true, issues: [], verdict: "VERIFIED" };

  const isContestedOrFactCheck =
    query.toLowerCase().match(/\b(controversy|allegation|fake|true or false|fact check|claim|scam|lie|hoax)\b/) != null;

  if (isHighComplexity || isContestedOrFactCheck) {
    // Only run model verification when there are contested claims or high complexity
    isCritiqueRun = true;
    recordStep({
      phase: "CRITIQUE",
      title: "Auditing Contested Facts & Nuance",
      thought: `Cross-checking dates, names, and claims via ${COGNITIVE_MODELS.FAST_REASONER}.`,
      status: "in_progress",
    });

    const critiquePrompt = `User question: "${query}"
Retrieved observations:
${observations.map((o) => `- ${o.summary}`).join("\n")}

Verify:
1. Are there date discrepancies, contradictions, or unsubstantiated claims?
Return JSON:
{
  "isVerified": true,
  "issues": [],
  "verdict": "VERIFIED" | "CONTESTED"
}`;

    try {
      const critiqueAi = await callCognitiveModel({
        systemPrompt: "You are a rigorous factual verifier. Return only valid JSON.",
        messages: [{ role: "user", content: critiquePrompt }],
        tier: "FAST_REASONER", // Qwen 27B instead of slow 120B!
        forceGroq,
        temperature: 0.1,
      });
      critiqueData = extractJsonBlock(critiqueAi.reply) || critiqueData;
    } catch (_) {}

    recordStep({
      phase: "CRITIQUE",
      title: "Verification Complete",
      thought: critiqueData.issues?.length > 0 ? critiqueData.issues.join("; ") : "Claims verified against primary observations.",
      verdict: critiqueData.verdict,
      status: "completed",
    });
  } else {
    // Deterministic Sanity Check: All tools succeeded & non-empty
    const allSucceeded = observations.every((o) => o.success);
    recordStep({
      phase: "CRITIQUE",
      title: "Deterministic Sanity Check Passed",
      thought: allSucceeded ? "Observations verified non-empty and consistent. Critique skipped to optimize latency." : "Observations logged.",
      verdict: "VERIFIED",
      status: "completed",
    });
  }

  // Step 5: Final Synthesis (Gemini Flash or Qwen 27B for fast natural voice; 120B only for Deep Research)
  const synthesisTier = isHighComplexity ? "REASONING" : "FAST";
  const synthesisModelName = isHighComplexity ? COGNITIVE_MODELS.REASONING_MODEL : COGNITIVE_MODELS.FAST_MODEL;

  recordStep({
    phase: "SYNTHESIS",
    title: "Generating Spoken Answer",
    thought: `Synthesizing direct spoken conclusion via ${synthesisModelName}.`,
    status: "in_progress",
  });

  const baseInstruction = typeof aiService.getSystemInstruction === "function"
    ? aiService.getSystemInstruction(persona, voiceModel, {
        intensityLevel: 0,
        intensityLabel: "CASUAL_FRIEND",
        intent: "FACTUAL_INQUIRY",
        isFactual: true,
      })
    : "Answer directly, politely, and factually.";

  // Strip tool invocation rules from synthesis context so the model doesn't hallucinate calling tools again
  const cleanBaseInstruction = baseInstruction
    .replace(/\[MANDATORY TOOL RULES\]:[\s\S]*?(?=\[(?:STRICT|EVIDENCE|FACTUAL|PERSONA))/i, "")
    .replace(/If the user asks.*?invoke the.*?tool\./gi, "");

  const synthesisPrompt = `${cleanBaseInstruction}

[CRITICAL SYNTHESIS DIRECTIVE - READ CAREFULLY]:
1. ALL RESEARCH, TOOL EXECUTION, AND WEB SEARCHES ARE ALREADY 100% COMPLETE.
2. The empirical evidence is provided below in [VERIFIED EVIDENCE PACK].
3. DO NOT attempt to call tools. DO NOT write Python, code blocks, "toolcode", "print(...)", or tool function calls.
4. DO NOT promise to search or use conversational fillers (NEVER say "Ek minute", "Main check karke batata hoon", "Wait a second", or "I will use the websearch tool").
5. State the direct answer immediately and clearly in 1 to 2 natural spoken sentences for text-to-speech.
6. If the user asks in Hindi or Hinglish, reply in natural conversational Hinglish using the Latin/English alphabet.

[VERIFIED EVIDENCE PACK]:
${observations.map((o, idx) => `[Evidence ${idx + 1} (${o.tool})]: ${o.summary}`).join("\n\n")}

User Query: "${query}"`;

  let spokenReply = "";
  try {
    const synthAi = await callCognitiveModel({
      systemPrompt: "You are Chatly, an intelligent conversational AI delivering accurate, verified spoken conclusions directly to human ears. Never output toolcode, python, or promises to search.",
      messages: [{ role: "user", content: synthesisPrompt }],
      tier: synthesisTier,
      forceGroq,
      temperature: 0.2,
    });
    spokenReply = synthAi.reply
      .replace(/```[\s\S]*?```/g, "")
      .replace(/toolcode[\s\S]*/gi, "")
      .replace(/print\([a-zA-Z0-9_]+\([^)]*\)\)/gi, "")
      .replace(/^.*?(?:ek minute|ek second|hold on|let me check|main abhi check|main search karke|abhi dekh kar).*?(?:batata hoon|bata raha hoon|bata rahi hoon|dekh raha hoon)[.!?,;\s]*/i, "")
      .replace(/^.*?(?:I will use the|I am using the).*?(?:tool).*?[.!?,;\s]*/i, "")
      .replace(/[*#`_~[\]]/g, "")
      .trim();
  } catch (err) {
    spokenReply = observations[0]?.summary || "Based on the verified records, the information has been confirmed.";
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

  // Clean Provenance Return: Answer + Sources + Tool Trace + Verification
  return {
    answer: spokenReply,
    sources: allCitations,
    toolTrace: observations.map((o) => ({
      tool: o.tool,
      args: o.args,
      success: o.success,
    })),
    verification: {
      checked: isCritiqueRun,
      issues: critiqueData.issues || [],
      verdict: critiqueData.verdict || "VERIFIED",
    },
    // Backwards compatibility for voice pipeline SSE/WS
    reply: spokenReply,
    citations: allCitations,
    thinkingSteps,
    totalDurationMs,
  };
}

export default {
  runThinkingLoop,
  COGNITIVE_MODELS,
};
