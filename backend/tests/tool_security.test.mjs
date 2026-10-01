/**
 * Comprehensive Tool Security & SSRF Defense Test Suite
 * backend/tests/tool_security.test.mjs
 */

import { isIpPrivateOrReserved, isUrlSafe, safeOutboundRequest } from "../tools/network/safeHttpClient.js";
import { toolExecutor } from "../tools/toolExecutor.js";
import { calculatorTool } from "../tools/modules/utility/calculatorTool.js";
import { openUrlTool } from "../tools/modules/web/openUrlTool.js";
import { extractWebpageTool } from "../tools/modules/web/extractWebpageTool.js";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    const res = await fn();
    if (res === false) {
      console.error(`  ❌ FAIL: ${name}`);
      failedTests++;
    } else {
      console.log(`  ✅ PASS: ${name}`);
      passedTests++;
    }
  } catch (err) {
    console.error(`  ❌ FAIL (Exception): ${name}`, err.message);
    failedTests++;
  }
}

async function runSecuritySuite() {
  console.log("================================================================================");
  console.log("🛡️  CHATLY TOOL SECURITY, SSRF, & INPUT SANITIZATION SUITE");
  console.log("================================================================================\n");

  // 1. IP Filtering (IPv4 & IPv6 & IPv4-mapped IPv6)
  console.log("🔹 1. Centralized IP Filtering & Blocklists");
  await test("isIpPrivateOrReserved blocks 127.0.0.1 (IPv4 loopback)", () => isIpPrivateOrReserved("127.0.0.1") === true);
  await test("isIpPrivateOrReserved blocks 127.25.1.9 (Entire 127.0.0.0/8 subnet)", () => isIpPrivateOrReserved("127.25.1.9") === true);
  await test("isIpPrivateOrReserved blocks 169.254.169.254 (Cloud metadata)", () => isIpPrivateOrReserved("169.254.169.254") === true);
  await test("isIpPrivateOrReserved blocks 10.0.0.1 (RFC1918 Class A)", () => isIpPrivateOrReserved("10.0.0.1") === true);
  await test("isIpPrivateOrReserved blocks 172.16.0.1 (RFC1918 Class B)", () => isIpPrivateOrReserved("172.16.0.1") === true);
  await test("isIpPrivateOrReserved blocks 192.168.1.1 (RFC1918 Class C)", () => isIpPrivateOrReserved("192.168.1.1") === true);
  await test("isIpPrivateOrReserved blocks 0.0.0.0 (Current network)", () => isIpPrivateOrReserved("0.0.0.0") === true);
  await test("isIpPrivateOrReserved blocks ::1 (IPv6 loopback)", () => isIpPrivateOrReserved("::1") === true);
  await test("isIpPrivateOrReserved blocks fe80::1 (IPv6 link-local)", () => isIpPrivateOrReserved("fe80::1") === true);
  await test("isIpPrivateOrReserved blocks fc00::1 (IPv6 unique local)", () => isIpPrivateOrReserved("fc00::1") === true);
  await test("isIpPrivateOrReserved blocks ::ffff:127.0.0.1 (IPv4-mapped IPv6 loopback)", () => isIpPrivateOrReserved("::ffff:127.0.0.1") === true);
  await test("isIpPrivateOrReserved blocks ::ffff:169.254.169.254 (IPv4-mapped cloud metadata)", () => isIpPrivateOrReserved("::ffff:169.254.169.254") === true);
  await test("isIpPrivateOrReserved allows public IPv4 8.8.8.8", () => isIpPrivateOrReserved("8.8.8.8") === false);
  await test("isIpPrivateOrReserved allows public IPv4 1.1.1.1", () => isIpPrivateOrReserved("1.1.1.1") === false);

  // 2. URL Scheme & Host Safety
  console.log("\n🔹 2. URL Scheme & Hostname Validation");
  await test("isUrlSafe blocks http://localhost:5000", async () => (await isUrlSafe("http://localhost:5000")) === false);
  await test("isUrlSafe blocks http://127.0.0.1:8080", async () => (await isUrlSafe("http://127.0.0.1:8080")) === false);
  await test("isUrlSafe blocks http://169.254.169.254/latest/meta-data/", async () => (await isUrlSafe("http://169.254.169.254/latest/meta-data/")) === false);
  await test("isUrlSafe blocks javascript:alert(document.cookie)", async () => (await isUrlSafe("javascript:alert(document.cookie)")) === false);
  await test("isUrlSafe blocks data:text/html,<script>evil()</script>", async () => (await isUrlSafe("data:text/html,<script>evil()</script>")) === false);
  await test("isUrlSafe blocks file:///etc/passwd", async () => (await isUrlSafe("file:///etc/passwd")) === false);
  await test("isUrlSafe blocks ftp://ftp.internal.local", async () => (await isUrlSafe("ftp://ftp.internal.local")) === false);
  await test("isUrlSafe blocks gopher://127.0.0.1:70", async () => (await isUrlSafe("gopher://127.0.0.1:70")) === false);
  await test("isUrlSafe allows legitimate https://en.wikipedia.org", async () => (await isUrlSafe("https://en.wikipedia.org/wiki/Earth")) === true);

  // 3. Web Tools SSRF Rejection
  console.log("\n🔹 3. Web Tools SSRF Enforcement");
  await test("open_url rejects localhost URL with SSRF_BLOCKED error", async () => {
    const res = await openUrlTool.execute({ url: "http://localhost:5000/api/admin" });
    return res.ok === false && res.error?.code === "SSRF_BLOCKED";
  });

  await test("open_url rejects cloud metadata URL with SSRF_BLOCKED error", async () => {
    const res = await openUrlTool.execute({ url: "http://169.254.169.254/latest/meta-data/" });
    return res.ok === false && res.error?.code === "SSRF_BLOCKED";
  });

  await test("extract_webpage rejects private RFC1918 IP URL with SSRF_BLOCKED error", async () => {
    const res = await extractWebpageTool.execute({ url: "http://192.168.1.1/router-settings" });
    return res.ok === false && res.error?.code === "SSRF_BLOCKED";
  });

  // 4. SafeOutboundRequest Engine & Redirect Safety
  console.log("\n🔹 4. safeOutboundRequest Redirect & DNS Protection");
  await test("safeOutboundRequest safely rejects dangerous protocol without throw", async () => {
    try {
      await safeOutboundRequest("javascript:alert(1)");
      return false;
    } catch (err) {
      const msg = err.message.toLowerCase();
      return msg.includes("blocked") || msg.includes("policy");
    }
  });

  await test("safeOutboundRequest rejects internal loopback addresses", async () => {
    try {
      await safeOutboundRequest("http://127.0.0.1:9999/admin");
      return false;
    } catch (err) {
      const msg = err.message.toLowerCase();
      return msg.includes("blocked") || msg.includes("policy");
    }
  });

  // 5. Calculator AST Sandbox & Code Injection Prevention
  console.log("\n🔹 5. Calculator Sandbox & AST Code Execution Immunity");
  await test("Calculator rejects process.exit(1)", () => {
    const res = calculatorTool.execute({ expression: "process.exit(1)" });
    return res.ok === false && res.error?.code === "SECURITY_VIOLATION";
  });

  await test("Calculator rejects require('fs').readFileSync()", () => {
    const res = calculatorTool.execute({ expression: "require('fs').readFileSync('/etc/passwd')" });
    return res.ok === false && res.error?.code === "SECURITY_VIOLATION";
  });

  await test("Calculator rejects eval('2+2')", () => {
    const res = calculatorTool.execute({ expression: "eval('2+2')" });
    return res.ok === false && res.error?.code === "SECURITY_VIOLATION";
  });

  await test("Calculator rejects Function constructor execution", () => {
    const res = calculatorTool.execute({ expression: "Function('return process')()" });
    return res.ok === false && res.error?.code === "SECURITY_VIOLATION";
  });

  await test("Calculator prevents prototype pollution manipulation", () => {
    calculatorTool.execute({ expression: "Object.prototype.polluted = true" });
    return ({}).polluted === undefined;
  });

  // 6. Schema Validation & Malformed Input Guard
  console.log("\n🔹 6. Schema Validation & Argument Guarding");
  await test("ToolExecutor safely guards against malformed string argument in numeric field", async () => {
    const res = await toolExecutor.executeTool("currency_conversion", {
      amount: "not_a_number",
      from: "USD",
      to: "INR",
    });
    // Handled gracefully without crash
    return res.ok === false || (res.ok === true && !isNaN(res.data?.convertedAmount));
  });

  console.log("\n================================================================================");
  console.log(`TOTAL SECURITY TESTS: ${totalTests}`);
  console.log(`PASSED:               ${passedTests}`);
  console.log(`FAILED:               ${failedTests}`);
  console.log("================================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSecuritySuite().catch((err) => {
  console.error("Fatal security suite crash:", err);
  process.exit(1);
});
