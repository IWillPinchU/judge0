const fs = require("fs");
const path = require("path");
const { JUDGE0_URL } = require("./config");
const { PROBLEMS, LANG_CONFIG } = require("./problems/benchmark_problems");

const args = process.argv.slice(2);

function getArg(flag, defaultValue = null) {
  const arg = args.find((a) => a.startsWith(`--${flag}=`));
  if (arg) return arg.split("=")[1];
  const idx = args.indexOf(`--${flag}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultValue;
}

const targetUrl = process.env.JUDGE0_URL || JUDGE0_URL || "http://localhost:2358";
const CONCURRENCY = parseInt(getArg("concurrency", "16"), 10);
const SUITE_TCS_PER_LANG = parseInt(getArg("suite-count", "2500"), 10);
const LEGACY_TCS_PER_LANG = parseInt(getArg("legacy-count", "250"), 10);
const TCS_PER_SUITE = parseInt(getArg("tcs-per-suite", "50"), 10);
const RUN_SUITE = !args.includes("--skip-suite");
const RUN_LEGACY = !args.includes("--skip-legacy");

const PROBLEM_KEYS = Object.keys(PROBLEMS);
const LANG_KEYS = ["c", "cpp", "java", "python"];

function formatStats(latenciesMs, wallClockSec, totalTestCases) {
  if (latenciesMs.length === 0) {
    return {
      totalTCs: totalTestCases,
      wallClockSec: parseFloat(wallClockSec.toFixed(2)),
      throughputTCsPerSec: 0,
      minMs: 0,
      p50Ms: 0,
      p90Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0
    };
  }
  latenciesMs.sort((a, b) => a - b);
  const p = (pct) => latenciesMs[Math.floor(latenciesMs.length * (pct / 100))] || 0;
  return {
    totalTCs: totalTestCases,
    wallClockSec: parseFloat(wallClockSec.toFixed(2)),
    throughputTCsPerSec: parseFloat((totalTestCases / wallClockSec).toFixed(2)),
    minMs: latenciesMs[0],
    p50Ms: p(50),
    p90Ms: p(90),
    p95Ms: p(95),
    p99Ms: p(99),
    maxMs: latenciesMs[latenciesMs.length - 1]
  };
}

async function pollSuite(token, maxWaitSec = 180) {
  const url = `${targetUrl}/suites/${token}?base64_encoded=false`;
  const pollInterval = 100;
  const maxAttempts = Math.floor((maxWaitSec * 1000) / pollInterval);
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to poll suite ${token}: HTTP ${res.status}`);
    }
    const data = await res.json();
    const statusId = data.status?.id || data.status_id;
    if (statusId !== 1 && statusId !== 2) {
      return data;
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw new Error(`Suite ${token} timed out after ${maxWaitSec}s`);
}

async function pollSubmission(token, maxWaitSec = 60) {
  const url = `${targetUrl}/submissions/${token}?base64_encoded=false`;
  const pollInterval = 100;
  const maxAttempts = Math.floor((maxWaitSec * 1000) / pollInterval);
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to poll submission ${token}: HTTP ${res.status}`);
    }
    const data = await res.json();
    const statusId = data.status?.id || data.status_id;
    if (statusId !== 1 && statusId !== 2) {
      return data;
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw new Error(`Submission ${token} timed out after ${maxWaitSec}s`);
}

// ==============================================================================
// 1. SUITE BENCHMARK: 10,000 TEST CASES (2,500 EACH LANGUAGE)
// ==============================================================================
async function runSuiteBenchmark() {
  console.log(`\n===============================================================================`);
  console.log(`  PHASE 1: SUITE ENGINE BENCHMARK (10,000 TEST CASES TOTAL)`);
  console.log(`  - Architecture: Compile-Once-Run-Many inside Hardened 0555 Sandbox`);
  console.log(`  - Concurrency:  ${CONCURRENCY} Parallel Workers (8 vCPU / 16 Helper Threads)`);
  console.log(`  - Distribution: 2,500 C | 2,500 C++ | 2,500 Java | 2,500 Python`);
  console.log(`  - Problems:     10 DSA Archetypes (DP, Graphs, Trees, Heaps, Two-Pointers, Math)`);
  console.log(`  - Suite Size:   ${TCS_PER_SUITE} Test Cases per Suite (${SUITE_TCS_PER_LANG / TCS_PER_SUITE} Suites / Lang)`);
  console.log(`===============================================================================\n`);

  const suitesQueue = [];
  const suitesPerLang = Math.ceil(SUITE_TCS_PER_LANG / TCS_PER_SUITE);

  for (const langKey of LANG_KEYS) {
    const langInfo = LANG_CONFIG[langKey];
    for (let s = 0; s < suitesPerLang; s++) {
      const probKey = PROBLEM_KEYS[s % PROBLEM_KEYS.length];
      const prob = PROBLEMS[probKey];
      const sourceCode = prob.solutions[langKey];

      const testCases = [];
      for (let tc = 0; tc < TCS_PER_SUITE; tc++) {
        testCases.push(prob.generator());
      }

      suitesQueue.push({
        langKey,
        langName: langInfo.name,
        probName: prob.name,
        payload: {
          source_code: sourceCode,
          language_id: langInfo.id,
          test_cases: testCases
        },
        caseCount: testCases.length
      });
    }
  }

  // Shuffle queue to simulate realistic concurrent multi-tenant traffic
  suitesQueue.sort(() => Math.random() - 0.5);

  const totalSuites = suitesQueue.length;
  const totalTestCases = totalSuites * TCS_PER_SUITE;

  const latenciesMs = [];
  const perLangLatencies = { c: [], cpp: [], java: [], python: [] };
  const langProgress = { c: 0, cpp: 0, java: 0, python: 0 };
  const langPassed = { c: 0, cpp: 0, java: 0, python: 0 };
  const langStartTimes = { c: null, cpp: null, java: null, python: null };
  const langEndTimes = { c: null, cpp: null, java: null, python: null };

  let completedSuites = 0;
  let completedTestCases = 0;
  let activeWorkers = 0;
  let queueIndex = 0;

  const startTime = Date.now();
  let lastLogTime = Date.now();
  let lastTestCases = 0;

  const progressInterval = setInterval(() => {
    const elapsedSec = (Date.now() - startTime) / 1000;
    const intervalSec = (Date.now() - lastLogTime) / 1000;
    const intervalTCs = completedTestCases - lastTestCases;
    const instRate = intervalSec > 0 ? (intervalTCs / intervalSec).toFixed(1) : 0;
    const avgRate = elapsedSec > 0 ? (completedTestCases / elapsedSec).toFixed(1) : 0;
    const pct = ((completedTestCases / totalTestCases) * 100).toFixed(1);

    lastLogTime = Date.now();
    lastTestCases = completedTestCases;

    process.stdout.write(
      `\r[Suite Engine] ${completedTestCases}/${totalTestCases} TCs (${pct}%) | ` +
      `Instant: ${instRate} tc/s | Avg: ${avgRate} tc/s | ` +
      `Active: ${activeWorkers}/${CONCURRENCY} | ` +
      `[C:${langProgress.c} C++:${langProgress.cpp} Java:${langProgress.java} Py:${langProgress.python}] | ` +
      `Elapsed: ${elapsedSec.toFixed(1)}s   `
    );
  }, 250);

  async function worker() {
    while (queueIndex < suitesQueue.length) {
      const idx = queueIndex++;
      const item = suitesQueue[idx];
      activeWorkers++;

      if (!langStartTimes[item.langKey]) langStartTimes[item.langKey] = Date.now();
      const suiteStart = Date.now();

      try {
        const res = await fetch(`${targetUrl}/suites?wait=false&base64_encoded=false`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload)
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errText}`);
        }

        const { suite_token } = await res.json();
        const suiteResult = await pollSuite(suite_token, 180);
        const elapsed = Date.now() - suiteStart;
        latenciesMs.push(elapsed);
        perLangLatencies[item.langKey].push(elapsed);

        completedSuites++;
        completedTestCases += item.caseCount;
        langProgress[item.langKey] += item.caseCount;
        langEndTimes[item.langKey] = Date.now();

        if (suiteResult.status?.id === 3) {
          langPassed[item.langKey] += item.caseCount;
        }
      } catch (err) {
        console.error(`\n[Suite Error] ${item.langKey} suite failed: ${err.message}`);
      } finally {
        activeWorkers--;
      }
    }
  }

  const pool = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    pool.push(worker());
  }

  await Promise.all(pool);
  clearInterval(progressInterval);

  const totalWallClockSec = (Date.now() - startTime) / 1000;
  console.log(`\n\n✔ Suite Benchmark Complete in ${totalWallClockSec.toFixed(2)} seconds!`);

  const stats = formatStats(latenciesMs, totalWallClockSec, completedTestCases);
  console.log(`\n=== SUITE ENGINE PERFORMANCE SUMMARY (AGGREGATE) ===`);
  console.table([
    {
      "Total Test Cases": completedTestCases,
      "Wall Clock Time (s)": stats.wallClockSec,
      "Throughput (tc/sec)": stats.throughputTCsPerSec,
      "Min Suite Latency (ms)": stats.minMs,
      "p50 Latency (ms)": stats.p50Ms,
      "p90 Latency (ms)": stats.p90Ms,
      "p95 Latency (ms)": stats.p95Ms,
      "p99 Latency (ms)": stats.p99Ms,
      "Max Suite Latency (ms)": stats.maxMs
    }
  ]);

  // Per-language isolated metrics
  const langSummaries = {};
  console.log(`\n=== SUITE ENGINE: PER-LANGUAGE ISOLATED BREAKDOWN ===`);
  const langTable = LANG_KEYS.map((k) => {
    const lats = perLangLatencies[k];
    const dur = ((langEndTimes[k] - (langStartTimes[k] || startTime)) / 1000) || totalWallClockSec;
    const lStats = formatStats(lats, dur, langProgress[k]);
    langSummaries[k] = lStats;
    return {
      Language: LANG_CONFIG[k].name,
      "Test Cases": langProgress[k],
      "Accepted TCs": langPassed[k],
      "Success Rate": `${((langPassed[k] / (langProgress[k] || 1)) * 100).toFixed(1)}%`,
      "Throughput (tc/s)": lStats.throughputTCsPerSec,
      "p50 Suite (ms)": lStats.p50Ms,
      "p90 Suite (ms)": lStats.p90Ms,
      "Max Suite (ms)": lStats.maxMs
    };
  });
  console.table(langTable);

  return { aggregate: stats, perLanguage: langSummaries };
}

// ==============================================================================
// 2. LEGACY BENCHMARK: 1,000 TEST CASES (250 EACH LANGUAGE)
// ==============================================================================
async function runLegacyBenchmark() {
  console.log(`\n===============================================================================`);
  console.log(`  PHASE 2: LEGACY SUBMISSIONS BENCHMARK (1,000 TEST CASES TOTAL)`);
  console.log(`  - Architecture: Compile-Per-Submission (1,000 Individual Compilations & Runs)`);
  console.log(`  - Concurrency:  ${CONCURRENCY} Parallel Workers`);
  console.log(`  - Distribution: 250 C | 250 C++ | 250 Java | 250 Python`);
  console.log(`  - Problems:     10 DSA Archetypes (DP, Graphs, Trees, Heaps, Two-Pointers, Math)`);
  console.log(`===============================================================================\n`);

  const legacyQueue = [];
  for (const langKey of LANG_KEYS) {
    const langInfo = LANG_CONFIG[langKey];
    for (let i = 0; i < LEGACY_TCS_PER_LANG; i++) {
      const probKey = PROBLEM_KEYS[i % PROBLEM_KEYS.length];
      const prob = PROBLEMS[probKey];
      const tc = prob.generator();

      legacyQueue.push({
        langKey,
        langName: langInfo.name,
        payload: {
          source_code: prob.solutions[langKey],
          language_id: langInfo.id,
          stdin: tc.stdin,
          expected_output: tc.expected_output
        }
      });
    }
  }

  legacyQueue.sort(() => Math.random() - 0.5);

  const totalSubmissions = legacyQueue.length;
  const latenciesMs = [];
  const perLangLatencies = { c: [], cpp: [], java: [], python: [] };
  const langProgress = { c: 0, cpp: 0, java: 0, python: 0 };
  const langPassed = { c: 0, cpp: 0, java: 0, python: 0 };
  const langStartTimes = { c: null, cpp: null, java: null, python: null };
  const langEndTimes = { c: null, cpp: null, java: null, python: null };

  let completedSubmissions = 0;
  let activeWorkers = 0;
  let queueIndex = 0;

  const startTime = Date.now();
  let lastLogTime = Date.now();
  let lastCompleted = 0;

  const progressInterval = setInterval(() => {
    const elapsedSec = (Date.now() - startTime) / 1000;
    const intervalSec = (Date.now() - lastLogTime) / 1000;
    const intervalTCs = completedSubmissions - lastCompleted;
    const instRate = intervalSec > 0 ? (intervalTCs / intervalSec).toFixed(1) : 0;
    const avgRate = elapsedSec > 0 ? (completedSubmissions / elapsedSec).toFixed(1) : 0;
    const pct = ((completedSubmissions / totalSubmissions) * 100).toFixed(1);

    lastLogTime = Date.now();
    lastCompleted = completedSubmissions;

    process.stdout.write(
      `\r[Legacy Engine] ${completedSubmissions}/${totalSubmissions} Subs (${pct}%) | ` +
      `Instant: ${instRate} sub/s | Avg: ${avgRate} sub/s | ` +
      `Active: ${activeWorkers}/${CONCURRENCY} | ` +
      `[C:${langProgress.c} C++:${langProgress.cpp} Java:${langProgress.java} Py:${langProgress.python}] | ` +
      `Elapsed: ${elapsedSec.toFixed(1)}s   `
    );
  }, 250);

  async function worker() {
    while (queueIndex < legacyQueue.length) {
      const idx = queueIndex++;
      const item = legacyQueue[idx];
      activeWorkers++;

      if (!langStartTimes[item.langKey]) langStartTimes[item.langKey] = Date.now();
      const subStart = Date.now();

      try {
        const res = await fetch(`${targetUrl}/submissions?wait=false&base64_encoded=false`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload)
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errText}`);
        }

        const { token } = await res.json();
        const subResult = await pollSubmission(token, 60);
        const elapsed = Date.now() - subStart;
        latenciesMs.push(elapsed);
        perLangLatencies[item.langKey].push(elapsed);

        completedSubmissions++;
        langProgress[item.langKey]++;
        langEndTimes[item.langKey] = Date.now();

        if (subResult.status?.id === 3) {
          langPassed[item.langKey]++;
        }
      } catch (err) {
        console.error(`\n[Legacy Error] ${item.langKey} submission failed: ${err.message}`);
      } finally {
        activeWorkers--;
      }
    }
  }

  const pool = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    pool.push(worker());
  }

  await Promise.all(pool);
  clearInterval(progressInterval);

  const totalWallClockSec = (Date.now() - startTime) / 1000;
  console.log(`\n\n✔ Legacy Benchmark Complete in ${totalWallClockSec.toFixed(2)} seconds!`);

  const stats = formatStats(latenciesMs, totalWallClockSec, completedSubmissions);
  console.log(`\n=== LEGACY ENGINE PERFORMANCE SUMMARY (AGGREGATE) ===`);
  console.table([
    {
      "Total Submissions": completedSubmissions,
      "Wall Clock Time (s)": stats.wallClockSec,
      "Throughput (sub/sec)": stats.throughputTCsPerSec,
      "Min Latency (ms)": stats.minMs,
      "p50 Latency (ms)": stats.p50Ms,
      "p90 Latency (ms)": stats.p90Ms,
      "p95 Latency (ms)": stats.p95Ms,
      "p99 Latency (ms)": stats.p99Ms,
      "Max Latency (ms)": stats.maxMs
    }
  ]);

  const langSummaries = {};
  console.log(`\n=== LEGACY ENGINE: PER-LANGUAGE ISOLATED BREAKDOWN ===`);
  const langTable = LANG_KEYS.map((k) => {
    const lats = perLangLatencies[k];
    const dur = ((langEndTimes[k] - (langStartTimes[k] || startTime)) / 1000) || totalWallClockSec;
    const lStats = formatStats(lats, dur, langProgress[k]);
    langSummaries[k] = lStats;
    return {
      Language: LANG_CONFIG[k].name,
      "Submissions": langProgress[k],
      "Accepted Subs": langPassed[k],
      "Success Rate": `${((langPassed[k] / (langProgress[k] || 1)) * 100).toFixed(1)}%`,
      "Throughput (sub/s)": lStats.throughputTCsPerSec,
      "p50 Sub (ms)": lStats.p50Ms,
      "p90 Sub (ms)": lStats.p90Ms,
      "Max Sub (ms)": lStats.maxMs
    };
  });
  console.table(langTable);

  return { aggregate: stats, perLanguage: langSummaries };
}

// ==============================================================================
// 3. MAIN RUNNER & SIDE-BY-SIDE ARCHITECTURAL COMPARISON
// ==============================================================================
async function main() {
  console.log(`\n===============================================================================`);
  console.log(`           JUDGE0 PRODUCTION BENCHMARK & COMPARISON SUITE`);
  console.log(`===============================================================================`);
  console.log(`Target Host:       ${targetUrl}`);
  console.log(`Machine Profile:   8 vCPU (Simulated Helper Concurrency = ${CONCURRENCY})`);
  console.log(`Suite Target:      10,000 Test Cases (2,500 C, 2,500 C++, 2,500 Java, 2,500 Python)`);
  console.log(`Legacy Target:     1,000 Test Cases (250 C, 250 C++, 250 Java, 250 Python)`);
  console.log(`Problem Diversity: 10 Distinct DSA Problem Archetypes`);
  console.log(`===============================================================================\n`);

  const healthRes = await fetch(`${targetUrl}/healthz`);
  const health = await healthRes.json();
  if (health.status !== "ok") {
    console.error("Target cluster is not healthy:", health);
    process.exit(1);
  }
  console.log(`Cluster Health Verified: DB=${health.database}, Redis=${health.redis}, Active Workers=${health.workers}`);

  let suiteResults = null;
  let legacyResults = null;

  if (RUN_SUITE) {
    suiteResults = await runSuiteBenchmark();
  }

  if (RUN_LEGACY) {
    legacyResults = await runLegacyBenchmark();
  }

  if (suiteResults && legacyResults) {
    const sAgg = suiteResults.aggregate;
    const lAgg = legacyResults.aggregate;

    console.log(`\n===============================================================================`);
    console.log(`        HEAD-TO-HEAD SCIENTIFIC COMPARISON: PER-LANGUAGE BREAKDOWN`);
    console.log(`===============================================================================`);
    const perLangComparison = LANG_KEYS.map((k) => {
      const sLang = suiteResults.perLanguage[k];
      const lLang = legacyResults.perLanguage[k];
      const speedup = (sLang.throughputTCsPerSec / (lLang.throughputTCsPerSec || 1)).toFixed(2);
      return {
        Language: LANG_CONFIG[k].name,
        "Suite TCs Evaluated": sLang.totalTCs,
        "Suite Throughput (tc/s)": `${sLang.throughputTCsPerSec} tc/s`,
        "Legacy Subs Evaluated": lLang.totalTCs,
        "Legacy Throughput (sub/s)": `${lLang.throughputTCsPerSec} sub/s`,
        "Per-Language Speedup": `${speedup}x Faster`
      };
    });
    console.table(perLangComparison);

    console.log(`\n===============================================================================`);
    console.log(`        AGGREGATE OVERALL ARCHITECTURAL COMPARISON (BALANCED 25% SPLIT)`);
    console.log(`===============================================================================`);
    const overallSpeedup = (sAgg.throughputTCsPerSec / (lAgg.throughputTCsPerSec || 1)).toFixed(2);
    console.table([
      {
        Metric: "Total Test Cases Evaluated",
        "Suite Engine (Compile-Once)": sAgg.totalTCs,
        "Legacy Engine (Compile-Per-Run)": lAgg.totalTCs,
        Advantage: "10x Larger Workload"
      },
      {
        Metric: "Total Wall-Clock Time (s)",
        "Suite Engine (Compile-Once)": `${sAgg.wallClockSec}s`,
        "Legacy Engine (Compile-Per-Run)": `${lAgg.wallClockSec}s`,
        Advantage: `${((sAgg.wallClockSec / (lAgg.wallClockSec * 10)) * 100).toFixed(1)}% of legacy normalized time`
      },
      {
        Metric: "Throughput (Test Cases / Second)",
        "Suite Engine (Compile-Once)": `${sAgg.throughputTCsPerSec} tc/s`,
        "Legacy Engine (Compile-Per-Run)": `${lAgg.throughputTCsPerSec} tc/s`,
        Advantage: `${overallSpeedup}x Higher Throughput`
      },
      {
        Metric: "p50 Latency (ms)",
        "Suite Engine (Compile-Once)": `${sAgg.p50Ms}ms`,
        "Legacy Engine (Compile-Per-Run)": `${lAgg.p50Ms}ms`,
        Advantage: sAgg.p50Ms < lAgg.p50Ms ? "Lower Latency" : "Amortized Compile"
      }
    ]);
  }
}

main().catch((err) => {
  console.error("Benchmark execution failed:", err);
  process.exit(1);
});
