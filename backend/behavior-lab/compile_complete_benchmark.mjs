import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { analyzeRun } from "./analyzer.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function compileMasterBenchmark() {
  const runsDir = path.join(__dirname, "runs");
  
  // 1. Base GI run
  const giPath = path.join(runsDir, "RUN-2026-10-31T20-14-22-996Z.jsonl");
  const giLines = (await fs.readFile(giPath, "utf-8")).split("\n").filter(Boolean);
  const giRecords = giLines.map(l => JSON.parse(l));

  // 2. Fixed GI-L1-07 run
  const fixPath = path.join(runsDir, "RUN-2026-11-01T14-54-54-194Z.jsonl");
  let fixedRec = null;
  try {
    const fixLines = (await fs.readFile(fixPath, "utf-8")).split("\n").filter(Boolean);
    fixedRec = fixLines.map(l => JSON.parse(l)).find(r => r.questionId === "GI-L1-07");
  } catch (_) {}

  // 3. Search Mode run
  const smPath = path.join(runsDir, "RUN-2026-11-01T14-55-07-436Z.jsonl");
  let smRecords = [];
  try {
    const smLines = (await fs.readFile(smPath, "utf-8")).split("\n").filter(Boolean);
    smRecords = smLines.map(l => JSON.parse(l));
  } catch (_) {}

  const masterMap = new Map();

  // Add GI isolated & sequences
  for (const r of giRecords) {
    if (r.questionId && r.questionId.startsWith("SM")) continue; // Will take SM from dedicated SM run
    if (r.questionId === "GI-L1-07" && fixedRec) {
      masterMap.set("GI-L1-07", fixedRec);
      continue;
    }
    const key = r.questionId || `${r.sequenceId}_t${r.turnNumber}`;
    masterMap.set(key, r);
  }

  // Add SM records
  for (const r of smRecords) {
    if (r.questionId) {
      masterMap.set(r.questionId, r);
    }
  }

  const masterList = Array.from(masterMap.values());
  console.log(`📊 Master benchmark contains ${masterList.length} unique execution records.`);
  
  const masterPath = path.join(runsDir, "RUN-COMPREHENSIVE-MASTER.jsonl");
  await fs.writeFile(masterPath, masterList.map(r => JSON.stringify(r)).join("\n") + "\n", "utf-8");

  const analysis = await analyzeRun(masterPath);
  console.log(`\n🎉 Comprehensive Master Analysis Generated!`);
  console.log(`   Total Evaluated: ${analysis.totalRecords}`);
  console.log(`   Identified Issues: ${analysis.findings.length}`);
  console.log(`   Report Path: ${analysis.latestReportPath}`);

  return { masterList, analysis };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  compileMasterBenchmark().catch(console.error);
}

