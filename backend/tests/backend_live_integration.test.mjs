/**
 * Autonomous Backend Live Integration Test Harness
 * backend/tests/backend_live_integration.test.mjs
 *
 * Exercises the actual running Chatly backend over WebSocket (ws://localhost:5000/ws/voice)
 * and HTTP SSE (http://localhost:5000/api/voice/stream).
 *
 * Verifies Categories A, B, C, D:
 * - Category A: Conversational Greetings, Capability Inquiries, Language Switches, Deterministic Time/Date
 * - Category B: Current Officeholders, Historical Distinction, Challenge Re-assessment, Query Hygiene
 * - Category C: Multi-turn Session & Language Preference Persistence across turns
 * - Category D: Protocol Resilience, Malformed JSON, Origin Security, Zero Secret/Diagnostic Leakage
 * - Category E: HTTP SSE /api/voice/stream compatibility
 */

import WebSocket from "ws";
import http from "http";

const WS_URL = "ws://localhost:5000/ws/voice";
const HTTP_URL = "http://localhost:5000/api/voice/stream";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

async function runTest(name, fn) {
  totalTests++;
  console.log(`\n▶️  [TEST ${totalTests}] ${name}`);
  try {
    await fn();
    console.log(`   ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`   ❌ FAIL: ${name}`);
    console.error(`      Error: ${err.message}`);
    failedTests++;
  }
}

/**
 * Helper to run a single WebSocket turn and collect all emitted events until 'done' or 'error'
 */
function sendWsTurn(ws, payload, timeoutMs = 25000) {
  return new Promise((resolve) => {
    const events = [];
    const timer = setTimeout(() => {
      resolve({ events, timedOut: true });
    }, timeoutMs);

    // Ensure test turns use isolated guest session id
    const enrichedPayload = {
      guestId: payload.guestId || `test_guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...payload,
    };

    const onMessage = (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        events.push(data);
        if (data.type === "done" || data.type === "error" || data.type === "quota_exceeded") {
          clearTimeout(timer);
          ws.off("message", onMessage);
          resolve({ events, timedOut: false });
        }
      } catch (err) {
        console.error("WS Parse error:", err.message);
      }
    };

    ws.on("message", onMessage);
    ws.send(JSON.stringify(enrichedPayload));
  });
}

/**
 * Helper to execute an HTTP SSE POST request to /api/voice/stream
 */
function postHttpSse(body, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const guestId = `test_sse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const options = {
      hostname: "localhost",
      port: 5000,
      path: "/api/voice/stream",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        "x-guest-id": guestId,
      },
      timeout: timeoutMs,
    };

    const req = http.request(options, (res) => {
      let rawData = "";
      const events = [];

      res.on("data", (chunk) => {
        rawData += chunk.toString();
        const lines = rawData.split("\n\n");
        // Process complete SSE chunks
        for (let i = 0; i < lines.length - 1; i++) {
          const block = lines[i];
          const eventMatch = block.match(/event:\s*([^\n]+)/);
          const dataMatch = block.match(/data:\s*([^\n]+)/);
          if (dataMatch) {
            try {
              events.push({
                event: eventMatch ? eventMatch[1].trim() : "message",
                data: JSON.parse(dataMatch[1].trim()),
              });
            } catch (_) {}
          }
        }
        rawData = lines[lines.length - 1]; // Keep remainder
      });

      res.on("end", () => {
        resolve({ statusCode: res.statusCode, events });
      });
    });

    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function runLiveIntegrationSuite() {
  console.log("================================================================================");
  console.log("🚀 CHATLY AUTONOMOUS LIVE BACKEND INTEGRATION TEST SUITE");
  console.log("================================================================================");

  // ---------------------------------------------------------------------------
  // CATEGORY A: Conversational, Routing & Capability Validation
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("📦 CATEGORY A: Conversational & Capability Routing");
  console.log("================================================================================");

  const wsA = new WebSocket(WS_URL, { headers: { Origin: "http://localhost:3000" } });
  await new Promise((res, rej) => { wsA.on("open", res); wsA.on("error", rej); });

  await runTest("A1. Colloquial capability inquiry ('what u can do now for me') resolves without web search", async () => {
    const res = await sendWsTurn(wsA, {
      type: "speech",
      text: "what u can do now for me",
      persona: "conversational"
    });
    assert(!res.timedOut, "Turn timed out");
    const doneEvent = res.events.find(e => e.type === "done");
    assert(doneEvent, "Missing 'done' event");
    const reply = (doneEvent.reply || doneEvent.fullText || "").toLowerCase();
    assert(reply.length > 20, "Reply too short");
    // Must mention verified capabilities
    assert(reply.includes("voice") || reply.includes("conversation") || reply.includes("weather") || reply.includes("research") || reply.includes("chatly"),
      `Expected capability description, got: "${doneEvent.reply}"`);
    // Must NOT invoke web_search tool
    const searchTools = res.events.filter(e => e.type === "thinking_step" && e.tool === "web_search");
    assert(searchTools.length === 0, "Capability inquiry must NOT execute web_search");
  });

  await runTest("A2. Language-switch ('talk to me in english') emits language_changed and sets voiceModel", async () => {
    const res = await sendWsTurn(wsA, {
      type: "speech",
      text: "talk to me in english",
      persona: "conversational"
    });
    assert(!res.timedOut, "Turn timed out");
    const langEvent = res.events.find(e => e.type === "language_changed");
    assert(langEvent, "Must emit 'language_changed' event");
    assert(langEvent.language === "english", `Expected language 'english', got: ${langEvent.language}`);
    assert(langEvent.voiceModel === "aura-asteria-en", `Expected voiceModel 'aura-asteria-en', got: ${langEvent.voiceModel}`);
  });

  await runTest("A3. Hindi language-switch ('ab hindi mein baat karo') emits language_changed with sarvam-aditya", async () => {
    const res = await sendWsTurn(wsA, {
      type: "speech",
      text: "ab hindi mein baat karo",
      persona: "conversational"
    });
    assert(!res.timedOut, "Turn timed out");
    const langEvent = res.events.find(e => e.type === "language_changed");
    assert(langEvent, "Must emit 'language_changed' event");
    assert(langEvent.language === "hindi", `Expected language 'hindi', got: ${langEvent.language}`);
    assert(langEvent.voiceModel === "sarvam-aditya", `Expected voiceModel 'sarvam-aditya', got: ${langEvent.voiceModel}`);
  });

  await runTest("A4. Deterministic date query ('what is today\\'s date') invokes get_current_time fast-path", async () => {
    const res = await sendWsTurn(wsA, {
      type: "speech",
      text: "what is today's date",
      persona: "conversational"
    });
    assert(!res.timedOut, "Turn timed out");
    const doneEvent = res.events.find(e => e.type === "done");
    assert(doneEvent, "Missing 'done' event");
    const reply = doneEvent.reply || doneEvent.fullText || "";
    // Date response must include year 2026 and current month (October)
    assert(reply.includes("2026") || reply.includes("October") || reply.includes("31"),
      `Expected current 2026 date in answer, got: "${reply}"`);
    // Verification of deterministic tool execution
    const toolExec = res.events.find(e => e.type === "thinking_step" && e.tool === "get_current_time");
    assert(toolExec, "Expected get_current_time tool execution");
  });

  wsA.close();

  // ---------------------------------------------------------------------------
  // CATEGORY B: Research Correctness, Current Officeholders, Challenge Handling
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("📦 CATEGORY B: Research Correctness, Officeholders & Challenge Handling");
  console.log("================================================================================");

  const wsB = new WebSocket(WS_URL, { headers: { Origin: "http://localhost:3000" } });
  await new Promise((res, rej) => { wsB.on("open", res); wsB.on("error", rej); });

  let cmReply = "";

  await runTest("B1. Current officeholder ('who is the current cm of rajasthan') names Bhajan Lal Sharma", async () => {
    const res = await sendWsTurn(wsB, {
      type: "speech",
      text: "who is the current cm of rajasthan",
      mode: "SEARCH",
      persona: "conversational"
    }, 30000);
    assert(!res.timedOut, "Turn timed out");
    const doneEvent = res.events.find(e => e.type === "done");
    assert(doneEvent, "Missing 'done' event");
    cmReply = doneEvent.reply || doneEvent.fullText || "";
    // Must identify Bhajan Lal Sharma
    assert(cmReply.toLowerCase().includes("bhajan lal"), `Expected Bhajan Lal Sharma, got: "${cmReply}"`);
    // Must NOT state Ashok Gehlot as current CM
    assert(!cmReply.toLowerCase().includes("ashok gehlot is the current"), `Stale CM returned: "${cmReply}"`);
  });

  await runTest("B2. Conversational challenge ('WTF that answer is wrong, are you sure?') re-assesses active topic", async () => {
    const res = await sendWsTurn(wsB, {
      type: "speech",
      text: "WTF that answer is wrong, are you sure?",
      mode: "SEARCH",
      persona: "conversational",
      history: [
        { role: "user", text: "who is the current cm of rajasthan" },
        { role: "assistant", text: cmReply }
      ]
    }, 30000);
    assert(!res.timedOut, "Turn timed out");
    const doneEvent = res.events.find(e => e.type === "done");
    assert(doneEvent, "Missing 'done' event");
    const reply = (doneEvent.reply || doneEvent.fullText || "").toLowerCase();
    // Must NOT define WTF acronym; must re-evaluate Rajasthan Chief Minister Bhajan Lal Sharma
    assert(!reply.includes("shorthand for") && !reply.includes("what the fuck"),
      `Assistant erroneously defined 'WTF' instead of addressing Rajasthan CM: "${doneEvent.reply}"`);
    assert(reply.includes("bhajan lal") || reply.includes("rajasthan") || reply.includes("chief minister"),
      `Expected re-assessment of Rajasthan CM, got: "${doneEvent.reply}"`);
  });

  await runTest("B3. Historical inquiry ('who was the first cm of rajasthan') does not force 2026", async () => {
    const res = await sendWsTurn(wsB, {
      type: "speech",
      text: "who was the first cm of rajasthan",
      mode: "SEARCH",
      persona: "conversational"
    }, 40000);
    assert(!res.timedOut, "Turn timed out");
    const doneEvent = res.events.find(e => e.type === "done");
    assert(doneEvent, "Missing 'done' event");
    const reply = (doneEvent.reply || doneEvent.fullText || "").toLowerCase();
    assert(reply.includes("heera lal") || reply.includes("hiralal") || reply.includes("shastri"),
      `Expected Heera Lal Shastri as first CM, got: "${doneEvent.reply}"`);
  });

  await runTest("B4. Query hygiene: user-facing replies and queries do NOT leak diagnostic labels", async () => {
    const res = await sendWsTurn(wsB, {
      type: "speech",
      text: "tell me about current chief minister of rajasthan",
      mode: "SEARCH",
      persona: "conversational"
    }, 25000);
    const doneEvent = res.events.find(e => e.type === "done");
    const reply = doneEvent?.reply || doneEvent?.fullText || "";
    // Verify no diagnostic labels leaked
    assert(!reply.includes("[missingInformation]") && !reply.includes("verified facts overview") && !reply.includes("Tool error"),
      `Leaked diagnostic syntax in reply: "${reply}"`);
  });

  wsB.close();

  // ---------------------------------------------------------------------------
  // CATEGORY C: Multi-Turn Session & Language Preference Persistence
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("📦 CATEGORY C: Session & Language Preference Persistence");
  console.log("================================================================================");

  const wsC = new WebSocket(WS_URL, { headers: { Origin: "http://localhost:3000" } });
  await new Promise((res, rej) => { wsC.on("open", res); wsC.on("error", rej); });

  await runTest("C1. Turn 1: Switch to English sets connection preference to aura-asteria-en", async () => {
    const res = await sendWsTurn(wsC, {
      type: "speech",
      text: "talk to me in english",
      persona: "conversational"
    });
    const langEvent = res.events.find(e => e.type === "language_changed");
    assert(langEvent && langEvent.language === "english", "Expected language_changed to english");
    assert(langEvent.voiceModel === "aura-asteria-en", "Expected voiceModel aura-asteria-en");
  });

  await runTest("C2. Turn 2: Subsequent turn on same WebSocket inherits English voiceModel", async () => {
    const res = await sendWsTurn(wsC, {
      type: "speech",
      text: "what is the capital of France?",
      persona: "conversational"
    });
    assert(!res.timedOut, "Turn timed out");
    const doneEvent = res.events.find(e => e.type === "done");
    assert(doneEvent, "Missing 'done' event");
    const reply = (doneEvent.reply || doneEvent.fullText || "").toLowerCase();
    assert(reply.includes("paris"), `Expected Paris, got: "${doneEvent.reply}"`);
  });

  await runTest("C3. Turn 3: Switch to Hindi updates connection preference to sarvam-aditya", async () => {
    const res = await sendWsTurn(wsC, {
      type: "speech",
      text: "ab hindi mein baat karo",
      persona: "conversational"
    });
    const langEvent = res.events.find(e => e.type === "language_changed");
    assert(langEvent && langEvent.language === "hindi", "Expected language_changed to hindi");
    assert(langEvent.voiceModel === "sarvam-aditya", "Expected voiceModel sarvam-aditya");
  });

  await runTest("C4. Turn 4: Subsequent turn preserves Hindi preference on same WebSocket", async () => {
    const res = await sendWsTurn(wsC, {
      type: "speech",
      text: "bharat ki rajdhani kya hai?",
      persona: "conversational"
    }, 30000);
    assert(!res.timedOut, "Turn timed out");
    const doneEvent = res.events.find(e => e.type === "done");
    assert(doneEvent, "Missing 'done' event");
    const reply = (doneEvent.reply || doneEvent.fullText || "").toLowerCase();
    assert(reply.includes("delhi") || reply.includes("dilli"), `Expected Delhi/Dilli, got: "${doneEvent.reply}"`);
  });

  wsC.close();

  // ---------------------------------------------------------------------------
  // CATEGORY D: Protocol Resilience, Malformed Input & Security Invariants
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("📦 CATEGORY D: Protocol Resilience, Malformed Input & Security Invariants");
  console.log("================================================================================");

  await runTest("D1. Malformed JSON message returns safe error event without dropping server", async () => {
    const wsD = new WebSocket(WS_URL, { headers: { Origin: "http://localhost:3000" } });
    await new Promise((res, rej) => { wsD.on("open", res); wsD.on("error", rej); });

    const errorEvent = await new Promise((resolve) => {
      wsD.on("message", (raw) => {
        try {
          resolve(JSON.parse(raw.toString()));
        } catch (_) {}
      });
      wsD.send("THIS IS NOT JSON {{{ bad syntax");
    });

    assert(errorEvent && errorEvent.type === "error", `Expected error event, got: ${JSON.stringify(errorEvent)}`);
    assert(errorEvent.message.includes("Invalid JSON"), `Expected Invalid JSON message, got: ${errorEvent.message}`);
    wsD.close();
  });

  await runTest("D2. Unauthorized origin from browser is rejected with 403 HTTP code", async () => {
    const rejected = await new Promise((resolve) => {
      const badWs = new WebSocket(WS_URL, {
        headers: { Origin: "https://malicious-attacker-domain.xyz" }
      });
      badWs.on("unexpected-response", (req, res) => {
        resolve(res.statusCode === 403);
      });
      badWs.on("open", () => resolve(false));
      badWs.on("error", () => resolve(true));
    });
    assert(rejected, "Forbidden origin should be rejected by verifyClient");
  });

  await runTest("D3. Oversized prompt (2000+ characters) is safely accepted and bounded", async () => {
    const wsD3 = new WebSocket(WS_URL, { headers: { Origin: "http://localhost:3000" } });
    await new Promise((res, rej) => { wsD3.on("open", res); wsD3.on("error", rej); });

    const giantPrompt = "What is the time? " + "extra filler words ".repeat(250); // > 4000 chars
    const res = await sendWsTurn(wsD3, {
      type: "speech",
      text: giantPrompt,
      persona: "conversational"
    }, 25000);
    assert(!res.timedOut, "Oversized prompt caused timeout");
    const doneEvent = res.events.find(e => e.type === "done");
    assert(doneEvent, "Expected done event despite oversized input");
    wsD3.close();
  });

  // ---------------------------------------------------------------------------
  // CATEGORY E: HTTP SSE /api/voice/stream Protocol
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("📦 CATEGORY E: HTTP SSE Endpoint (/api/voice/stream)");
  console.log("================================================================================");

  await runTest("E1. HTTP SSE POST /api/voice/stream streams capability reply and emits 'done'", async () => {
    const res = await postHttpSse({
      text: "what can you do for me",
      persona: "conversational"
    });
    assert(res.statusCode === 200, `Expected 200, got: ${res.statusCode}`);
    const tokenEvents = res.events.filter(e => e.event === "token");
    assert(tokenEvents.length > 0, "Expected token delta stream over SSE");
    const doneEvent = res.events.find(e => e.event === "done");
    assert(doneEvent, "Expected 'done' SSE event");
    const reply = (doneEvent.data?.reply || "").toLowerCase();
    assert(reply.includes("voice") || reply.includes("weather") || reply.includes("conversation") || reply.includes("research"),
      `Expected capability summary, got: "${doneEvent.data?.reply}"`);
  });

  await runTest("E2. HTTP SSE POST /api/voice/stream deterministic date includes 2026", async () => {
    const res = await postHttpSse({
      text: "what is today's date",
      persona: "conversational"
    });
    assert(res.statusCode === 200, `Expected 200, got: ${res.statusCode}`);
    const doneEvent = res.events.find(e => e.event === "done");
    assert(doneEvent, "Expected 'done' SSE event");
    const reply = doneEvent.data?.reply || "";
    assert(reply.includes("2026") || reply.includes("October"), `Expected 2026 in date response, got: "${reply}"`);
  });

  // ---------------------------------------------------------------------------
  // SUMMARY REPORT
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("📊 CHATLY LIVE BACKEND INTEGRATION TEST RESULTS");
  console.log("================================================================================");
  console.log(`TOTAL TESTS:  ${totalTests}`);
  console.log(`PASSED:       ${passedTests}`);
  console.log(`FAILED:       ${failedTests}`);
  console.log("================================================================================");

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runLiveIntegrationSuite().catch((err) => {
  console.error("FATAL ERROR IN HARNESS:", err);
  process.exit(1);
});
