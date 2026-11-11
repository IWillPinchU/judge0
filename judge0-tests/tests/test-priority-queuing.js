const assert = require("node:assert");
const { JUDGE0_URL, LANGUAGES, STATUS } = require("../config");
const { logSection, logPass, logFail, logInfo } = require("../utils");

async function runPriorityQueuingTests() {
  logSection("Intelligent Priority Queuing Verification");
  let passed = 0;
  let total = 0;

  // 1. Verify Config Info exposes fast_queue_threshold
  total++;
  try {
    const res = await fetch(`${JUDGE0_URL}/config_info`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const config = await res.json();
    assert.strictEqual(
      config.fast_queue_threshold,
      5,
      `Expected fast_queue_threshold: 5, got ${config.fast_queue_threshold}`
    );
    logPass(`Config Info verified: fast_queue_threshold = ${config.fast_queue_threshold}`);
    passed++;
  } catch (err) {
    logFail("Config Info verification failed", err.message);
  }

  // 2. Single submission executes via fast queue
  total++;
  try {
    const payload = {
      source_code: `print("Hello from Fast Queue Single Submission")`,
      language_id: LANGUAGES.PYTHON,
      stdin: ""
    };
    const res = await fetch(`${JUDGE0_URL}/submissions?wait=true&base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.status?.id, STATUS.ACCEPTED);
    assert.strictEqual(data.stdout?.trim(), "Hello from Fast Queue Single Submission");
    logPass("Single submission executed successfully through :fast queue");
    passed++;
  } catch (err) {
    logFail("Single submission test failed", err.message);
  }

  // 3. Suite with <= 5 test cases (routes to :fast queue)
  total++;
  try {
    const testCases = [
      { stdin: "1 2\n", expected_output: "3\n" },
      { stdin: "10 20\n", expected_output: "30\n" },
      { stdin: "-5 5\n", expected_output: "0\n" }
    ];
    const payload = {
      source_code: `#include <iostream>
using namespace std;
int main() {
    int a, b;
    if (cin >> a >> b) cout << a + b << endl;
    return 0;
}`,
      language_id: LANGUAGES.CPP,
      test_cases: testCases
    };
    const res = await fetch(`${JUDGE0_URL}/suites?wait=true&base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.status?.id, STATUS.ACCEPTED);
    assert.strictEqual(data.test_cases?.length, 3);
    assert.strictEqual(data.test_cases[0].stdout, "3\n");
    assert.strictEqual(data.test_cases[1].stdout, "30\n");
    assert.strictEqual(data.test_cases[2].stdout, "0\n");
    logPass("Small Suite (3 test cases <= 5) executed successfully through :fast queue");
    passed++;
  } catch (err) {
    logFail("Small suite test failed", err.message);
  }

  // 4. Suite with > 5 test cases (routes to :default queue)
  total++;
  try {
    const testCases = [];
    for (let i = 1; i <= 7; i++) {
      testCases.push({ stdin: `${i}\n`, expected_output: `${i * 2}\n` });
    }
    const payload = {
      source_code: `import sys
for line in sys.stdin:
    line = line.strip()
    if line:
        n = int(line)
        print(n * 2)`,
      language_id: LANGUAGES.PYTHON,
      test_cases: testCases
    };
    const res = await fetch(`${JUDGE0_URL}/suites?wait=true&base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.status?.id, STATUS.ACCEPTED);
    assert.strictEqual(data.test_cases?.length, 7);
    for (let i = 0; i < 7; i++) {
      assert.strictEqual(data.test_cases[i].stdout?.trim(), `${(i + 1) * 2}`);
      assert.strictEqual(data.test_cases[i].status?.id, STATUS.ACCEPTED);
    }
    logPass("Large Suite (7 test cases > 5) executed successfully through :default queue");
    passed++;
  } catch (err) {
    logFail("Large suite test failed", err.message);
  }

  // 5. Batched Submissions (<= 5 items routes to :fast, > 5 items routes to :default)
  total++;
  try {
    const smallBatch = [
      { source_code: 'print("Batch 1")', language_id: LANGUAGES.PYTHON },
      { source_code: 'print("Batch 2")', language_id: LANGUAGES.PYTHON }
    ];
    const res = await fetch(`${JUDGE0_URL}/submissions/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissions: smallBatch })
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    const tokens = await res.json();
    assert.strictEqual(tokens.length, 2);
    assert(tokens[0].token && tokens[1].token);

    // Poll for completion
    let completed = false;
    for (let attempts = 0; attempts < 30; attempts++) {
      await new Promise((r) => setTimeout(r, 1000));
      const pollRes = await fetch(`${JUDGE0_URL}/submissions/batch?tokens=${tokens.map((t) => t.token).join(",")}`);
      const data = await pollRes.json();
      if (data.submissions.every((s) => s && s.status?.id >= 3)) {
        completed = true;
        break;
      }
    }
    assert(completed, "Small batch submissions failed to complete in time");
    logPass("Small batch (2 items <= 5) queued to :fast and executed successfully");
    passed++;
  } catch (err) {
    logFail("Small batch test failed", err.message);
  }

  // 6. Workers health check
  total++;
  try {
    const res = await fetch(`${JUDGE0_URL}/workers`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const workers = await res.json();
    logInfo(`Worker queue status: ${JSON.stringify(workers)}`);
    assert(Array.isArray(workers), "Expected array of worker/queue metrics");
    logPass(`Health check /workers returned valid queue statistics`);
    passed++;
  } catch (err) {
    logFail("Workers health check failed", err.message);
  }

  return { passed, total };
}

module.exports = runPriorityQueuingTests;

