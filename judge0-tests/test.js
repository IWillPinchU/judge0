const { JUDGE0_URL } = require("./config");
const { logSection, logPass, logFail, logInfo } = require("./utils");

const runWaitTests = require("./tests/test-wait");
const runBase64Tests = require("./tests/test-base64");
const runFieldsTests = require("./tests/test-fields");
const runLanguageTests = require("./tests/test-languages");
const runSecurityTests = require("./tests/test-security");
const runEdgeCaseTests = require("./tests/test-edge-cases");
const runProbe = require("./tests/probe-callback-ip");

const args = process.argv.slice(2);
const runAll = args.length === 0 || args.includes("--all");
const shouldRun = (flag) => runAll || args.includes(flag);

async function main() {
  console.log("\n=======================================================");
  console.log("   JUDGE0 UNIFIED TEST & VERIFICATION SUITE");
  console.log(`   Target Server: ${JUDGE0_URL}`);
  console.log("=======================================================");

  // 1. Health check & Readiness Probe
  try {
    const healthRes = await fetch(`${JUDGE0_URL}/healthz`);
    if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
    const health = await healthRes.json();
    logPass(`Readiness probe /healthz OK: DB=${health.database}, Redis=${health.redis}, Workers=${health.workers}`);

    const res = await fetch(`${JUDGE0_URL}/languages`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const langs = await res.json();
    logPass(`Server is alive. Registered: ${langs.map((l) => l.name).join(", ")}`);
  } catch (err) {
    logFail(`Cannot connect to Judge0 server at ${JUDGE0_URL}`, err.message);
    process.exit(1);
  }

  const results = [];

  // 2. Functional API Tests
  if (shouldRun("--api") || shouldRun("--wait")) {
    results.push({ name: "Wait Parameter (Sync/Async)", ...(await runWaitTests()) });
  }
  if (shouldRun("--api") || shouldRun("--base64")) {
    results.push({ name: "Base64 Encoding Modes", ...(await runBase64Tests()) });
  }
  if (shouldRun("--api") || shouldRun("--fields")) {
    results.push({ name: "Field Filtering & Validation", ...(await runFieldsTests()) });
  }

  // 3. Language Matrix
  if (shouldRun("--languages") || shouldRun("--langs")) {
    results.push({ name: "Languages (C, C++, Java, Python)", ...(await runLanguageTests()) });
  }

  // 4. Security Tests
  if (shouldRun("--security") || shouldRun("--sec")) {
    results.push({ name: "Security Hardening (0555 & Sandbox)", ...(await runSecurityTests()) });
  }

  // 5. Edge Cases
  if (shouldRun("--edge") || shouldRun("--edge-cases")) {
    results.push({ name: "Edge Cases & Crash Isolation", ...(await runEdgeCaseTests()) });
  }

  // 6. Callback Probe (explicit only)
  if (args.includes("--probe")) {
    await runProbe();
  }

  // Summary Table
  console.log("\n=== FINAL TEST RESULTS ===");
  console.table(
    results.map((r) => ({
      "Test Module": r.name,
      Passed: r.passed,
      Total: r.total,
      "Success Rate": r.total > 0 ? `${Math.round((r.passed / r.total) * 100)}%` : "N/A"
    }))
  );

  const grandPassed = results.reduce((acc, r) => acc + (r.passed || 0), 0);
  const grandTotal = results.reduce((acc, r) => acc + (r.total || 0), 0);
  console.log(`\nGrand Total: ${grandPassed} / ${grandTotal} tests passed (${Math.round((grandPassed / grandTotal) * 100)}%)\n`);

  if (grandPassed === grandTotal && grandTotal > 0) {
    console.log("✔ ALL REQUESTED TESTS PASSED PERFECTLY!\n");
    process.exit(0);
  } else {
    console.error("✖ SOME TESTS FAILED.\n");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});

