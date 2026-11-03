/**
 * Chatly Behavior Lab — Pure Text-to-Text Evaluation Suite
 * backend/behavior-lab/text_evaluation.mjs
 *
 * Tests Chatly strictly as an intelligent text-based AI assistant.
 * Evaluates output-length scaling, depth, complete multi-file coding,
 * research reports, comparative analysis, and multi-turn state retention.
 *
 * Zero voice, zero audio, zero TTS.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SSE_URL = process.env.CHATLY_SSE_URL || "http://localhost:5000/api/voice/stream";
const API_URL = process.env.CHATLY_API_URL || "http://localhost:5000/api/voice";

/**
 * Sends a text prompt to the Chatly SSE streaming endpoint and accumulates the full text response.
 */
async function sendTextPrompt(payload, timeoutMs = 90000) {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const result = {
    fullText: "",
    model: null,
    provider: null,
    mode: payload.mode || "FAST",
    effort: payload.effort || "MEDIUM",
    thinkingStepsCount: 0,
    citationsCount: 0,
    elapsedMs: 0,
    timedOut: false,
    error: null,
  };

  try {
    const res = await fetch(SSE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-behavior-lab": "true",
        "x-guest-id": "lab_text_eval",
      },
      signal: controller.signal,
      body: JSON.stringify({
        text: payload.prompt,
        message: payload.prompt,
        history: payload.history || [],
        mode: payload.mode || "FAST",
        effort: payload.effort || "MEDIUM",
        thinkingMode: payload.mode === "SEARCH",
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
            if (eventType === "token" && data.token) {
              result.fullText += data.token;
            } else if (eventType === "thinking_step") {
              result.thinkingStepsCount++;
            } else if (eventType === "done") {
              if (data.reply && !result.fullText) {
                result.fullText = data.reply;
              }
              if (data.citations) {
                result.citationsCount = data.citations.length;
              }
            }
          } catch (_) {}
        }
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      result.timedOut = true;
    } else {
      result.error = err.message;
    }
  } finally {
    clearTimeout(timer);
    result.elapsedMs = Date.now() - t0;
  }

  // Fallback to non-streaming if stream yielded no tokens
  if (!result.fullText.trim() && !result.timedOut) {
    try {
      const fbRes = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-behavior-lab": "true",
          "x-guest-id": "lab_text_eval",
        },
        body: JSON.stringify({
          text: payload.prompt,
          history: payload.history || [],
          mode: payload.mode || "FAST",
          effort: payload.effort || "MEDIUM",
        }),
      });
      if (fbRes.ok) {
        const fbData = await fbRes.json();
        result.fullText = fbData.reply || fbData.text || "";
        result.model = fbData.model;
        result.provider = fbData.provider;
      }
    } catch (_) {}
  }

  return result;
}

/**
 * Evaluates whether text exhibits truncation signs
 */
function detectTruncation(text) {
  if (!text || text.length < 50) return false;
  const trimmed = text.trim();

  // 1. Unclosed code block
  const codeFences = (trimmed.match(/```/g) || []).length;
  if (codeFences % 2 !== 0) return true;

  // 2. Ends abruptly without sentence punctuation or closed code/list
  const lastChar = trimmed.slice(-1);
  const validPunctuation = [".", "!", "?", "}", ")", ">", "`", '"', "'"];
  if (!validPunctuation.includes(lastChar) && !trimmed.endsWith("```")) {
    // Check if ends with dangling conjunction or comma
    if (/[,;:\-]\s*$/.test(trimmed) || /\b(?:and|or|but|the|a|an|with|to|in|of)\s*$/i.test(trimmed)) {
      return true;
    }
  }

  return false;
}

export async function runTextEvaluation() {
  console.log("================================================================================");
  console.log("📝 STARTING CHATLY PURE TEXT-TO-TEXT EVALUATION SUITE");
  console.log(`   Target Server: ${SSE_URL}`);
  console.log("   Evaluation Focus: Pure Text Depth, Code Fidelity, Reports & Multi-Turn Retention");
  console.log("================================================================================\n");

  const testCases = [
    {
      id: "TXT-01",
      category: "simple_factual",
      name: "Simple Factual Answer",
      mode: "FAST",
      effort: "LOW",
      expectedLength: "Concise (20–60 words, 1–3 sentences)",
      prompt: "What is the capital of France and what is its official currency?",
    },
    {
      id: "TXT-02",
      category: "detailed_explanation",
      name: "Detailed Technical Explanation",
      mode: "FAST",
      effort: "MEDIUM",
      expectedLength: "Detailed (300–600 words)",
      prompt: "Explain how public-key cryptography works using RSA as an example. Cover key generation (primes p and q, Euler totient, modular inverse), encryption, decryption, and the mathematical hardness assumption (factoring product of large primes). Use clear formatting with markdown.",
    },
    {
      id: "TXT-03",
      category: "research_report_1000w",
      name: "1,000-Word In-Depth Research Report",
      mode: "SEARCH",
      effort: "HIGH",
      expectedLength: "Exhaustive Report (800–1,200 words)",
      prompt: "Write a comprehensive 1,000-word research report on the current state of India's commercial semiconductor ecosystem in late-2026. Explicitly cover: 1) Approved fab projects (Tata Electronics in Dholera, Micron in Sanand, CG Power in Sanand); 2) Central government financial outlay and subsidy allocations under the India Semiconductor Mission (ISM); 3) Supply chain, clean room infrastructure, and chemical supply dependencies; 4) Engineering workforce development and talent initiatives; and 5) Global positioning and geopolitical risks. Use clean section headings, bullet points, and source citations.",
    },
    {
      id: "TXT-04",
      category: "technical_report_2000w",
      name: "2,000-Word Technical Architecture Specification",
      mode: "FAST",
      effort: "MAX",
      expectedLength: "Deep Technical Treatise (1,500–2,500 words)",
      prompt: "Author an exhaustive 2,000-word technical architecture report specifying a production distributed stream processing engine. Detail: 1) Consensus & Cluster Membership (Raft protocol vs Gossip, leader election, heartbeats); 2) Ingestion & Backpressure Mechanisms (reactive streams, sliding window buffers, credit-based flow control); 3) State Management & Checkpointing (Chandy-Lamport distributed snapshots, RocksDB local state, incremental savepoints); 4) Exactly-Once Processing Semantics (two-phase commit sinks, transactional producer IDs, idempotency keys); 5) Fault Tolerance, worker failover, and asymmetric network partition recovery; 6) Hardware Sizing, memory bandwidth bottlenecks, and off-heap memory management to eliminate GC pauses. Include Markdown comparison tables, architectural ASCII/markdown diagrams, and comprehensive implementation specifications for all six pillars.",
    },
    {
      id: "TXT-05",
      category: "multi_file_coding",
      name: "Complete Multi-File Coding Solution",
      mode: "FAST",
      effort: "MAX",
      expectedLength: "Complete Multi-File Code (no placeholders, full types)",
      prompt: "Provide a complete, production-ready, multi-file TypeScript microservice implementing an asynchronous job processing queue backed by Redis with zero external queue libraries (no Bull, no BeeQueue). Provide complete code for:\n1) `src/types.ts`: Defining Job<T>, JobStatus, QueueOptions, and WorkerHandler<T>;\n2) `src/RedisClient.ts`: Wrapping ioredis with reconnection resilience, ping health check, and error logging;\n3) `src/JobQueue.ts`: Implementing push(), pop(), retry with exponential backoff, and dead-letter queue (DLQ) using atomic Redis Lua scripts;\n4) `src/Worker.ts`: Managing concurrent worker poll loop, concurrency semaphore, task execution, and graceful SIGTERM shutdown with in-flight drain;\n5) `src/index.ts`: Demonstrating an end-to-end runnable example producing and consuming image processing jobs.\n\nCRITICAL: Provide the complete, unabbreviated code for EVERY file with full TypeScript types. Do NOT use comments like '// ... implement here', '// ... rest of code', or placeholders. Provide complete runnable code.",
    },
    {
      id: "TXT-06",
      category: "comparative_analysis",
      name: "Complex Comparative Architectural Analysis",
      mode: "FAST",
      effort: "HIGH",
      expectedLength: "Rigorous Comparative Treatise (600–1,200 words)",
      prompt: "Conduct a comprehensive comparative analysis of Apache Kafka, Apache Pulsar, and AWS Kinesis for enterprise event streaming. Compare them across: 1) Storage architecture (log segments vs layered BookKeeper vs managed shard storage); 2) Multi-tenancy and namespace isolation; 3) Geo-replication patterns (active-active vs active-passive); 4) Consumer scaling, partition assignment, and rebalancing protocols; 5) Operational complexity and Total Cost of Ownership (TCO). Include an executive summary, a structured Markdown decision matrix table across all dimensions, and concrete scenario-based recommendations.",
    },
  ];

  const results = [];

  for (const tc of testCases) {
    console.log(`\n▶️  [${tc.id}] ${tc.name}`);
    console.log(`   Mode: ${tc.mode} | Effort: ${tc.effort} | Target: ${tc.expectedLength}`);
    console.log(`   Prompt: "${tc.prompt.slice(0, 90)}..."`);

    const res = await sendTextPrompt({
      prompt: tc.prompt,
      mode: tc.mode,
      effort: tc.effort,
    }, 90000);

    const words = res.fullText.trim().split(/\s+/).filter(Boolean).length;
    const chars = res.fullText.length;
    const estTokens = Math.round(chars / 3.8);
    const hasCode = res.fullText.includes("```");
    const hasHeaders = /^#{1,4}\s+/m.test(res.fullText);
    const isTruncated = detectTruncation(res.fullText);

    console.log(`   ⏱️  Time: ${res.elapsedMs}ms | Words: ${words} | Chars: ${chars} | Est Tokens: ~${estTokens}`);
    console.log(`   📦 Markdown Headers: ${hasHeaders ? "Yes" : "No"} | Code Blocks: ${hasCode ? "Yes" : "No"} | Truncated: ${isTruncated ? "⚠️ YES" : "✅ No"}`);
    console.log(`   💬 Opening Snippet: "${res.fullText.slice(0, 120).replace(/\n/g, ' ')}..."`);

    results.push({
      id: tc.id,
      category: tc.category,
      name: tc.name,
      mode: tc.mode,
      effort: tc.effort,
      expectedLength: tc.expectedLength,
      words,
      chars,
      estTokens,
      elapsedMs: res.elapsedMs,
      hasCode,
      hasHeaders,
      isTruncated,
      timedOut: res.timedOut,
      error: res.error,
      fullText: res.fullText,
    });
  }

  // Scenario 7: Long Multi-Turn Stateful Conversation (8 turns)
  console.log(`\n🔄 [TXT-07] Long Multi-Turn Conversation (8 Turns: E2E Secure Messaging Architecture)`);
  const multiTurnHistory = [];
  const multiTurnSteps = [
    { turn: 1, prompt: "I am designing a secure, end-to-end encrypted messaging application for enterprise teams. What core cryptographic protocols should I evaluate for asynchronous messaging?" },
    { turn: 2, prompt: "Between the Signal Protocol (Double Ratchet) and Matrix/Olm, which offers better forward secrecy and break-in recovery?" },
    { turn: 3, prompt: "Let's choose the Signal Protocol. How does the Double Ratchet maintain session state when Alice and Bob send out-of-order messages?" },
    { turn: 4, prompt: "Wait, random question: how do airlines calculate flight cruising altitude?" }, // Distraction turn
    { turn: 5, prompt: "Back to our E2E app: How should we store cryptographic session keys on iOS and Android devices securely?" },
    { turn: 6, prompt: "Our compliance team now mandates support for cryptographic post-quantum resilience (ML-KEM/Kyber). How does that alter our Key Encapsulation Mechanism?" },
    { turn: 7, prompt: "We also have a strict constraint: Group chats must support up to 5,000 members without quadratic client fanout. How should we architect group messaging?" },
    { turn: 8, prompt: "Now synthesize a complete, cohesive architectural specification for our secure messaging platform that combines everything we agreed upon across all 7 previous turns: the Signal Double Ratchet, post-quantum ML-KEM, the 5,000-member group architecture, and device key security." },
  ];

  const multiTurnResults = [];
  for (const step of multiTurnSteps) {
    console.log(`   Turn ${step.turn}: "${step.prompt.slice(0, 75)}..."`);
    const turnRes = await sendTextPrompt({
      prompt: step.prompt,
      mode: "FAST",
      effort: step.turn === 8 ? "MAX" : "MEDIUM",
      history: multiTurnHistory.slice(-8),
    }, 90000);

    const words = turnRes.fullText.trim().split(/\s+/).filter(Boolean).length;
    console.log(`      ⏱️  ${turnRes.elapsedMs}ms | Words: ${words} | Reply: "${turnRes.fullText.slice(0, 80).replace(/\n/g, ' ')}..."`);

    multiTurnHistory.push({ role: "user", text: step.prompt });
    multiTurnHistory.push({ role: "assistant", text: turnRes.fullText });

    multiTurnResults.push({
      turn: step.turn,
      prompt: step.prompt,
      words,
      elapsedMs: turnRes.elapsedMs,
      fullText: turnRes.fullText,
    });
  }

  // Save full run output to disk
  const reportPath = path.join(__dirname, "runs", `TXT_EVAL_${Date.now()}.json`);
  await fs.writeFile(reportPath, JSON.stringify({ isolated: results, multiTurn: multiTurnResults }, null, 2));

  console.log("\n================================================================================");
  console.log(`✅ TEXT-TO-TEXT EVALUATION COMPLETED`);
  console.log(`   Saved full telemetry to: ${reportPath}`);
  console.log("================================================================================\n");

  return { isolated: results, multiTurn: multiTurnResults, reportPath };
}

// Auto-run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runTextEvaluation().catch((err) => {
    console.error("Text evaluation failed:", err);
    process.exit(1);
  });
}

