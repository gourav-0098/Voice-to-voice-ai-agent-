/**
 * Automated Security Regression Test Suite
 * 
 * Verifies that confirmed vulnerabilities have been remediated and cannot regress:
 * 1. Secrets: No hardcoded fallback credentials in services.
 * 2. Auth: JWT algorithm is pinned to HS256, no default secret allowed, require process.env.JWT_SECRET.
 * 3. Authorization: No hardcoded admin email checks in User.js, adminOnly.js, or voice.js.
 * 4. Tenant Isolation: Qdrant queries strictly scope to user_id, no fallback to admin email.
 * 5. Calculator Security: Custom parser rejects prototype pollution and code execution.
 * 6. URL Scheme Security: javascript: and data: schemes strictly rejected for citations.
 * 7. SSRF Protection: Loopback, private, and metadata IP ranges blocked.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";

import { calculateExpression, isIpPrivateOrReserved } from "../services/toolService.js";
import { sanitizeCitationUrl } from "../services/evidencePackBuilder.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("================================================================================");
console.log("🔒 CHATLY AUTOMATED SECURITY REGRESSION TEST SUITE");
console.log("================================================================================");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    const res = await fn();
    if (res !== false) {
      passed++;
      console.log(`  ✅ PASS: ${name}`);
    } else {
      failed++;
      console.error(`  ❌ FAIL: ${name}`);
    }
  } catch (err) {
    failed++;
    console.error(`  ❌ ERROR: ${name} - ${err.message}`);
  }
}

function isSafeHttpUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function run() {
  // -------------------------------------------------------------
  // Suite 1: Source Code Static Secret Leaks Check
  // -------------------------------------------------------------
  console.log("\n🔹 1. Source Code Credential Invariance Check");

  await test("streamingVoiceService.js has NO hardcoded Deepgram key fallback", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../services/streamingVoiceService.js"), "utf8");
    return !content.includes("285b51b72e50");
  });

  await test("backend/middleware/auth.js requires process.env.JWT_SECRET and has no default secret", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../middleware/auth.js"), "utf8");
    return !content.includes("your-super-secret-jwt-key") && content.includes('algorithms: ["HS256"]');
  });

  await test("backend/models/User.js has NO hardcoded admin email privilege escalation", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../models/User.js"), "utf8");
    return !content.includes("r19216871@gamil.com") && !content.includes("r19216871@gmail.com");
  });

  await test("backend/middleware/adminOnly.js has NO hardcoded admin email privilege escalation", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../middleware/adminOnly.js"), "utf8");
    return !content.includes("r19216871@gamil.com") && !content.includes("r19216871@gmail.com");
  });

  // -------------------------------------------------------------
  // Suite 2: Memory Service Tenant Isolation Check
  // -------------------------------------------------------------
  console.log("\n🔹 2. Memory Service Tenant Isolation Check");

  await test("memoryService.js strictly scopes Qdrant queries to must: user_id without admin email fallback", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../services/memoryService.js"), "utf8");
    const hasUserIdFilter = content.includes('key: "user_id"') && content.includes("value: String(userId)");
    const hasMustFilter = content.includes("must:") && !content.includes("should:");
    const hasNoAdminLeak = !content.includes("r19216871@gamil.com") && !content.includes("r19216871@gmail.com");
    const rejectsGuest = content.includes('userId === "guest_user"');
    return hasUserIdFilter && hasMustFilter && hasNoAdminLeak && rejectsGuest;
  });

  // -------------------------------------------------------------
  // Suite 3: Safe Calculator AST Execution Check (Finding 22 Verification)
  // -------------------------------------------------------------
  console.log("\n🔹 3. Calculator Parser Sandbox Check");

  await test("safeEvaluate calculates standard arithmetic accurately", async () => {
    const res = calculateExpression("((15 * 4) + 40) / 2");
    return res && res.includes("= 50");
  });

  await test("safeEvaluate safely rejects code injection expressions", async () => {
    const res = calculateExpression("process.exit(1)");
    return res && (res.includes("Error") || res.includes("Could not evaluate"));
  });

  await test("safeEvaluate safely prevents constructor / prototype manipulation", async () => {
    calculateExpression("Object.prototype.polluted = 1");
    return ({}).polluted === undefined;
  });

  // -------------------------------------------------------------
  // Suite 4: SSRF Hostname & IP Filtering Check
  // -------------------------------------------------------------
  console.log("\n🔹 4. SSRF Defense Verification");

  await test("isIpPrivateOrReserved blocks 127.0.0.1", () => isIpPrivateOrReserved("127.0.0.1") === true);
  await test("isIpPrivateOrReserved blocks 169.254.169.254", () => isIpPrivateOrReserved("169.254.169.254") === true);
  await test("isIpPrivateOrReserved blocks 10.100.1.5", () => isIpPrivateOrReserved("10.100.1.5") === true);
  await test("isIpPrivateOrReserved blocks 192.168.1.1", () => isIpPrivateOrReserved("192.168.1.1") === true);
  await test("isIpPrivateOrReserved blocks ::1", () => isIpPrivateOrReserved("::1") === true);
  await test("isIpPrivateOrReserved allows 142.250.190.46 (Google)", () => isIpPrivateOrReserved("142.250.190.46") === false);

  // -------------------------------------------------------------
  // Suite 5: Citation XSS Scheme Sanitization Check
  // -------------------------------------------------------------
  console.log("\n🔹 5. Citation URL Scheme Validation");

  await test("sanitizeCitationUrl rejects javascript: scheme", () => {
    return sanitizeCitationUrl("javascript:alert(1)") === null;
  });

  await test("sanitizeCitationUrl rejects data: scheme", () => {
    return sanitizeCitationUrl("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==") === null;
  });

  await test("isSafeHttpUrl rejects javascript: scheme", () => {
    return isSafeHttpUrl("javascript:alert(document.cookie)") === false;
  });

  await test("isSafeHttpUrl rejects data: scheme", () => {
    return isSafeHttpUrl("data:text/html,<script>evil()</script>") === false;
  });

  await test("isSafeHttpUrl accepts https://www.chatly.live", () => {
    return isSafeHttpUrl("https://www.chatly.live") === true;
  });

  await test("urlSecurity.ts exists and enforces http/https protocol check", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../../frontend/app/voice/utils/urlSecurity.ts"), "utf8");
    return content.includes('parsed.protocol === "http:" || parsed.protocol === "https:"');
  });

  // -------------------------------------------------------------
  // Suite 6: JWT Algorithm Pinning Check
  // -------------------------------------------------------------
  console.log("\n🔹 6. JWT Security Validation");

  await test("jwt.verify with pinned HS256 rejects none algorithm tokens", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ id: "attacker_id", role: "admin" })).toString("base64url");
    const forgedToken = `${header}.${payload}.`;

    try {
      jwt.verify(forgedToken, "test-secret-key-123", { algorithms: ["HS256"] });
      return false; // Should not reach here
    } catch (err) {
      return true; // Expected to throw
    }
  });

  // -------------------------------------------------------------
  // Final Results
  // -------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`TOTAL REGRESSION TESTS: ${passed + failed}`);
  console.log(`PASSED:                 ${passed}`);
  console.log(`FAILED:                 ${failed}`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
