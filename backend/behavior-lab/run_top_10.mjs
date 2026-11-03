import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { evaluateResponse } from "./evaluator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../");
const QUESTION_FILE = path.join(ROOT_DIR, "Question.json");
const SSE_URL = "http://localhost:5000/api/voice/stream";

async function executeQuestion(item) {
  const query = item.query || item.prompt;
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);

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
        "x-guest-id": `lab_top10_${item.id}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        text: query,
        message: query,
        mode: "SEARCH",
        effort: item.difficulty === "hard" ? "HIGH" : "MEDIUM",
        persona: "professional",
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

  const toolsUsed = [...new Set(
    thinkingSteps.filter((s) => s.tool).map((s) => s.tool)
  )];

  const baseRecord = {
    id: item.id,
    set: "set_a",
    category: item.category,
    query,
    expected_answer: item.expected_answer || null,
    source_url: item.source_url || null,
    status,
    errorMessage,
    elapsedMs,
    actual_answer: fullText,
    thinkingStepsCount: thinkingSteps.length,
    thinkingSteps,
    toolsUsed,
  };

  const evalResult = evaluateResponse(baseRecord, item);
  return { ...baseRecord, ...evalResult };
}

async function main() {
  const raw = fs.readFileSync(QUESTION_FILE, "utf8");
  const data = JSON.parse(raw);
  const questions = (data.set_a_search_questions || []).slice(0, 10);

  console.log(`Running Top 10 Questions via backend route ${SSE_URL}...\n`);

  const results = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`[${i + 1}/10] Asking ${q.id}: "${q.query}"...`);
    const res = await executeQuestion(q);
    results.push(res);
    console.log(`  -> Status: ${res.taskCompletionStatus} | Latency: ${res.elapsedMs}ms | Steps: ${res.thinkingStepsCount}`);
    console.log(`  -> Answer: ${res.actual_answer.slice(0, 150)}...\n`);
    // 500ms breather
    await new Promise((r) => setTimeout(r, 500));
  }

  // Save results JSON for review
  const outPath = path.join(__dirname, "reports/top_10_recent_answers.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`Saved top 10 results to ${outPath}`);
}

main().catch(console.error);

