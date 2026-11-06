const assert = require("node:assert");
const { JUDGE0_URL, CALLBACK_PORT, LANGUAGES, STATUS } = require("../config");
const { startCallbackServer, logSection, logPass, logFail, logInfo } = require("../utils");

async function runCallbackTests(callbackHostIp) {
  logSection(`Testing Callbacks via Host IP: ${callbackHostIp}`);

  let receiver;
  try {
    receiver = await startCallbackServer(CALLBACK_PORT);
  } catch (err) {
    logFail(`Could not bind callback listener on port ${CALLBACK_PORT}: ${err.message}`);
    return { passed: 0, total: 1 };
  }

  let passed = 0;
  let total = 0;

  // Test 1: Callback on Async Suite Execution
  total++;
  try {
    const callbackUrl = `http://${callbackHostIp}:${CALLBACK_PORT}/suite-callback`;
    logInfo(`Submitting Suite with callback_url: ${callbackUrl}`);

    const payload = {
      source_code: "print('CALLBACK_PAYLOAD_TEST')",
      language_id: LANGUAGES.PYTHON,
      callback_url: callbackUrl,
      test_cases: [
        { expected_output: "CALLBACK_PAYLOAD_TEST\n" }
      ]
    };

    const res = await fetch(`${JUDGE0_URL}/suites?base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 201);
    const { suite_token } = await res.json();
    logInfo(`Suite submitted (${suite_token}). Awaiting webhook callback...`);

    const receivedData = await receiver.waitForCallback(suite_token, 10000);
    if (!receivedData) {
      logFail(`Callback not received within 10s at ${callbackUrl}`);
      logInfo("Tip: Ensure Windows Firewall allows incoming connections on port " + CALLBACK_PORT);
    } else {
      assert.strictEqual(receivedData.token, suite_token);
      logPass(`Callback successfully received and verified for Suite: ${suite_token}!`);
      passed++;
    }
  } catch (err) {
    logFail("Callback test failed", err.message);
  }

  await receiver.close();
  return { passed, total };
}

if (require.main === module) {
  const ip = process.argv[2] || "192.168.196.1";
  runCallbackTests(ip).catch(console.error);
}

module.exports = runCallbackTests;
