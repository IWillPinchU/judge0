const { JUDGE0_URL, STATUS } = require("./config");
const { generateSumTestCase } = require("./generators");

async function pollLegacyBatch(tokens, intervalMs = 1000) {
  // Chunk tokens into groups of 50 (Judge0 limit for batch query)
  const chunk1 = tokens.slice(0, 50).join(",");
  const chunk2 = tokens.slice(50, 100).join(",");

  while (true) {
    const [res1, res2] = await Promise.all([
      fetch(`${JUDGE0_URL}/submissions/batch?tokens=${chunk1}&base64_encoded=false&fields=token,status_id,time,memory`),
      fetch(`${JUDGE0_URL}/submissions/batch?tokens=${chunk2}&base64_encoded=false&fields=token,status_id,time,memory`)
    ]);

    const data1 = (await res1.json()).submissions;
    const data2 = (await res2.json()).submissions;
    const all = [...data1, ...data2];

    const completed = all.filter(s => s.status_id !== STATUS.IN_QUEUE && s.status_id !== STATUS.PROCESSING);
    process.stdout.write(`\r[LEGACY BATCH PROGRESS] Completed: ${completed.length}/100 submissions...`);

    if (completed.length === tokens.length) {
      console.log("");
      return all;
    }

    await new Promise(r => setTimeout(r, intervalMs));
  }
}

async function runBenchmark() {
  console.log("\n===============================================================================");
  console.log("       100 TEST CASES BENCHMARK: /submissions/batch vs /suites");
  console.log("===============================================================================");

  const cppSource = `#include <iostream>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    long long a, b;
    if (cin >> a >> b) cout << a + b << "\n";
    return 0;
}`;

  // Generate 100 identical test cases
  const testCases = [];
  for (let i = 0; i < 100; i++) {
    testCases.push(generateSumTestCase());
  }

  // ===========================================================================
  // 1. LEGACY /submissions/batch (2 Batches of 50 Submissions)
  // ===========================================================================
  console.log("\n--- PHASE 1: LEGACY /submissions/batch (2 x 50 Submissions = 100 Compiles) ---");
  const batchA = testCases.slice(0, 50).map(tc => ({
    source_code: cppSource,
    language_id: 54,
    stdin: tc.stdin,
    expected_output: tc.expected_output
  }));
  const batchB = testCases.slice(50, 100).map(tc => ({
    source_code: cppSource,
    language_id: 54,
    stdin: tc.stdin,
    expected_output: tc.expected_output
  }));

  const t0Legacy = Date.now();

  // Fire off both batch calls
  const [resA, resB] = await Promise.all([
    fetch(`${JUDGE0_URL}/submissions/batch?base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissions: batchA })
    }),
    fetch(`${JUDGE0_URL}/submissions/batch?base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissions: batchB })
    })
  ]);

  const tokensA = (await resA.json()).map(s => s.token);
  const tokensB = (await resB.json()).map(s => s.token);
  const allTokens = [...tokensA, ...tokensB];

  console.log(`Fired 2 batch requests. Received ${allTokens.length} submission tokens in ${Date.now() - t0Legacy}ms.`);
  console.log("Waiting for worker to compile and execute all 100 separate submissions...");

  const legacyResults = await pollLegacyBatch(allTokens, 1000);
  const legacyTotalSec = ((Date.now() - t0Legacy) / 1000).toFixed(2);
  const legacyAccepted = legacyResults.filter(r => r.status_id === STATUS.ACCEPTED).length;

  console.log(`Legacy Finished in: ${legacyTotalSec} seconds | Accepted: ${legacyAccepted}/100`);

  // ===========================================================================
  // 2. NEW /suites ENGINE (1 Suite with 100 Test Cases = 1 Compile)
  // ===========================================================================
  console.log("\n--- PHASE 2: NEW /suites ENGINE (1 Suite with 100 Test Cases = 1 Compile) ---");
  const t0Suite = Date.now();

  const suiteRes = await fetch(`${JUDGE0_URL}/suites?base64_encoded=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_code: cppSource,
      language_id: 54,
      test_cases: testCases
    })
  });

  const { suite_token } = await suiteRes.json();
  console.log(`Fired 1 suite request. Received suite_token: ${suite_token} in ${Date.now() - t0Suite}ms.`);
  console.log("Waiting for worker to compile once and execute all 100 test cases...");

  let suiteResult;
  while (true) {
    const sPoll = await fetch(`${JUDGE0_URL}/suites/${suite_token}?base64_encoded=false&fields=status,test_cases`);
    suiteResult = await sPoll.json();
    const statusId = suiteResult.status?.id;

    if (statusId !== STATUS.IN_QUEUE && statusId !== STATUS.PROCESSING) {
      break;
    }
    process.stdout.write(`\r[SUITE PROGRESS] Running 100 test cases against pre-compiled binary...`);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log("");

  const suiteTotalSec = ((Date.now() - t0Suite) / 1000).toFixed(2);
  const suiteAccepted = suiteResult.test_cases?.filter(tc => (tc.status?.id || tc.status_id) === STATUS.ACCEPTED).length || 0;

  console.log(`Suite Engine Finished in: ${suiteTotalSec} seconds | Accepted: ${suiteAccepted}/100`);

  // ===========================================================================
  // 3. COMPARISON REPORT
  // ===========================================================================
  console.log("\n===============================================================================");
  console.log("                      FINAL 100-TEST-CASE COMPARISON REPORT");
  console.log("===============================================================================");
  console.log(`Workload:                     100 Test Cases (Identical C++ Code & Inputs)`);
  console.log(`Legacy /submissions/batch:    ${legacyTotalSec} seconds (Compiles: 100 times, Rate: ${(100 / legacyTotalSec).toFixed(1)} tests/s)`);
  console.log(`New /suites Engine:           ${suiteTotalSec} seconds (Compiles: 1 time,    Rate: ${(100 / suiteTotalSec).toFixed(1)} tests/s)`);
  console.log("-------------------------------------------------------------------------------");
  const speedup = (legacyTotalSec / suiteTotalSec).toFixed(2);
  const timeSaved = (legacyTotalSec - suiteTotalSec).toFixed(2);
  console.log(`Speedup:                      ${speedup}x FASTER`);
  console.log(`Time Saved:                   ${timeSaved} seconds saved on just 100 test cases!`);
  console.log(`Compiler Overhead Saved:      99 redundant G++ compiler invocations eliminated`);
  console.log("===============================================================================\n");
}

runBenchmark().catch(console.error);

