# Chatly Behavior Lab

A reusable, empirical question-and-observation lab for observing, benchmarking, and diagnosing **Chatly's** real-time voice-to-voice and factual research behavior across increasing difficulty levels (Level 1 Easy to Level 5 MAX).

---

## 📁 Architecture & File Layout

```
backend/behavior-lab/
├── questions/
│   ├── general_intelligence.json   # 5 Difficulty levels + multi-turn conversational sequences
│   └── search_mode.json            # 5 Difficulty levels of real-time search & factual research
├── reference/
│   └── current_facts.json          # Independently verified primary source facts (Oct 2026 anchor)
├── runs/                           # Timestamped JSONL execution traces and summary files
├── reports/
│   └── latest-report.md            # Auto-generated markdown analysis report
├── harness.mjs                     # Test execution harness communicating over live WebSocket/HTTP
├── analyzer.mjs                    # Automated trace auditor & markdown report generator
└── README.md                       # Documentation & instructions
```

---

## 🚀 Running the Behavior Lab

Make sure the Chatly backend is running on `http://localhost:5000` (`ws://localhost:5000/ws/voice`).

### 1. Run Initial Modest Verification Batch
To verify that the harness connects and captures real live responses before running full sets:
```bash
node backend/behavior-lab/harness.mjs --set general --limit 3
```

### 2. Run General Intelligence Benchmark
Runs all Level 1 to Level 5 questions and multi-turn sequences:
```bash
node backend/behavior-lab/harness.mjs --set general
```

### 3. Run Search Mode & Research Benchmark
Runs all Level 1 to Level 5 search questions through the live autonomous research pipeline:
```bash
node backend/behavior-lab/harness.mjs --set search
```

### 4. Run Both Sets (Comprehensive Lab Run)
```bash
node backend/behavior-lab/harness.mjs --set all
```

### 5. Targeted Reruns
Run a specific difficulty level:
```bash
node backend/behavior-lab/harness.mjs --set search --level 1
node backend/behavior-lab/harness.mjs --set general --level 5
```

Run a specific question by ID:
```bash
node backend/behavior-lab/harness.mjs --id SM-L1-01
```

---

## 🔍 Generating Analysis Reports

After a run completes, analyze its execution trace against the primary ground-truth reference:
```bash
node backend/behavior-lab/analyzer.mjs backend/behavior-lab/runs/<RUN_ID>.jsonl
```

This updates `backend/behavior-lab/reports/latest-report.md` and generates an archived timestamped report `backend/behavior-lab/reports/report_<RUN_ID>.md`.

---

## 📊 What the Harness Captures

For every single question, the harness captures:
* **Execution Timing**: TTFT (`firstTokenMs`), TTFA (`firstAudioMs`), and `totalElapsedMs`.
* **Routing & Decisions**: Intent classification, mode (`FAST` vs `SEARCH`), and effort.
* **Tool Activity**: Number of tools invoked, exact tool names, arguments (with credentials redacted), and observations.
* **Search Provenance**: Subtopic generation, retrieved URLs, publisher names, and publication dates.
* **Evidence Validation**: Evidence Gate verdicts, missing dimension checks, and factual confidence.
* **Spoken Output**: Final sanitized speech delivered to the user.
* **Multi-Turn Session State**: Language preference persistence (`language_changed` events) and active topic continuity across conversational challenges.

