import { runBehaviorLab } from "./harness.mjs";
import { analyzeRun } from "./analyzer.mjs";
import path from "path";

async function main() {
  console.log("🚀 Launching Full Behavior Lab Evaluation Suite (113 cases across 12 categories)...");
  const summary = await runBehaviorLab({ setName: "all", timeoutMs: 45000 });
  console.log("\n📊 Evaluation Run Complete:", summary.runId);
  console.log(`   Total Turns: ${summary.totalTurns} | Successful: ${summary.successfulTurns} | Timeouts: ${summary.timeouts} | Errors: ${summary.errors}`);
  
  console.log("\n🔍 Running Behavioral Trace Analyzer...");
  const analysis = await analyzeRun(summary.traceFile);
  console.log(`\n🎉 Full Evaluation Completed!`);
  console.log(`   Report written to: ${analysis.latestReportPath}`);
  console.log(`   Identified Issues: ${analysis.findings.length}`);
}

main().catch(err => {
  console.error("Fatal error during full evaluation:", err);
  process.exit(1);
});

