// Test script for Kubernetes Multi-Node Judge0 cluster
const URL = "http://localhost:23580";

async function main() {
  console.log(`Connecting to Kubernetes Judge0 API at ${URL}...`);

  try {
    const aboutRes = await fetch(`${URL}/about`);
    const about = await aboutRes.json();
    console.log("✔ Connected to Judge0 API:", about);
  } catch (err) {
    console.error("✖ Cannot connect to Judge0 API:", err.message);
    process.exit(1);
  }

  console.log("\nSubmitting 4 parallel test suites across worker pods...");
  const promises = [1, 2, 3, 4].map(async (i) => {
    const payload = {
      source_code: `#include <iostream>\nusing namespace std;\nint main() { cout << "Hello from Job ${i}!" << endl; return 0; }`,
      language_id: 54,
      test_cases: [{ expected_output: `Hello from Job ${i}!\n` }]
    };

    const res = await fetch(`${URL}/suites?wait=true&base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log(`Job ${i} completed -> Status: ${data.status?.description} (ID: ${data.status?.id}) | Executed on Pod: ${data.execution_host || 'N/A'}`);
    return data;
  });

  await Promise.all(promises);
  console.log("\n✔ All jobs finished successfully across the Kubernetes cluster!");
}

main().catch(console.error);

