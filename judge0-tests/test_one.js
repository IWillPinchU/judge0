async function test() {
  console.log("Sending wait=true request...");
  const t0 = Date.now();
  const config = require("./config");
  const baseUrl = process.env.JUDGE0_URL || config.JUDGE0_URL || "http://localhost:2358";
  const res = await fetch(`${baseUrl}/suites?wait=true&base64_encoded=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_code: "print('HELLO_WAIT')",
      language_id: 71,
      test_cases: [{ expected_output: "HELLO_WAIT\n" }]
    })
  });
  console.log("HTTP status:", res.status, "in", Date.now() - t0, "ms");
  const data = await res.json();
  console.log("Suite Token:", data.token);
  console.log("Suite Status:", data.status);
  console.log("Test Case:", data.test_cases?.[0]);
}

test().catch(console.error);
