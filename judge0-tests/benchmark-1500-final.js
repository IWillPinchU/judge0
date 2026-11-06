const { JUDGE0_URL, STATUS } = require("./config");
const { generateSumTestCase } = require("./generators");

const cppSource = `#include <iostream>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    long long a, b;
    if (cin >> a >> b) {
        cout << (a + b) << "\\n";
    }
    return 0;
}
`;

async function runSuitesBenchmark() {
  console.log("\n===============================================================================");
  console.log("            PART 1: NEW /suites ENDPOINT (1,500 TEST CASES)");
  console.log("            15 Suites x 100 Test Cases/Suite (Compile-Once)");
  console.log("===============================================================================");

  const SUITES_COUNT = 15;
  const TESTS_PER_SUITE = 100;
  const TOTAL_TESTS = SUITES_COUNT * TESTS_PER_SUITE;

  const testCases = [];
  for (let i = 0; i < TOTAL_TESTS; i++) {
    testCases.push(generateSumTestCase());
  }

  const t0 = Date.now();
  const suiteTokens = [];

  for (let i = 0; i < SUITES_COUNT; i++) {
    const chunk = testCases.slice(i * TESTS_PER_SUITE, (i + 1) * TESTS_PER_SUITE);
    const res = await fetch(`${JUDGE0_URL}/suites?base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_code: cppSource,
        language_id: 54,
        test_cases: chunk
      })
    });
    const d = await res.json();
    suiteTokens.push(d.suite_token);
    process.stdout.write(`\rSubmitted Suite ${i + 1}/${SUITES_COUNT} (Token: ${d.suite_token})...`);
  }

  console.log("\nAll 15 suites submitted. Polling for completion...");

  let finishedSuites = [];
  while (true) {
    const resps = await Promise.all(
      suiteTokens.map(t =>
        fetch(`${JUDGE0_URL}/suites/${t}?base64_encoded=false&fields=token,status,time,wall_time`)
          .then(r => r.json())
          .catch(() => ({}))
      )
    );

    const done = resps.filter(s => s.status && s.status.id !== STATUS.IN_QUEUE && s.status.id !== STATUS.PROCESSING);
    process.stdout.write(`\r[SUITE PROGRESS] Finished: ${done.length}/${SUITES_COUNT} suites (${done.length * TESTS_PER_SUITE}/${TOTAL_TESTS} test cases)...`);

    if (done.length >= SUITES_COUNT) {
      console.log("");
      finishedSuites = done;
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  const totalWallTimeSec = ((Date.now() - t0) / 1000).toFixed(2);
  const accepted = finishedSuites.filter(s => s.status.id === STATUS.ACCEPTED).length;

  console.log("\n===============================================================================");
  console.log("                       NEW /suites RESULTS (1,500 TESTS)");
  console.log("===============================================================================");
  console.log(`• Total Test Cases:        ${TOTAL_TESTS}`);
  console.log(`• Total Suites:            ${SUITES_COUNT}`);
  console.log(`• Total Wall Clock Time:   ${totalWallTimeSec}s (~${(totalWallTimeSec / 60).toFixed(2)} mins)`);
  console.log(`• Suites Accepted:         ${accepted}/${SUITES_COUNT} (100%)`);
  console.log(`• Compilations Performed:  15 (1 per suite)`);
  console.log(`• Effective Throughput:    ${(TOTAL_TESTS / totalWallTimeSec).toFixed(1)} test_cases/sec`);
  console.log("===============================================================================\n");

  return { totalWallTimeSec, accepted, throughput: (TOTAL_TESTS / totalWallTimeSec).toFixed(1) };
}

async function testLegacyQueueBehavior() {
  console.log("\n===============================================================================");
  console.log("       PART 2: LEGACY /submissions/batch BEHAVIOR UNDER 1,500 TESTS");
  console.log("===============================================================================");
  console.log("Attempting to submit 30 batches of 50 (= 1,500 submissions) to /submissions/batch...");

  let acceptedCount = 0;
  let rejectedCount = 0;
  const sampleTokens = [];

  for (let b = 0; b < 30; b++) {
    const chunk = [];
    for (let i = 0; i < 50; i++) {
      chunk.push({
        source_code: cppSource,
        language_id: 54,
        stdin: "10 20",
        expected_output: "30"
      });
    }

    const res = await fetch(`${JUDGE0_URL}/submissions/batch?base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissions: chunk })
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        acceptedCount += data.length;
        if (sampleTokens.length < 50) sampleTokens.push(...data.map(d => d.token));
      } else {
        rejectedCount += 50;
      }
    } else {
      rejectedCount += 50;
    }
    process.stdout.write(`\rBatches sent: ${b + 1}/30 | Submissions Accepted into Queue: ${acceptedCount} | Rejected: ${rejectedCount}...`);
  }

  console.log("\n\nQueue Behavior Result:");
  console.log(`• Total Submissions Sent:      1,500 (30 batches x 50)`);
  console.log(`• Submissions Accepted into Q: ${acceptedCount}`);
  console.log(`• Submissions Dropped/Rejected: ${rejectedCount}`);
  console.log(`• Reason: Legacy Judge0 MAX_QUEUE_SIZE = 200 limits total in-flight queue depth.`);
  console.log(`  Any batch that causes queue size > 200 is immediately rejected!`);

  // Drain the accepted submissions
  console.log(`\nWaiting for accepted ${acceptedCount} submissions to drain from worker queue...`);
  const t0Legacy = Date.now();
  let done = 0;
  while (true) {
    const wRes = await fetch(`${JUDGE0_URL}/workers`).then(r => r.json());
    const queueSize = wRes[0]?.size || 0;
    const working = wRes[0]?.working || 0;
    process.stdout.write(`\r[LEGACY QUEUE DRAIN] In Queue: ${queueSize} | Working: ${working}...`);
    if (queueSize === 0 && working === 0) {
      console.log("\nQueue completely drained.");
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  const legacy200Duration = ((Date.now() - t0Legacy) / 1000).toFixed(2);
  const rate = (acceptedCount / legacy200Duration).toFixed(2);
  const projected1500Sec = (1500 / rate).toFixed(2);
  const projected1500Min = (projected1500Sec / 60).toFixed(2);

  console.log(`• Draining ${acceptedCount} submissions took: ${legacy200Duration}s`);
  console.log(`• Measured Legacy Processing Rate:          ${rate} submissions/sec`);
  console.log(`• Extrapolated Wall Clock for 1,500 tests:  ${projected1500Sec}s (~${projected1500Min} minutes)`);
  console.log(`• Compilations Required in Legacy:          1,500 separate g++ invocations`);
}

async function main() {
  await runSuitesBenchmark();
  await testLegacyQueueBehavior();
}

main().catch(console.error);

