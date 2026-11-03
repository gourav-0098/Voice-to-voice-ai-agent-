/**
 * Chatly Behavior Lab — Question.json Comprehensive Benchmark Runner
 *
 * Runs all 200 test questions from Question.json:
 *  - Set A: 100 Search retrieval, freshness-sensitive, single-fact questions
 *  - Set B: 100 Complex prompts stressing orchestration, chaining, and reasoning
 *
 * Streams each request to the Chatly backend SSE endpoint (/api/voice/stream),
 * captures every thinking step (phase, thoughts, tools called, observations),
 * records the full generated text answer, and writes:
 *  1. JSONL log: backend/behavior-lab/runs/question_json_run_<timestamp>.jsonl
 *  2. Markdown log: backend/behavior-lab/reports/question_json_answers_and_thinking_log.md
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { evaluateResponse } from "./evaluator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../");
const QUESTION_FILE = path.join(ROOT_DIR, "Question.json");
const RUNS_DIR = path.join(__dirname, "runs");
const REPORTS_DIR = path.join(__dirname, "reports");

const SSE_URL = process.env.CHATLY_SSE_URL || "http://localhost:5000/api/voice/stream";

// Ensure output dirs exist
if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR, { recursive: true });
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const JSONL_LOG_PATH = path.join(RUNS_DIR, `question_json_run_${timestamp}.jsonl`);
const MD_LOG_PATH = path.join(REPORTS_DIR, `question_json_answers_and_thinking_log.md`);

// Write initial Markdown header
const mdHeader = `# Chatly Intelligence Evaluation: Question.json Benchmark
**Timestamp:** ${new Date().toISOString()}  
**Target Server:** ${SSE_URL}  
**Source Dataset:** \`Question.json\` (200 questions across Set A and Set B)  
**Mode:** Pure Text-to-Text with Full Cognitive Thinking Logs  

---

## Evaluation Progress & Results Log

`;
fs.writeFileSync(MD_LOG_PATH, mdHeader, "utf8");

/**
 * Executes a single question via SSE stream, capturing thinking steps and tokens.
 */
async function executeQuestion(item, setType, timeoutMs = 85000) {
  const query = item.query || item.prompt;
  const isSetA = setType === "set_a";
  
  // Configure execution mode
  const mode = (isSetA || item.should_search !== false) ? "SEARCH" : "FAST";
  const effort = isSetA ? (item.difficulty === "hard" ? "HIGH" : "MEDIUM") : "HIGH";

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
        "x-guest-id": `lab_q_${item.id}`,
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
              if (data.reply && !fullText) {
                fullText = data.reply;
              }
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

  // Extract tools used from thinking steps
  const toolsUsed = [...new Set(
    thinkingSteps
      .filter((s) => s.tool)
      .map((s) => s.tool)
  )];

  const citations = doneData?.citations || [];

  const baseRecord = {
    id: item.id,
    set: setType,
    category: item.category,
    query,
    expected_answer: item.expected_answer || null,
    source_url: item.source_url || null,
    tests: item.tests || null,
    failure_to_watch: item.failure_to_watch || null,
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

  return {
    ...baseRecord,
    ...evalResult,
  };
}

/**
 * Appends a record to both JSONL and Markdown log files.
 */
function logResult(record, index, total) {
  // 1. Append JSONL
  fs.appendFileSync(JSONL_LOG_PATH, JSON.stringify(record) + "\n", "utf8");

  // 2. Append Markdown Section
  const thinkingDetails = record.thinkingSteps.length > 0
    ? `<details>
<summary><b>View Thinking Steps (${record.thinkingStepsCount} steps)</b></summary>

| Step | Phase | Details |
|------|-------|---------|
` + record.thinkingSteps.map((s, idx) => {
      const phase = s.phase || s.title || "REASONING";
      const desc = s.thought || (s.tool ? `Tool \`${s.tool}\` called` : "") || s.observation || s.title || "";
      const cleanDesc = String(desc).replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 300);
      return `| ${idx + 1} | \`${phase}\` | ${cleanDesc} |`;
    }).join("\n") + `\n</details>`
    : `*No thinking steps recorded.*`;

  const mdSection = `
### [${index}/${total}] ${record.id} — ${record.category.toUpperCase()} (${record.set.toUpperCase()})
- **Query:** \`${record.query}\`
- **Result:** \`${record.taskCompletionStatus}\` (Semantic: \`${record.semanticStatus}\`, Transport: \`${record.transportStatus}\`)
- **Latency:** \`${record.elapsedMs}ms\` | **Mode:** \`${record.mode}\` | **Effort:** \`${record.effort}\`
- **Tools Used:** ${record.toolsUsed.length > 0 ? record.toolsUsed.map(t => `\`${t}\``).join(", ") : "None"}
- **Evaluator Notes:** ${record.evaluatorNotes && record.evaluatorNotes.length > 0 ? record.evaluatorNotes.join("; ") : "Clean"}
${record.expected_answer ? `- **Expected Answer:** *${record.expected_answer}*\n` : ""}
${record.failure_to_watch ? `- **Watch Out For:** *${record.failure_to_watch}*\n` : ""}
${record.source_url ? `- **Source / Reference:** [${record.source_url}](${record.source_url})\n` : ""}

**Chatly Answer:**
${record.actual_answer ? record.actual_answer : `*(No answer produced - ${record.errorMessage || record.status})*`}

${thinkingDetails}

---
`;

  fs.appendFileSync(MD_LOG_PATH, mdSection, "utf8");
}

${thinkingDetails}

---
`;

  fs.appendFileSync(MD_LOG_PATH, mdSection, "utf8");
}

async function main() {
  console.log("================================================================================");
  console.log("🚀 CHATLY BENCHMARK RUNNER: Question.json (200 Questions)");
  console.log(`   JSONL Log: ${JSONL_LOG_PATH}`);
  console.log(`   Markdown Log: ${MD_LOG_PATH}`);
  console.log("================================================================================\n");

  const raw = fs.readFileSync(QUESTION_FILE, "utf8");
  const data = JSON.parse(raw);

  const setA = (data.set_a_search_questions || []).map((q) => ({ ...q, _setType: "set_a" }));
  const setB = (data.set_b_complex_prompts || []).map((q) => ({ ...q, _setType: "set_b" }));

  const allQuestions = [...setA, ...setB];
  const total = allQuestions.length;
  console.log(`Found ${setA.length} Set A questions and ${setB.length} Set B questions. Total: ${total}`);

  let cleanPassCount = 0;
  let partialPassCount = 0;
  let hardFailureCount = 0;
  let timeoutCount = 0;
  let errorCount = 0;
  let completedCount = 0;

  // Controlled concurrency queue (Concurrency = 2 for rock-solid stability)
  const CONCURRENCY = 2;
  let cursor = 0;

  async function worker(workerId) {
    while (cursor < total) {
      const idx = cursor++;
      const item = allQuestions[idx];
      const qNum = idx + 1;

      console.log(`[Worker ${workerId}] [${qNum}/${total}] Starting ${item.id} (${item.category}): "${(item.query || item.prompt).slice(0, 50)}..."`);
      
      try {
        const record = await executeQuestion(item, item._setType);
        completedCount++;

        if (record.taskCompletionStatus === "CLEAN_PASS") cleanPassCount++;
        else if (record.taskCompletionStatus === "PARTIAL_PASS") partialPassCount++;
        else hardFailureCount++;

        if (record.transportStatus === "TIMEOUT") timeoutCount++;
        else if (record.transportStatus === "HTTP_ERROR") errorCount++;

        logResult(record, qNum, total);

        console.log(`[Worker ${workerId}] [${qNum}/${total}] Finished ${item.id} in ${record.elapsedMs}ms | Result: ${record.taskCompletionStatus} | Steps: ${record.thinkingStepsCount} | Ans Len: ${record.actual_answer.length}`);
      } catch (err) {
        console.error(`[Worker ${workerId}] [${qNum}/${total}] Unhandled error on ${item.id}:`, err.message);
      }

      // Small 500ms jitter between questions to ensure clean socket flushing
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  // Write summary section to Markdown report
  const summarySection = `
## Final Benchmark Execution Summary
- **Total Questions:** ${total}
- **Clean Passes:** ${cleanPassCount} (${((cleanPassCount / total) * 100).toFixed(1)}%)
- **Partial Passes:** ${partialPassCount} (${((partialPassCount / total) * 100).toFixed(1)}%)
- **Hard Failures:** ${hardFailureCount} (${((hardFailureCount / total) * 100).toFixed(1)}%)
- **Transport Timeouts:** ${timeoutCount}
- **Transport Errors:** ${errorCount}
- **Artifacts:**
  - JSONL Raw Logs: \`${JSONL_LOG_PATH}\`
  - Markdown Detailed Report: \`${MD_LOG_PATH}\`
`;
  fs.appendFileSync(MD_LOG_PATH, summarySection, "utf8");

  console.log("\n================================================================================");
  console.log("🏁 BENCHMARK RUN COMPLETE!");
  console.log(`   Clean Pass: ${cleanPassCount}/${total} | Partial: ${partialPassCount} | Hard Failure: ${hardFailureCount} | Timeouts: ${timeoutCount} | Errors: ${errorCount}`);
  console.log(`   JSONL Log: ${JSONL_LOG_PATH}`);
  console.log(`   Markdown Log: ${MD_LOG_PATH}`);
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Fatal benchmark runner failure:", err);
  process.exit(1);
});

