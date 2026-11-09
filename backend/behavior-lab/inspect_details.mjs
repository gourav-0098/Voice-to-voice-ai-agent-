import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { evaluateResponse } from "./evaluator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUESTION_FILE = path.join(__dirname, "questions/set_c_questions.json");
const SSE_URL = process.env.CHATLY_SSE_URL || "http://localhost:5000/api/voice/stream";

export async function runInspection(targetId) {
  const allQuestions = JSON.parse(fs.readFileSync(QUESTION_FILE, "utf8")).questions;
  const q = allQuestions.find((x) => x.id === targetId);
  if (!q) {
    console.error(`Question ${targetId} not found`);
    return;
  }

  console.log(`\n================================================================================`);
  console.log(`🔍 DETAILED INSPECTION: [${q.id}]`);
  console.log(`Query:    "${q.query}"`);
  console.log(`Expected: "${q.expected_answer}"`);
  console.log(`Source:   ${q.source_url}`);
  console.log(`================================================================================\n`);

  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 85000);

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
        "x-guest-id": `inspect_${targetId}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        text: q.query,
        message: q.query,
        mode: "SEARCH",
        effort: q.difficulty === "hard" ? "HIGH" : (q.difficulty === "medium" ? "MEDIUM" : "LOW"),
        persona: "professional",
        voiceModel: "aura-asteria-en",
        skipAudio: true,
        textOnly: true,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

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
    status = err.name === "AbortError" ? "TIMEOUT" : "ERROR";
    errorMessage = err.message;
  } finally {
    clearTimeout(timer);
  }

  const elapsedMs = Date.now() - t0;
  fullText = fullText.trim();

  const executedQueries = thinkingSteps
    .filter((s) => s.tool === "web_search" && s.args?.query)
    .map((s) => s.args.query);

  const toolsUsed = [...new Set(thinkingSteps.filter((s) => s.tool).map((s) => s.tool))];
  const observations = thinkingSteps
    .filter((s) => s.phase === "TOOL_OBSERVATION")
    .map((s) => ({ tool: s.tool, observation: s.observation }));

  const baseRecord = {
    id: q.id,
    set: "set_c",
    category: q.category,
    query: q.query,
    expected_answer: q.expected_answer,
    source_url: q.source_url,
    difficulty: q.difficulty,
    mode: "SEARCH",
    effort: q.difficulty === "hard" ? "HIGH" : (q.difficulty === "medium" ? "MEDIUM" : "LOW"),
    status,
    errorMessage,
    elapsedMs,
    actual_answer: fullText,
    thinkingStepsCount: thinkingSteps.length,
    thinkingSteps,
    toolsUsed,
    citations: doneData?.citations || [],
  };

  const evalResult = evaluateResponse(baseRecord, q);

  console.log(`⏱️ Duration: ${elapsedMs}ms | Thinking Steps: ${thinkingSteps.length} | Status: ${evalResult.taskCompletionStatus} (Score: ${evalResult.score})`);
  console.log(`\n🛠️ Tools Used:`, toolsUsed);
  console.log(`\n🔎 Executed Search Queries (${executedQueries.length}):`);
  executedQueries.forEach((uq, i) => console.log(`   ${i + 1}. "${uq}"`));

  console.log(`\n📋 Tool Observations (${observations.length}):`);
  observations.forEach((obs, i) => console.log(`   [Obs ${i + 1}] (${obs.tool}): ${obs.observation?.slice(0, 150)}...`));

  console.log(`\n📚 Citations (${doneData?.citations?.length || 0}):`);
  (doneData?.citations || []).slice(0, 5).forEach((c, i) => console.log(`   ${i + 1}. ${c.title || c.publisher} (${c.url})`));

  console.log(`\n🗣️ Final Spoken Answer:\n${fullText}\n`);
  console.log(`📝 Evaluator Notes:`, evalResult.evaluatorNotes);

  return {
    baseRecord,
    evalResult,
    executedQueries,
    observations,
    doneData,
  };
}

if (process.argv[2]) {
  runInspection(process.argv[2]).catch(console.error);
}

