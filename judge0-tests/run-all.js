const { JUDGE0_URL } = require("./config");
const { logSection, logPass, logFail, logInfo } = require("./utils");

const runWaitTests = require("./tests/test-wait");
const runBase64Tests = require("./tests/test-base64");
const runFieldsTests = require("./tests/test-fields");
const runLanguageTests = require("./tests/test-languages");
const runProbe = require("./tests/probe-callback-ip");

async function main() {
  console.log("\n=======================================================");
  console.log("   JUDGE0 4-LANGUAGE SUITE ENGINE TEST RUNNER");
  console.log(`   Target Server: ${JUDGE0_URL}`);
  console.log("=======================================================");

  // Health check
  try {
    const res = await fetch(`${JUDGE0_URL}/languages`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const langs = await res.json();
    logPass(`Server is alive. Registered languages: ${langs.map((l) => l.name).join(", ")}`);
  } catch (err) {
    logFail(`Cannot connect to Judge0 server at ${JUDGE0_URL}`, err.message);
    process.exit(1);
  }

  const results = [];

  // Run modules
  results.push({ name: "Wait (true/false/omitted)", ...(await runWaitTests()) });
  results.push({ name: "Base64 (true/false/omitted)", ...(await runBase64Tests()) });
  results.push({ name: "Fields (filtering & validation)", ...(await runFieldsTests()) });
  results.push({ name: "Languages & Sandboxes (C, C++, Java, Python)", ...(await runLanguageTests()) });

  // Probe Callback IPs
  logSection("Callback IP Diagnostics");
  await runProbe();

  // Final Summary Table
  logSection("FINAL TEST RESULTS");
  let totalPassed = 0;
  let grandTotal = 0;

  const summary = results.map((r) => {
    totalPassed += r.passed;
    grandTotal += r.total;
    return {
      "Test Module": r.name,
      "Passed": r.passed,
      "Total": r.total,
      "Success Rate": `${Math.round((r.passed / r.total) * 100)}%`
    };
  });

  console.table(summary);
  console.log(`\nGrand Total: ${totalPassed} / ${grandTotal} tests passed (${Math.round((totalPassed / grandTotal) * 100)}%)\n`);

  if (totalPassed === grandTotal) {
    console.log("\x1b[32m✔ ALL CORE FUNCTIONALITY TESTS PASSED!\x1b[0m\n");
  } else {
    console.log("\x1b[31m✖ SOME TESTS FAILED. Check logs above.\x1b[0m\n");
  }
}

main().catch(console.error);
