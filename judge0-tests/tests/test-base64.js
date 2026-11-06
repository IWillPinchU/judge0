const assert = require("node:assert");
const { JUDGE0_URL, LANGUAGES, STATUS } = require("../config");
const { logSection, logPass, logFail, toBase64, fromBase64 } = require("../utils");

async function runBase64Tests() {
  logSection("Testing 'base64_encoded' Parameter (true, false, omitted)");
  let passed = 0;
  let total = 0;

  // Test 1: base64_encoded=true
  total++;
  try {
    const rawCode = "#include <iostream>\nusing namespace std;\nint main() { cout << \"B64_TRUE_SUCCESS\"; return 0; }";
    const rawExpected = "B64_TRUE_SUCCESS";

    const payload = {
      source_code: toBase64(rawCode),
      language_id: LANGUAGES.CPP,
      test_cases: [
        {
          expected_output: toBase64(rawExpected)
        }
      ]
    };

    const res = await fetch(`${JUDGE0_URL}/suites?wait=true&base64_encoded=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();

    assert.strictEqual(data.status?.id, STATUS.ACCEPTED);
    assert.ok(data.test_cases?.length === 1);

    const b64Stdout = data.test_cases[0].stdout;
    assert.ok(b64Stdout, "stdout should be returned");
    const decodedStdout = fromBase64(b64Stdout);

    assert.strictEqual(decodedStdout, "B64_TRUE_SUCCESS", `Decoded stdout should match. Got: '${decodedStdout}'`);

    logPass("base64_encoded=true accepts base64 inputs and returns base64 encoded outputs");
    passed++;
  } catch (err) {
    logFail("base64_encoded=true failed", err.message);
  }

  // Test 2: base64_encoded=false
  total++;
  try {
    const rawCode = "#include <iostream>\nusing namespace std;\nint main() { cout << \"B64_FALSE_SUCCESS\"; return 0; }";
    const rawExpected = "B64_FALSE_SUCCESS";

    const payload = {
      source_code: rawCode,
      language_id: LANGUAGES.CPP,
      test_cases: [
        {
          expected_output: rawExpected
        }
      ]
    };

    const res = await fetch(`${JUDGE0_URL}/suites?wait=true&base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();

    assert.strictEqual(data.status?.id, STATUS.ACCEPTED);
    const stdout = data.test_cases[0].stdout;
    assert.strictEqual(stdout, "B64_FALSE_SUCCESS", `Plaintext stdout should match directly. Got: '${stdout}'`);

    logPass("base64_encoded=false accepts plaintext and returns raw plaintext output");
    passed++;
  } catch (err) {
    logFail("base64_encoded=false failed", err.message);
  }

  // Test 3: base64_encoded omitted (Verifying plaintext mode with DISABLE_IMPLICIT_BASE64_ENCODING=true)
  total++;
  try {
    const rawCode = "print('B64_OMITTED_TEST')";
    const payload = {
      source_code: rawCode,
      language_id: LANGUAGES.PYTHON,
      test_cases: [{ expected_output: "B64_OMITTED_TEST\n" }]
    };

    const res = await fetch(`${JUDGE0_URL}/suites?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();

    assert.strictEqual(data.status?.id, STATUS.ACCEPTED);
    assert.strictEqual(data.test_cases[0].stdout, "B64_OMITTED_TEST\n");

    logPass("base64_encoded omitted correctly defaults to plaintext when DISABLE_IMPLICIT_BASE64_ENCODING=true");
    passed++;
  } catch (err) {
    logFail("base64_encoded omitted failed", err.message);
  }

  return { passed, total };
}

if (require.main === module) {
  runBase64Tests().catch(console.error);
}

module.exports = runBase64Tests;
