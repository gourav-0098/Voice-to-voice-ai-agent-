/**
 * Chatly Behavior Lab — Staged Regression Test Runner
 * 
 * Runs targeted stages to verify Set C audit fixes:
 *   Stage A: Webpage extraction & cumulative evidence (C023, C030, C040, C047, C022, C036, C048)
 *   Stage B: Requested-fact gate validation (C006, C008, C042, C043)
 *   Stage C: Temporal accuracy & query planner (C001, C002, C014, C025, C027, C042, C043)
 *   Stage D: Output cleanup & conversational routing (C029, C034, C049, C_CONV)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { evaluateResponse } from "./evaluator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUESTION_FILE = path.join(__dirname, "questions/set_c_questions.json");
const SSE_URL = process.env.CHATLY_SSE_URL || "http://localhost:5000/api/voice/stream";

const STAGES = {
  stage_a: ["C023", "C030", "C040", "C047", "C022", "C036", "C048"],
  stage_b: ["C006", "C008", "C042", "C043"],
  stage_c: ["C001", "C002", "C014", "C025", "C027", "C042", "C043"],
  stage_d: ["C029", "C034", "C049"],
};

async function executeSingleQuery(item, timeoutMs = 85000) {
  const query = item.query || item.prompt;
  const mode = item.mode || "SEARCH";
  const effort = item.difficulty === "hard" ? "HIGH" : (item.difficulty === "medium" ? "MEDIUM" : "LOW");

  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const thinkingSteps = [];
  let fullText = "";
  let doneData = null;
  let status = "SUCCESS";
  let errorMessage = null;

  try {
    const res = await fetch(SSE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-behavior-lab": "true",
        "x-guest-id": `lab_staged_${item.id}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        text: query,
        message: query,
        mode,
        effort,
        persona: "professional",
        voiceModel: "aura-asteria-en",
        skipAudio: true,
        textOnly: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const events = sseBuffer.split("\n\n");
      sseBuffer = events.pop() || "";

      for (const ev of events) {
        const lines = ev.split("\n");
        let eventType = "message";
        let dataStr = "";
        for (const line of lines) {
          if (line.startsWith("event:")) eventType = line.slice(6).trim();
          if (line.startsWith("data:")) dataStr = line.slice(5).trim();
        }

        if (dataStr) {
          try {
            const data = JSON.parse(dataStr);
            if (eventType === "thinking_step") {
              thinkingSteps.push(data);
            } else if (eventType === "token" && data.token) {
              fullText += data.token;
            } else if (eventType === "done") {
              doneData = data;
              if (data.reply && !fullText) fullText = data.reply;
              if (Array.isArray(data.thinkingSteps) && thinkingSteps.length === 0) {
                thinkingSteps.push(...data.thinkingSteps);
              }
            }
          } catch (_) {}
        }
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      status = "TIMEOUT";
      errorMessage = `Request timed out after ${timeoutMs}ms`;
    } else {
      status = "ERROR";
      errorMessage = err.message;
    }
  } finally {
    clearTimeout(timer);
  }

  const elapsedMs = Date.now() - t0;
  fullText = fullText.trim();

  const toolsUsed = [...new Set(
    thinkingSteps.filter((s) => s.tool).map((s) => s.tool)
  )];
  const citations = doneData?.citations || [];

  const baseRecord = {
    id: item.id,
    set: "set_c",
    category: item.category || "test",
    query,
    expected_answer: item.expected_answer || null,
    source_url: item.source_url || null,
    difficulty: item.difficulty || "medium",
    mode,
    effort,
    status,
    errorMessage,
    elapsedMs,
    actual_answer: fullText,
    thinkingStepsCount: thinkingSteps.length,
    thinkingSteps,
    toolsUsed,
    citations,
  };

  const evalResult = evaluateResponse(baseRecord, item);
  return { ...baseRecord, ...evalResult };
}

async function runStage(stageName) {
  const allQuestions = JSON.parse(fs.readFileSync(QUESTION_FILE, "utf8")).questions;
  const targetIds = STAGES[stageName] || [];

  console.log(`\n================================================================================`);
  console.log(`🎯 RUNNING STAGED TEST: ${stageName.toUpperCase()} (${targetIds.length} Questions)`);
  console.log(`================================================================================`);

  const results = [];
  for (const id of targetIds) {
    const q = allQuestions.find((item) => item.id === id);
    if (!q) {
      console.warn(`Question ID ${id} not found in questions dataset`);
      continue;
    }

    process.stdout.write(`⏳ [${id}] "${q.query.slice(0, 50)}..." `);
    const res = await executeSingleQuery(q);
    results.push(res);

    const status = res.taskCompletionStatus;
    const icon = status === "CLEAN_PASS" ? "✅" : (status === "PARTIAL_PASS" ? "⚠️" : "❌");
    console.log(`${icon} ${status} (${res.elapsedMs}ms, ${res.thinkingStepsCount} steps) Score: ${res.score}`);
    console.log(`   Answer: ${res.actual_answer.slice(0, 160).replace(/\n/g, " ")}...`);
    if (res.evaluatorNotes?.length) {
      console.log(`   Notes: ${res.evaluatorNotes.join("; ")}`);
    }
  }

  const cleanPass = results.filter((r) => r.taskCompletionStatus === "CLEAN_PASS").length;
  const partialPass = results.filter((r) => r.taskCompletionStatus === "PARTIAL_PASS").length;
  const fail = results.filter((r) => r.taskCompletionStatus === "HARD_FAILURE" || r.taskCompletionStatus === "CRASH").length;
  console.log(`\n📊 ${stageName.toUpperCase()} SUMMARY: Clean: ${cleanPass} | Partial: ${partialPass} | Fail: ${fail} / ${results.length}`);
  return results;
}

// Special conversational test
async function runConversationalTest() {
  console.log(`\n================================================================================`);
  console.log(`🎯 RUNNING CONVERSATIONAL ROUTING TEST ("or kya hal h")`);
  console.log(`================================================================================`);
  const res = await executeSingleQuery({
    id: "C_CONV_1",
    query: "or kya hal h",
    expected_answer: "conversational greeting reply",
    mode: "SEARCH",
    difficulty: "easy",
  });

  const tools = res.toolsUsed;
  const passed = tools.length === 0 && res.actual_answer.length > 5;
  console.log(`${passed ? "✅" : "❌"} Conversational Routing Result (${res.elapsedMs}ms, ${res.thinkingStepsCount} steps, tools: [${tools.join(", ")}])`);
  console.log(`   Answer: "${res.actual_answer}"`);
  return passed;
}

async function main() {
  const arg = process.argv[2] || "all";
  if (arg === "all" || arg === "stage_a") await runStage("stage_a");
  if (arg === "all" || arg === "stage_b") await runStage("stage_b");
  if (arg === "all" || arg === "stage_c") await runStage("stage_c");
  if (arg === "all" || arg === "stage_d") {
    await runStage("stage_d");
    await runConversationalTest();
  }
  if (arg === "conv") await runConversationalTest();
}

main().catch(console.error);
