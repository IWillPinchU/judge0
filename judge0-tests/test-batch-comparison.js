const { JUDGE0_URL } = require("./config");
const { generateSumTestCase } = require("./generators");

async function runBatchTest() {
  console.log("\n===============================================================================");
  console.log("       HEAD-TO-HEAD: LEGACY /submissions/batch vs NEW SUITE ENGINE");
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

  // 1. Generate 100 test cases
  const testCases = [];
  for (let i = 0; i < 100; i++) {
    testCases.push(generateSumTestCase());
  }

  // ---------------------------------------------------------------------------
  // STEP 1: Attempt to send 100 submissions in ONE batch to verify Judge0 limit
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 1] Attempting to send 100 submissions to /submissions/batch in one request...");
  const single100Batch = {
    submissions: testCases.map(tc => ({
      source_code: cppSource,
      language_id: 54,
      stdin: tc.stdin,
      expected_output: tc.expected_output
    }))
  };

  const attemptRes = await fetch(`${JUDGE0_URL}/submissions/batch?base64_encoded=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(single100Batch)
  });

  const attemptBody = await attemptRes.text();
  console.log(`HTTP Status: ${attemptRes.status}`);
  console.log(`Server Response: ${attemptBody}`);

  // ---------------------------------------------------------------------------
  // STEP 2: Send 100 test cases via Legacy /submissions/batch (2 batches of 50)
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 2] Sending 100 test cases via /submissions/batch (2 batches of 50)...");
  const batch1 = testCases.slice(0, 50).map(tc => ({
    source_code: cppSource,
    language_id: 54,
    stdin: tc.stdin,
    expected_output: tc.expected_output
  }));
  const batch2 = testCases.slice(50, 100).map(tc => ({
    source_code: cppSource,
    language_id: 54,
    stdin: tc.stdin,
    expected_output: tc.expected_output
  }));

  const t0Legacy = Date.now();

  const res1 = await fetch(`${JUDGE0_URL}/submissions/batch?base64_encoded=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissions: batch1 })
  });
  const data1 = await res1.json();

  const res2 = await fetch(`${JUDGE0_URL}/submissions/batch?base64_encoded=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissions: batch2 })
  });
  const data2 = await res2.json();

  const allTokens = [...data1.map(s => s.token), ...data2.map(s => s.token)];
  console.log(`Submitted 100 legacy submissions. Tokens received: ${allTokens.length}`);
  console.log("Polling /submissions/batch until all 100 compile and execute...");

  let finishedCount = 0;
  while (true) {
    // Poll batch 1 (first 50)
    const tokensChunk1 = allTokens.slice(0, 50).join(",");
    const poll1 = await fetch(`${JUDGE0_URL}/submissions/batch?tokens=${tokensChunk1}&base64_encoded=false&fields=status_id`);
    const results1 = (await poll1.json()).submissions;

    // Poll batch 2 (second 50)
    const tokensChunk2 = allTokens.slice(50, 100).join(",");
    const poll2 = await fetch(`${JUDGE0_URL}/submissions/batch?tokens=${tokensChunk2}&base64_encoded=false&fields=status_id`);
    const results2 = (await poll2.json()).submissions;

    const allResults = [...results1, ...results2];
    finishedCount = allResults.filter(r => r.status_id !== 1 && r.status_id !== 2).length;

    process.stdout.write(`\r[LEGACY PROGRESS] Finished: ${finishedCount}/100 submissions (each compiling separately)...`);
    if (finishedCount === 100) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  const legacyDurationSec = ((Date.now() - t0Legacy) / 1000).toFixed(2);
  console.log(`\nLegacy /submissions/batch finished in: ${legacyDurationSec} seconds (100 separate compilations)`);

  // ---------------------------------------------------------------------------
  // STEP 3: Send the exact same 100 test cases via New Suite Engine (1 Suite)
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 3] Sending the exact same 100 test cases to new /suites (1 compilation)...");
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
  console.log(`Submitted Suite: ${suite_token}. Polling for completion...`);

  while (true) {
    const sPoll = await fetch(`${JUDGE0_URL}/suites/${suite_token}?base64_encoded=false&fields=status,test_cases`);
    const sData = await sPoll.json();
    if (sData.status?.id !== 1 && sData.status?.id !== 2) {
      break;
    }
    process.stdout.write(`\r[SUITE PROGRESS] Evaluating 100 test cases against pre-compiled binary...`);
    await new Promise(r => setTimeout(r, 1000));
  }

  const suiteDurationSec = ((Date.now() - t0Suite) / 1000).toFixed(2);
  console.log(`\nNew /suites finished in: ${suiteDurationSec} seconds (1 compilation)`);

  // ---------------------------------------------------------------------------
  // STEP 4: Head-to-Head Comparison Report
  // ---------------------------------------------------------------------------
  console.log("\n===============================================================================");
  console.log("                     HEAD-TO-HEAD BENCHMARK COMPARISON");
  console.log("===============================================================================");
  console.log(`Test Cases Evaluated:       100 test cases (Identical C++ Code & Inputs)`);
  console.log(`Legacy /submissions/batch:  ${legacyDurationSec} seconds (${(100 / legacyDurationSec).toFixed(1)} tests/sec)`);
  console.log(`New /suites (Compile-Once): ${suiteDurationSec} seconds (${(100 / suiteDurationSec).toFixed(1)} tests/sec)`);
  const speedup = (legacyDurationSec / suiteDurationSec).toFixed(2);
  console.log(`Speedup Factor:             ${speedup}x FASTER`);
  console.log(`Compilation Savings:        99 wasted compiler runs eliminated!`);
  console.log("===============================================================================\n");
}

runBatchTest().catch(console.error);

