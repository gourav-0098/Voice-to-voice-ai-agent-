/**
 * Chatly Behavior Lab - Reusable Test & Observation Harness
 * backend/behavior-lab/harness.mjs
 *
 * Interacts with the real running Chatly backend over WebSocket (ws://localhost:5000/ws/voice)
 * or HTTP SSE (http://localhost:5000/api/voice/stream).
 *
 * Captures full execution traces, thinking steps, tool invocations, evidence decisions,
 * and timing telemetry without altering production logic.
 */

import WebSocket from "ws";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WS_URL = process.env.CHATLY_WS_URL || "ws://localhost:5000/ws/voice";
const HTTP_URL = process.env.CHATLY_HTTP_URL || "http://localhost:5000/api/voice/stream";

/**
 * Sanitizes arguments and summaries to prevent secret leakage
 */
function redactSecrets(obj) {
  if (!obj) return obj;
  try {
    const str = JSON.stringify(obj);
    const cleaned = str.replace(/(?:key|token|secret|password|auth|authorization)=["']?([^"'&,\s]+)/gi, '$1=***REDACTED***');
    return JSON.parse(cleaned);
  } catch (_) {
    return obj;
  }
}

/**
 * Executes a single turn over WebSocket and records all incoming telemetry events
 */
function executeWsTurn(ws, payload, timeoutMs = 40000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const trace = {
      events: [],
      thinkingSteps: [],
      tokens: [],
      toolCalls: [],
      audioChunksCount: 0,
      languageChangedEvent: null,
      modeEvent: null,
      factCheckEvent: null,
      ragEvent: null,
      turnCompleteEvent: null,
      doneEvent: null,
      errorEvent: null,
      timedOut: false,
      firstTokenMs: null,
      firstAudioMs: null,
      totalElapsedMs: 0,
      finalAnswer: "",
    };

    const timer = setTimeout(() => {
      trace.timedOut = true;
      trace.totalElapsedMs = Date.now() - t0;
      cleanup();
      resolve(trace);
    }, timeoutMs);

    const onMessage = (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        trace.events.push({ type: data.type, timestamp: Date.now() - t0 });

        if (data.type === "mode") {
          trace.modeEvent = data;
        } else if (data.type === "token_delta" && data.token) {
          if (!trace.firstTokenMs) trace.firstTokenMs = Date.now() - t0;
          trace.tokens.push(data.token);
        } else if (data.type === "audio_chunk") {
          trace.audioChunksCount++;
          if (!trace.firstAudioMs) trace.firstAudioMs = Date.now() - t0;
        } else if (data.type === "thinking_step") {
          trace.thinkingSteps.push({
            phase: data.phase,
            title: data.title,
            thought: data.thought,
            tool: data.tool,
            args: redactSecrets(data.args),
            observation: data.observation ? String(data.observation).slice(0, 300) : null,
            elapsedMs: data.elapsedMs,
            status: data.status,
          });
          if (data.tool && (data.phase === "TOOL_EXECUTION" || data.status === "in_progress")) {
            trace.toolCalls.push({
              tool: data.tool,
              args: redactSecrets(data.args),
              timestampMs: Date.now() - t0,
            });
          }
        } else if (data.type === "language_changed") {
          trace.languageChangedEvent = data;
        } else if (data.type === "factcheck") {
          trace.factCheckEvent = data;
        } else if (data.type === "rag_grounded") {
          trace.ragEvent = data;
        } else if (data.type === "turn_complete") {
          trace.turnCompleteEvent = data;
          trace.finalAnswer = data.reply || data.fullText || trace.finalAnswer;
        } else if (data.type === "done") {
          trace.doneEvent = data;
          trace.finalAnswer = data.reply || data.fullText || trace.finalAnswer;
          trace.totalElapsedMs = Date.now() - t0;
          cleanup();
          resolve(trace);
        } else if (data.type === "error" || data.type === "quota_exceeded") {
          trace.errorEvent = data;
          trace.totalElapsedMs = Date.now() - t0;
          cleanup();
          resolve(trace);
        }
      } catch (parseErr) {
        console.warn("WS Parse Error:", parseErr.message);
      }
    };

    function cleanup() {
      clearTimeout(timer);
      try {
        ws.off("message", onMessage);
      } catch (_) {}
    }

    ws.on("message", onMessage);

    const enrichedPayload = {
      guestId: payload.guestId || `lab_session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...payload,
    };
    ws.send(JSON.stringify(enrichedPayload));
  });
}

/**
 * Creates an open WebSocket connection with proper browser origin header
 */
function openWsConnection() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, {
      headers: { Origin: "http://localhost:3000" }
    });
    const timer = setTimeout(() => {
      try { ws.terminate(); } catch (_) {}
      reject(new Error(`WebSocket connection timeout to ${WS_URL}`));
    }, 8000);

    ws.on("open", () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Main Runner Function
 */
export async function runBehaviorLab(options = {}) {
  const {
    setName = "all", // "general" | "search" | "all"
    level = "all",    // 1..5 | "all"
    questionId = null,
    questionIds = null,
    limit = null,
    timeoutMs = 45000,
    outputDir = path.join(__dirname, "runs"),
  } = options;

  await fs.mkdir(outputDir, { recursive: true });

  const runTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runId = `RUN-${runTimestamp}`;
  console.log(`================================================================================`);
  console.log(`🔬 STARTING CHATLY BEHAVIOR LAB [${runId}]`);
  console.log(`   Target Server: ${WS_URL}`);
  console.log(`   Question Set:  ${setName} | Level: ${level} | Timeout: ${timeoutMs}ms`);
  console.log(`================================================================================\n`);

  // Load question sets
  const loadedSets = [];
  if (setName === "general" || setName === "all") {
    const genPath = path.join(__dirname, "questions", "general_intelligence.json");
    const data = JSON.parse(await fs.readFile(genPath, "utf-8"));
    loadedSets.push({ setName: "general_intelligence", data });
  }
  if (setName === "search" || setName === "all") {
    const searchPath = path.join(__dirname, "questions", "search_mode.json");
    const data = JSON.parse(await fs.readFile(searchPath, "utf-8"));
    loadedSets.push({ setName: "search_mode", data });
  }
  if (setName === "challenges" || setName === "all") {
    const chalPath = path.join(__dirname, "questions", "full_scale_challenges.json");
    try {
      const data = JSON.parse(await fs.readFile(chalPath, "utf-8"));
      loadedSets.push({
        setName: "full_scale_challenges",
        data: {
          questions: data.challenges || [],
          multiTurnSequences: data.multiTurnChallenges || [],
          metadata: data.metadata,
        },
      });
    } catch (_) {}
  }

  const results = [];
  const runJsonlPath = path.join(outputDir, `${runId}.jsonl`);
  const jsonlHandle = await fs.open(runJsonlPath, "w");

  let totalQuestionsExecuted = 0;
  let totalSuccessfulTurns = 0;
  let totalTimeouts = 0;
  let totalErrors = 0;

  for (const setItem of loadedSets) {
    const setQuestions = setItem.data.questions || [];
    const multiTurnSequences = setItem.data.multiTurnSequences || [];
    const defaultMode = setItem.data.metadata?.defaultMode || setItem.data.defaultMode || "FAST";
    const defaultEffort = setItem.data.metadata?.defaultEffort || setItem.data.defaultEffort || "MEDIUM";

    console.log(`\n📂 Loading Set: ${setItem.setName} (${setQuestions.length} isolated questions, ${multiTurnSequences.length} sequences)`);

    // Filter isolated questions
    let filteredQuestions = setQuestions.filter((q) => {
      if (questionIds && Array.isArray(questionIds) && !questionIds.includes(q.id)) return false;
      if (questionId && typeof questionId === "string" && questionId.includes(",")) {
        if (!questionId.split(",").map((s) => s.trim()).includes(q.id)) return false;
      } else if (questionId && q.id !== questionId) {
        return false;
      }
      if (level !== "all" && String(q.level) !== String(level)) return false;
      return true;
    });

    if (limit && filteredQuestions.length > limit) {
      filteredQuestions = filteredQuestions.slice(0, limit);
    }

    // Execute Isolated Questions
    for (const q of filteredQuestions) {
      totalQuestionsExecuted++;
      console.log(`\n▶️  [${setItem.setName}] [Level ${q.level}] ${q.id}: ${q.name}`);
      console.log(`   Query: "${q.prompt.slice(0, 80)}${q.prompt.length > 80 ? '...' : ''}"`);

      let ws = null;
      let trace = null;
      try {
        ws = await openWsConnection();
        const mode = q.mode || defaultMode;
        const effort = q.effort || defaultEffort;
        const guestId = `lab_${q.id}_${Date.now()}`;

        const isDeepTask = mode === "SEARCH" || effort === "HIGH" || effort === "MAX" || q.id?.startsWith("CHAL");
        const effectiveTurnTimeoutMs = isDeepTask ? Math.max(timeoutMs, 90000) : timeoutMs;

        trace = await executeWsTurn(ws, {
          type: "speech",
          text: q.prompt,
          mode,
          effort,
          guestId,
          persona: "conversational"
        }, effectiveTurnTimeoutMs);
      } catch (err) {
        console.error(`   ❌ Connection/Execution Error:`, err.message);
        trace = { errorEvent: { message: err.message }, timedOut: false, totalElapsedMs: 0, finalAnswer: "" };
      } finally {
        if (ws) {
          try { ws.close(); } catch (_) {}
        }
      }

      if (trace.timedOut) totalTimeouts++;
      if (trace.errorEvent) totalErrors++;
      if (!trace.timedOut && !trace.errorEvent && trace.finalAnswer) totalSuccessfulTurns++;

      console.log(`   ⏱️  Elapsed: ${trace.totalElapsedMs}ms | First Audio: ${trace.firstAudioMs || "n/a"}ms | Tools: ${trace.toolCalls?.map(t => t.tool).join(', ') || '0'}`);
      console.log(`   💬 Spoken: "${(trace.finalAnswer || '').slice(0, 100)}${trace.finalAnswer?.length > 100 ? '...' : ''}"`);

      const record = {
        runId,
        setId: setItem.setName,
        questionId: q.id,
        level: q.level,
        difficulty: q.difficulty,
        category: q.category,
        questionName: q.name,
        inputPrompt: q.prompt,
        expectedFactId: q.expectedFactId || null,
        expectedBehavior: q.expectedBehavior,
        rubric: q.rubric || {},
        execution: {
          mode: q.mode || defaultMode,
          effort: q.effort || defaultEffort,
          timedOut: trace.timedOut,
          totalElapsedMs: trace.totalElapsedMs,
          firstTokenMs: trace.firstTokenMs,
          firstAudioMs: trace.firstAudioMs,
          finalAnswer: trace.finalAnswer,
          toolCallsCount: trace.toolCalls?.length || 0,
          toolCalls: trace.toolCalls || [],
          thinkingStepsCount: trace.thinkingSteps?.length || 0,
          thinkingSteps: trace.thinkingSteps || [],
          audioChunksCount: trace.audioChunksCount || 0,
          languageChanged: trace.languageChangedEvent || null,
          factCheck: trace.factCheckEvent || null,
          citations: trace.ragEvent?.citations || trace.turnCompleteEvent?.citations || trace.doneEvent?.citations || [],
          telemetry: trace.turnCompleteEvent?.telemetry || trace.doneEvent?.telemetry || null,
          error: trace.errorEvent ? trace.errorEvent.message : null,
        },
        timestamp: new Date().toISOString(),
      };

      results.push(record);
      await jsonlHandle.write(JSON.stringify(record) + "\n");
      await new Promise((r) => setTimeout(r, 200));
    }

    // Execute Multi-Turn Sequences if applicable
    if (setName === "general" || setName === "challenges" || setName === "all") {
      for (const seq of multiTurnSequences) {
        if (questionId && !seq.sequenceId.includes(questionId)) continue;
        console.log(`\n🔄 [MULTI-TURN SEQUENCE] ${seq.sequenceId}: ${seq.name}`);

        let ws = null;
        let trace = null;
        const sequenceHistory = [];
        try {
          ws = await openWsConnection();
          const sessionGuestId = `lab_seq_${seq.sequenceId}_${Date.now()}`;

          for (const turnItem of seq.turns) {
            totalQuestionsExecuted++;
            console.log(`   Turn ${turnItem.turn}: "${turnItem.prompt}"`);

            const isDeepSeq = turnItem.prompt?.length > 150 || seq.sequenceId?.startsWith("CHAL");
            const effectiveSeqTimeoutMs = isDeepSeq ? Math.max(timeoutMs, 90000) : timeoutMs;

            trace = await executeWsTurn(ws, {
              type: "speech",
              text: turnItem.prompt,
              mode: defaultMode,
              effort: defaultEffort,
              guestId: sessionGuestId,
              persona: "conversational",
              history: sequenceHistory.slice(-8)
            }, effectiveSeqTimeoutMs);

            if (trace.timedOut) totalTimeouts++;
            if (trace.errorEvent) totalErrors++;
            if (!trace.timedOut && !trace.errorEvent && trace.finalAnswer) totalSuccessfulTurns++;

            console.log(`      ⏱️  Elapsed: ${trace.totalElapsedMs}ms | Reply: "${trace.finalAnswer.slice(0, 80)}..."`);

            const turnRecord = {
              runId,
              setId: setItem.setName,
              sequenceId: seq.sequenceId,
              turnNumber: turnItem.turn,
              inputPrompt: turnItem.prompt,
              expectedBehavior: turnItem.expectedBehavior,
              execution: {
                timedOut: trace.timedOut,
                totalElapsedMs: trace.totalElapsedMs,
                finalAnswer: trace.finalAnswer,
                languageChanged: trace.languageChangedEvent,
                toolCalls: trace.toolCalls || [],
                thinkingSteps: trace.thinkingSteps || [],
                error: trace.errorEvent ? trace.errorEvent.message : null,
              },
              timestamp: new Date().toISOString(),
            };

            results.push(turnRecord);
            await jsonlHandle.write(JSON.stringify(turnRecord) + "\n");

            // Append to session history for context preservation
            sequenceHistory.push({ role: "user", text: turnItem.prompt });
            sequenceHistory.push({ role: "assistant", text: trace.finalAnswer });
            await new Promise((r) => setTimeout(r, 200));
          }
        } catch (err) {
          console.error(`   ❌ Sequence Error:`, err.message);
        } finally {
          if (ws) {
            try { ws.close(); } catch (_) {}
          }
        }
      }
    }
  }

  await jsonlHandle.close();

  // Summary JSON
  const summary = {
    runId,
    timestamp: new Date().toISOString(),
    configuration: options,
    stats: {
      totalExecuted: totalQuestionsExecuted,
      successfulTurns: totalSuccessfulTurns,
      timeouts: totalTimeouts,
      errors: totalErrors,
    },
    runJsonlFile: runJsonlPath,
  };

  const summaryPath = path.join(outputDir, `${runId}_summary.json`);
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

  console.log(`\n================================================================================`);
  console.log(`📊 CHATLY BEHAVIOR LAB RUN COMPLETE`);
  console.log(`   Run ID:      ${runId}`);
  console.log(`   Executed:    ${totalQuestionsExecuted}`);
  console.log(`   Successful:  ${totalSuccessfulTurns}`);
  console.log(`   Timeouts:    ${totalTimeouts}`);
  console.log(`   Errors:      ${totalErrors}`);
  console.log(`   Trace File:  ${runJsonlPath}`);
  console.log(`   Summary:     ${summaryPath}`);
  console.log(`================================================================================\n`);

  return { runId, summary, runJsonlPath, summaryPath, results };
}

// CLI Execution entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const getArg = (flag, def) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
  };

  const options = {
    setName: getArg("--set", "all"),
    level: getArg("--level", "all"),
    questionId: getArg("--id", null),
    limit: getArg("--limit", null) ? parseInt(getArg("--limit")) : null,
    timeoutMs: getArg("--timeout", null) ? parseInt(getArg("--timeout")) : 45000,
  };

  runBehaviorLab(options).catch((err) => {
    console.error("FATAL HARNESS ERROR:", err);
    process.exit(1);
  });
}

