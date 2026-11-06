const assert = require("node:assert");
const { JUDGE0_URL, LANGUAGES, STATUS } = require("../config");
const { logSection, logPass, logFail, pollSuite } = require("../utils");

async function runWaitTests() {
  logSection("Testing 'wait' Parameter (true, false, omitted)");
  let passed = 0;
  let total = 0;

  // Test 1: wait=true (Synchronous execution)
  total++;
  try {
    const payload = {
      source_code: "#include <stdio.h>\nint main() { printf(\"WAIT_TRUE_OK\"); return 0; }",
      language_id: LANGUAGES.C,
      test_cases: [{ expected_output: "WAIT_TRUE_OK" }]
    };

    const start = Date.now();
    const res = await fetch(`${JUDGE0_URL}/suites?wait=true&base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const elapsed = Date.now() - start;

    assert.strictEqual(res.status, 201, `Expected status 201, got ${res.status}`);
    const data = await res.json();

    assert.ok(data.token, "Response should have suite token");
    assert.strictEqual(data.status?.id, STATUS.ACCEPTED, `Expected status Accepted (3), got ${data.status?.id}`);
    assert.ok(Array.isArray(data.test_cases), "Response should have test_cases array populated");
    assert.strictEqual(data.test_cases[0]?.stdout, "WAIT_TRUE_OK", `Expected stdout 'WAIT_TRUE_OK', got '${data.test_cases[0]?.stdout}'`);

    logPass(`wait=true returned complete results synchronously in ${elapsed}ms`);
    passed++;
  } catch (err) {
    logFail("wait=true failed", err.message);
  }

  // Test 2: wait=false (Asynchronous execution)
  total++;
  try {
    const payload = {
      source_code: "#include <stdio.h>\nint main() { printf(\"WAIT_FALSE_OK\"); return 0; }",
      language_id: LANGUAGES.C,
      test_cases: [{ expected_output: "WAIT_FALSE_OK" }]
    };

    const start = Date.now();
    const res = await fetch(`${JUDGE0_URL}/suites?wait=false&base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const elapsed = Date.now() - start;

    assert.strictEqual(res.status, 201);
    const initial = await res.json();

    assert.ok(initial.suite_token, "Async response must include suite_token immediately");
    assert.ok(initial.test_cases?.[0]?.token, "Async response must include individual test case tokens");
    assert.ok(elapsed < 2000, `Async response should return quickly (< 2000ms), took ${elapsed}ms`);

    // Poll for the completed result
    const completed = await pollSuite(initial.suite_token, "base64_encoded=false");
    assert.strictEqual(completed.status?.id, STATUS.ACCEPTED);
    assert.strictEqual(completed.test_cases[0]?.stdout, "WAIT_FALSE_OK");

    logPass(`wait=false returned tokens in ${elapsed}ms and finished via poll in background`);
    passed++;
  } catch (err) {
    logFail("wait=false failed", err.message);
  }

  // Test 3: wait omitted (Defaults to async)
  total++;
  try {
    const payload = {
      source_code: "print('WAIT_OMITTED_OK')",
      language_id: LANGUAGES.PYTHON,
      test_cases: [{ expected_output: "WAIT_OMITTED_OK\n" }]
    };

    const res = await fetch(`${JUDGE0_URL}/suites?base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 201);
    const initial = await res.json();

    assert.ok(initial.suite_token, "Omitted wait should default to async and return suite_token");
    const completed = await pollSuite(initial.suite_token, "base64_encoded=false");
    assert.strictEqual(completed.status?.id, STATUS.ACCEPTED);

    logPass("Omitted 'wait' defaults to async and completes successfully");
    passed++;
  } catch (err) {
    logFail("Omitted wait failed", err.message);
  }

  // Test 4: wait=true with Compilation Error (Fast short-circuit)
  total++;
  try {
    const payload = {
      source_code: "int main() { invalid syntax here !@#$ }",
      language_id: LANGUAGES.CPP,
      test_cases: [{ expected_output: "something" }]
    };

    const res = await fetch(`${JUDGE0_URL}/suites?wait=true&base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();

    assert.strictEqual(data.status?.id, STATUS.COMPILATION_ERROR, "Should have status Compilation Error (6)");
    assert.ok(data.compile_output && data.compile_output.length > 0, "compile_output should contain error text");

    logPass("wait=true with Compilation Error short-circuits instantly");
    passed++;
  } catch (err) {
    logFail("Compilation error short-circuit failed", err.message);
  }

  return { passed, total };
}

if (require.main === module) {
  runWaitTests().catch(console.error);
}

module.exports = runWaitTests;
