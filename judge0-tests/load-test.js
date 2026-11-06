const { JUDGE0_URL, STATUS } = require("./config");
const { pollSuite } = require("./utils");
const { generateTestSuite } = require("./generators");

// Configurable Load Parameters via CLI args or defaults
const CONCURRENCY = parseInt(process.env.CONCURRENCY || process.argv[2] || "5", 10);
const TOTAL_SUITES = parseInt(process.env.TOTAL_SUITES || process.argv[3] || "25", 10);
const TESTS_PER_SUITE = parseInt(process.env.TESTS_PER_SUITE || process.argv[4] || "20", 10);

// Performance & Metric Tracking
const metrics = {
  submitted: 0,
  completedSuites: 0,
  completedTestCases: 0,
  acceptedSuites: 0,
  failedSuites: 0,
  errors: [],
  latenciesMs: [],
  startTime: 0,
  endTime: 0
};

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
  return sorted[idx];
}

function printLiveStats() {
  const elapsedSec = Math.max((Date.now() - metrics.startTime) / 1000, 0.1);
  const tcThroughput = (metrics.completedTestCases / elapsedSec).toFixed(1);
  const suiteThroughput = (metrics.completedSuites / elapsedSec).toFixed(1);
  
  process.stdout.write(
    `\r[LOAD PROGRESS] Completed: ${metrics.completedSuites}/${TOTAL_SUITES} Suites | ` +
    `Sandboxed TCs: ${metrics.completedTestCases} | ` +
    `Rate: ${tcThroughput} TCs/s (${suiteThroughput} Suites/s) | ` +
    `Failures: ${metrics.failedSuites} `
  );
}

// Single Worker Task: Generates a suite, sends it (async), polls for completion, gathers metrics
async function workerTask(workerId, suiteIndex) {
  const langs = ["c", "cpp", "java", "python"];
  const types = ["sum", "kadane"];
  const lang = langs[suiteIndex % langs.length];
  const type = types[suiteIndex % types.length];

  const payload = generateTestSuite(lang, type, TESTS_PER_SUITE);
  const t0 = Date.now();

  try {
    metrics.submitted++;

    // Async submission (realistic OA platform architecture)
    const res = await fetch(`${JUDGE0_URL}/suites?base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Submit failed with HTTP ${res.status}`);
    }

    const data = await res.json();
    const suite_token = data.token || data.suite_token;
    if (!suite_token) throw new Error("Missing token/suite_token in response: " + JSON.stringify(data));

    // Poll until worker finishes processing
    const result = await pollSuite(suite_token, "base64_encoded=false");
    const elapsed = Date.now() - t0;
    metrics.latenciesMs.push(elapsed);

    const statusId = result.status?.id || result.status_id;
    if (statusId === STATUS.ACCEPTED) {
      metrics.acceptedSuites++;
      metrics.completedTestCases += TESTS_PER_SUITE;
    } else {
      metrics.failedSuites++;
      metrics.errors.push(`Suite ${suite_token} ended with status ${statusId}`);
    }

    metrics.completedSuites++;
    printLiveStats();
  } catch (err) {
    metrics.failedSuites++;
    metrics.errors.push(err.message);
  }
}

// Concurrent Queue Runner
async function runLoadTest() {
  console.log("\n===============================================================================");
  console.log("             JUDGE0 HIGH-THROUGHPUT LOAD & STRESS TESTING ENGINE");
  console.log("===============================================================================");
  console.log(`Target Server:          ${JUDGE0_URL}`);
  console.log(`Concurrent Workers:     ${CONCURRENCY}`);
  console.log(`Total Suites to Submit: ${TOTAL_SUITES}`);
  console.log(`Test Cases Per Suite:   ${TESTS_PER_SUITE}`);
  console.log(`Total Sandboxed TCs:    ${TOTAL_SUITES * TESTS_PER_SUITE}`);
  console.log("-------------------------------------------------------------------------------\n");

  metrics.startTime = Date.now();

  let nextIndex = 0;
  async function runWorker(workerId) {
    while (nextIndex < TOTAL_SUITES) {
      const idx = nextIndex++;
      await workerTask(workerId, idx);
    }
  }

  // Launch worker pool
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(runWorker(i));
  }

  await Promise.all(workers);
  metrics.endTime = Date.now();

  const totalDurationSec = (metrics.endTime - metrics.startTime) / 1000;
  const lats = metrics.latenciesMs;

  console.log("\n\n===============================================================================");
  console.log("                        LOAD & STRESS TEST BENCHMARK REPORT");
  console.log("===============================================================================");
  console.log(`Total Wall Clock Time:          ${totalDurationSec.toFixed(2)} seconds`);
  console.log(`Suites Submitted:               ${metrics.submitted}`);
  console.log(`Suites Successfully Completed:  ${metrics.acceptedSuites} / ${TOTAL_SUITES} (${((metrics.acceptedSuites / TOTAL_SUITES) * 100).toFixed(1)}%)`);
  console.log(`Total Sandboxed Tests Executed: ${metrics.completedTestCases}`);
  console.log(`Suite Processing Throughput:    ${(metrics.completedSuites / totalDurationSec).toFixed(2)} suites/sec`);
  console.log(`Sandbox Execution Throughput:   ${(metrics.completedTestCases / totalDurationSec).toFixed(2)} test_cases/sec`);
  console.log("-------------------------------------------------------------------------------");
  console.log("LATENCY DISTRIBUTION (End-to-End Compile + Multi-Test Evaluation):");
  console.log(`  • Minimum Latency:            ${lats.length ? Math.min(...lats) : 0} ms`);
  console.log(`  • Median (p50):               ${percentile(lats, 50)} ms`);
  console.log(`  • 90th Percentile (p90):      ${percentile(lats, 90)} ms`);
  console.log(`  • 95th Percentile (p95):      ${percentile(lats, 95)} ms`);
  console.log(`  • 99th Percentile (p99):      ${percentile(lats, 99)} ms`);
  console.log(`  • Maximum Latency:            ${lats.length ? Math.max(...lats) : 0} ms`);
  console.log("-------------------------------------------------------------------------------");

  if (metrics.errors.length > 0) {
    console.log(`Encountered Errors (${metrics.errors.length}):`);
    metrics.errors.slice(0, 10).forEach(e => console.log(`  ✖ ${e}`));
    if (metrics.errors.length > 10) console.log(`  ... and ${metrics.errors.length - 10} more`);
  } else {
    console.log("\x1b[32m✔ 100% OF SUBMISSIONS PROCESSED WITH ZERO LOSS OR CRASHES!\x1b[0m");
  }
  console.log("===============================================================================\n");
}

if (require.main === module) {
  runLoadTest().catch(console.error);
}

module.exports = runLoadTest;

