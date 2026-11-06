const assert = require("node:assert");
const { JUDGE0_URL, LANGUAGES, STATUS } = require("../config");
const { logSection, logPass, logFail, pollSuite } = require("../utils");

async function runFieldsTests() {
  logSection("Testing 'fields' Parameter (present, omitted, invalid)");
  let passed = 0;
  let total = 0;

  // First create a suite to query
  const createRes = await fetch(`${JUDGE0_URL}/suites?wait=true&base64_encoded=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_code: "print('FIELDS_TEST')",
      language_id: LANGUAGES.PYTHON,
      test_cases: [{ expected_output: "FIELDS_TEST\n" }]
    })
  });
  const suiteData = await createRes.json();
  const suiteToken = suiteData.token;
  const testCaseToken = suiteData.test_cases[0].token;

  // Test 1: fields specified on Suite (fields=token,status)
  total++;
  try {
    const res = await fetch(`${JUDGE0_URL}/suites/${suiteToken}?fields=token,status&base64_encoded=false`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    const keys = Object.keys(data).sort();
    assert.deepStrictEqual(keys, ["status", "token"], `Expected only [status, token], got [${keys.join(", ")}]`);
    assert.strictEqual(data.status.id, STATUS.ACCEPTED);

    logPass(`fields=token,status returned strictly only the requested fields: [${keys.join(", ")}]`);
    passed++;
  } catch (err) {
    logFail("Suite fields filtering failed", err.message);
  }

  // Test 2: fields specified on SuiteTestCase (fields=token,stdout,time)
  total++;
  try {
    const res = await fetch(`${JUDGE0_URL}/suites/test_cases/${testCaseToken}?fields=token,stdout,time&base64_encoded=false`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    const keys = Object.keys(data).sort();
    assert.deepStrictEqual(keys, ["stdout", "time", "token"], `Expected only [stdout, time, token], got [${keys.join(", ")}]`);
    assert.strictEqual(data.stdout, "FIELDS_TEST\n");

    logPass(`test_cases/:token?fields=token,stdout,time returned strictly: [${keys.join(", ")}]`);
    passed++;
  } catch (err) {
    logFail("TestCase fields filtering failed", err.message);
  }

  // Test 3: fields omitted (Returns full suite fields)
  total++;
  try {
    const res = await fetch(`${JUDGE0_URL}/suites/${suiteToken}?base64_encoded=false`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.ok(data.token, "Must have token");
    assert.ok(data.status, "Must have status");
    assert.ok(data.language, "Must have language");
    assert.ok(data.test_cases, "Must have test_cases array");
    assert.ok(data.test_cases[0].memory !== undefined, "Test case must have memory");
    assert.ok(data.test_cases[0].time !== undefined, "Test case must have time");

    logPass("fields omitted returned complete standard default fields");
    passed++;
  } catch (err) {
    logFail("Omitted fields test failed", err.message);
  }

  // Test 4: Invalid field specified (Should return 400 Bad Request)
  total++;
  try {
    const res = await fetch(`${JUDGE0_URL}/suites/${suiteToken}?fields=token,non_existent_fake_field&base64_encoded=false`);
    assert.strictEqual(res.status, 400, `Expected 400 Bad Request, got ${res.status}`);
    const data = await res.json();
    assert.ok(data.error && data.error.includes("invalid fields"), "Error message should report invalid fields");

    logPass("Invalid field name correctly returned HTTP 400 Bad Request with descriptive error");
    passed++;
  } catch (err) {
    logFail("Invalid fields test failed", err.message);
  }

  return { passed, total };
}

if (require.main === module) {
  runFieldsTests().catch(console.error);
}

module.exports = runFieldsTests;
