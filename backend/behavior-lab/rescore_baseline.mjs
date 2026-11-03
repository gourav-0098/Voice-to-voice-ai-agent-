/**
 * Rescores the baseline run (question_json_run_2026-11-01T16-20-33-294Z.jsonl)
 * against Question.json using the upgraded Semantic Evaluator.
 * 
 * DOES NOT MODIFY OR OVERWRITE THE ORIGINAL RAW LOG FILE.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { evaluateResponse } from "./evaluator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../");
const QUESTION_FILE = path.join(ROOT_DIR, "Question.json");
const BASELINE_LOG_FILE = path.join(__dirname, "runs/question_json_run_2026-11-01T16-20-33-294Z.jsonl");
const RESCORE_OUTPUT_FILE = path.join(__dirname, "reports/baseline_rescored_ledger.json");

function main() {
  console.log("================================================================================");
  console.log("📊 RESCORING BASELINE EXECUTION RUN (200 Questions)");
  console.log(`   Baseline Raw Log: ${BASELINE_LOG_FILE}`);
  console.log(`   Output Ledger:    ${RESCORE_OUTPUT_FILE}`);
  console.log("================================================================================\n");

  const questionData = JSON.parse(fs.readFileSync(QUESTION_FILE, "utf8"));
  const setA = (questionData.set_a_search_questions || []).map(q => ({ ...q, _setType: "set_a" }));
  const setB = (questionData.set_b_complex_prompts || []).map(q => ({ ...q, _setType: "set_b" }));
  const allQuestions = [...setA, ...setB];
  const questionMap = new Map(allQuestions.map(q => [q.id, q]));

  // Read the 192 executed records from raw log
  const logLines = fs.readFileSync(BASELINE_LOG_FILE, "utf8").trim().split("\n");
  const executedRecords = logLines.map(line => JSON.parse(line));
  const recordMap = new Map(executedRecords.map(r => [r.id, r]));

  console.log(`Loaded ${allQuestions.length} benchmark questions.`);
  console.log(`Loaded ${executedRecords.length} executed records from baseline raw log.`);

  const rescoredLedger = [];
  const stats = {
    total: allQuestions.length,
    executed: 0,
    unexecuted: 0,
    cleanPass: 0,
    partialPass: 0,
    hardFailure: 0,
    bySet: {
      set_a: { cleanPass: 0, partialPass: 0, hardFailure: 0, unexecuted: 0 },
      set_b: { cleanPass: 0, partialPass: 0, hardFailure: 0, unexecuted: 0 },
    },
    failureTypes: {
      fastPathHijack: 0,
      hinglishAbort: 0,
      searchFailureAbort: 0,
      contextPoisoning: 0,
      factualMismatch: 0,
    }
  };

  for (const q of allQuestions) {
    const setKey = q._setType;
    const record = recordMap.get(q.id);

    if (!record) {
      // Unexecuted question (e.g. B093-B100)
      stats.unexecuted++;
      stats.bySet[setKey].unexecuted++;
      rescoredLedger.push({
        id: q.id,
        set: setKey,
        category: q.category,
        query: q.query || q.prompt,
        transportStatus: "NOT_RUN",
        executionStatus: "NOT_RUN",
        semanticStatus: "NOT_RUN",
        taskCompletionStatus: "UNEXECUTED",
        score: 0.0,
        evaluatorNotes: ["Benchmark terminated early; question was never dispatched to server"],
      });
      continue;
    }

    stats.executed++;
    const evalResult = evaluateResponse(record, q);

    if (evalResult.taskCompletionStatus === "CLEAN_PASS") {
      stats.cleanPass++;
      stats.bySet[setKey].cleanPass++;
    } else if (evalResult.taskCompletionStatus === "PARTIAL_PASS") {
      stats.partialPass++;
      stats.bySet[setKey].partialPass++;
    } else {
      stats.hardFailure++;
      stats.bySet[setKey].hardFailure++;

      // Track root failure category
      const notesStr = evalResult.evaluatorNotes.join(" ");
      if (notesStr.includes("Fast-path hijacked")) stats.failureTypes.fastPathHijack++;
      else if (notesStr.includes("Hinglish clarification")) stats.failureTypes.hinglishAbort++;
      else if (notesStr.includes("Context Poisoning")) stats.failureTypes.contextPoisoning++;
      else if (notesStr.includes("Search retrieval failure")) stats.failureTypes.searchFailureAbort++;
      else stats.failureTypes.factualMismatch++;
    }

    rescoredLedger.push({
      id: q.id,
      set: setKey,
      category: q.category,
      query: q.query || q.prompt,
      actual_answer: record.actual_answer,
      elapsedMs: record.elapsedMs,
      toolsUsed: record.toolsUsed,
      thinkingStepsCount: record.thinkingStepsCount,
      ...evalResult,
    });
  }

  // Write ledger output file
  fs.writeFileSync(RESCORE_OUTPUT_FILE, JSON.stringify({ stats, ledger: rescoredLedger }, null, 2), "utf8");

  console.log("\n================================================================================");
  console.log("🏁 BASELINE RESCORING RESULTS");
  console.log("================================================================================");
  console.log(`Total Questions:       ${stats.total}`);
  console.log(`Executed:              ${stats.executed}`);
  console.log(`Unexecuted:            ${stats.unexecuted} (B093 - B100)`);
  console.log("--------------------------------------------------------------------------------");
  console.log(`Clean Passes:          ${stats.cleanPass} (${((stats.cleanPass / stats.total) * 100).toFixed(1)}% of total / ${((stats.cleanPass / stats.executed) * 100).toFixed(1)}% of executed)`);
  console.log(`Partial Passes:        ${stats.partialPass} (${((stats.partialPass / stats.total) * 100).toFixed(1)}% of total)`);
  console.log(`Hard Failures:         ${stats.hardFailure} (${((stats.hardFailure / stats.total) * 100).toFixed(1)}% of total)`);
  console.log("--------------------------------------------------------------------------------");
  console.log("Set Breakdown:");
  console.log(`  Set A (Search Factoids, 100 Qs):`);
  console.log(`    Clean Pass:    ${stats.bySet.set_a.cleanPass}`);
  console.log(`    Partial Pass:  ${stats.bySet.set_a.partialPass}`);
  console.log(`    Hard Failure:  ${stats.bySet.set_a.hardFailure}`);
  console.log(`  Set B (Complex Orchestration, 100 Qs):`);
  console.log(`    Clean Pass:    ${stats.bySet.set_b.cleanPass}`);
  console.log(`    Partial Pass:  ${stats.bySet.set_b.partialPass}`);
  console.log(`    Hard Failure:  ${stats.bySet.set_b.hardFailure}`);
  console.log(`    Unexecuted:    ${stats.bySet.set_b.unexecuted}`);
  console.log("--------------------------------------------------------------------------------");
  console.log("Identified Root Failure Breakdown in Hard Failures:");
  console.log(`  Context Poisoning (Snowflake/Providence anchor recovery): ${stats.failureTypes.contextPoisoning}`);
  console.log(`  Fast-Path Hijacking (B001, B005, B007, B022, etc.):       ${stats.failureTypes.fastPathHijack}`);
  console.log(`  Hinglish Clarification Aborts:                             ${stats.failureTypes.hinglishAbort}`);
  console.log(`  Search Retrieval Failures:                                 ${stats.failureTypes.searchFailureAbort}`);
  console.log(`  Factual / Completeness Mismatches:                         ${stats.failureTypes.factualMismatch}`);
  console.log("================================================================================\n");
}

main();

