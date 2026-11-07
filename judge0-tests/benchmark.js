const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { JUDGE0_URL, LANGUAGES } = require("./config");
const { generateTestSuite, generateKadaneTestCase } = require("./generators");
const { pollSuite } = require("./utils");

const args = process.argv.slice(2);

function getArg(flag, defaultValue = null) {
  const arg = args.find((a) => a.startsWith(`--${flag}=`));
  if (arg) return arg.split("=")[1];
  const idx = args.indexOf(`--${flag}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultValue;
}

const engine = getArg("engine", "suite");
const totalTests = parseInt(getArg("count", "1000"), 10);
const concurrency = parseInt(getArg("concurrency", "12"), 10);
const targetUrl = process.env.JUDGE0_URL || "http://localhost:23580";
const isMatrix = args.includes("--matrix");
const isReportOnly = args.includes("--report");

const RESULTS_DIR = path.join(__dirname, "benchmark_results");
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

function formatStats(latencies, wallTimeSec, totalTCs) {
  latencies.sort((a, b) => a - b);
  const p = (pct) => latencies[Math.floor(latencies.length * (pct / 100))] || 0;
  return {
    wallClockSec: parseFloat(wallTimeSec.toFixed(2)),
    throughputTCsPerSec: parseFloat((totalTCs / wallTimeSec).toFixed(2)),
    p50Ms: p(50),
    p90Ms: p(90),
    p95Ms: p(95),
    p99Ms: p(99),
    maxMs: latencies[latencies.length - 1] || 0
  };
}

async function runSingleBenchmark(engineType, count, conc) {
  console.log(`\n===============================================================================`);
  console.log(`  RUNNING BENCHMARK: Engine=${engineType.toUpperCase()}, Count=${count}, Concurrency=${conc}`);
  console.log(`  Target: ${targetUrl}`);
  console.log(`===============================================================================\n`);

  const tStart = Date.now();
  const latencies = [];

  if (engineType === "suite") {
    // 100 test cases per suite
    const numSuites = Math.ceil(count / 100);
    console.log(`Generating ${numSuites} suites (100 test cases each)...`);

    const suites = [];
    for (let i = 0; i < numSuites; i++) {
      suites.push(generateTestSuite(LANGUAGES.CPP, 100, generateKadaneTestCase));
    }

    let completed = 0;
    const running = new Set();
    let idx = 0;

    async function dispatchNext() {
      if (idx >= suites.length) return;
      const curIdx = idx++;
      const payload = suites[curIdx];

      const suiteStart = Date.now();
      const promise = (async () => {
        try {
          const res = await fetch(`${targetUrl}/suites?wait=false&base64_encoded=false`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const { token } = await res.json();
          await pollSuite(targetUrl, token, 120, 200);
          latencies.push(Date.now() - suiteStart);
          completed++;
          process.stdout.write(`\r[Suite Engine] Progress: ${completed}/${numSuites} suites completed...`);
        } catch (err) {
          console.error(`\nSuite ${curIdx} error:`, err.message);
        }
      })();

      running.add(promise);
      promise.finally(() => running.delete(promise));

      if (running.size >= conc) {
        await Promise.race(running);
      }
      await dispatchNext();
    }

    const initialBatches = [];
    for (let i = 0; i < conc && i < numSuites; i++) {
      initialBatches.push(dispatchNext());
    }
    await Promise.all(initialBatches);
    await Promise.all(running);

    const wallSec = (Date.now() - tStart) / 1000;
    console.log(`\n\n✔ Benchmark Completed in ${wallSec.toFixed(2)}s`);
    const stats = formatStats(latencies, wallSec, completed * 100);
    console.table([stats]);
    return stats;
  } else {
    // Legacy API: submissions/batch
    console.log(`Running Legacy Batch API with ${count} total submissions...`);
    // Legacy drip-feed in batches of 50
    const batchSize = 50;
    const numBatches = Math.ceil(count / batchSize);
    let completed = 0;

    for (let b = 0; b < numBatches; b++) {
      const curBatchSize = Math.min(batchSize, count - completed);
      const submissions = [];
      for (let i = 0; i < curBatchSize; i++) {
        const tc = generateKadaneTestCase();
        submissions.push({
          language_id: LANGUAGES.CPP,
          source_code: `#include <iostream>\nusing namespace std;\nint main() { int n; if (cin >> n) { long long s=0,m=-1e18,x; for(int i=0;i<n;++i){cin>>x; s=max(x, s+x); m=max(m, s);} cout << m << endl; } return 0; }`,
          stdin: tc.stdin,
          expected_output: tc.expected_output
        });
      }

      const bStart = Date.now();
      const res = await fetch(`${targetUrl}/submissions/batch?base64_encoded=false`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissions })
      });
      const tokens = (await res.json()).map((s) => s.token);

      // Poll tokens
      let done = false;
      while (!done) {
        await new Promise((r) => setTimeout(r, 400));
        const check = await fetch(`${targetUrl}/submissions/batch?tokens=${tokens.join(",")}&base64_encoded=false`);
        const subList = (await check.json()).submissions;
        done = subList.every((s) => s.status?.id >= 3);
      }
      latencies.push(Date.now() - bStart);
      completed += curBatchSize;
      process.stdout.write(`\r[Legacy API] Progress: ${completed}/${count} submissions completed...`);
    }

    const wallSec = (Date.now() - tStart) / 1000;
    console.log(`\n\n✔ Legacy Benchmark Completed in ${wallSec.toFixed(2)}s`);
    const stats = formatStats(latencies, wallSec, completed);
    console.table([stats]);
    return stats;
  }
}

async function runMatrix() {
  const TIERS = [2, 4, 8, 12, 16, 24];
  console.log(`Starting Full Tier Matrix Evaluation: ${TIERS.join(", ")}`);
  for (const tier of TIERS) {
    console.log(`\nSetting deployment COUNT=${tier}...`);
    execSync(`kubectl set env deployment/judge0-worker COUNT=${tier} -n judge0`);
    execSync(`kubectl rollout status deployment/judge0-worker -n judge0`);
    await runSingleBenchmark("suite", 5000, tier);
  }
}

async function main() {
  if (isReportOnly) {
    console.log("Generating report from benchmark results in:", RESULTS_DIR);
    // Print summary
    return;
  }

  if (isMatrix) {
    await runMatrix();
  } else {
    await runSingleBenchmark(engine, totalTests, concurrency);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

