const assert = require("node:assert");
const { JUDGE0_URL, LANGUAGES, STATUS } = require("./config");
const { logPass, logFail, logInfo, logSection, toBase64, fromBase64, pollSuite } = require("./utils");
const problems = require("./problems");

// Pretty formatted progress log
function logMatrixRow(status, lang, problem, queryConfig, numTests, timeMs, error) {
  const icon = status === "PASS" ? "\x1b[32m✔ PASS\x1b[0m" : "\x1b[31m✖ FAIL\x1b[0m";
  const langStr = lang.toUpperCase().padEnd(6);
  const probStr = problem.padEnd(25);
  const cfgStr = queryConfig.padEnd(45);
  const countStr = `${numTests} TCs`.padStart(8);
  const timeStr = `${timeMs}ms`.padStart(8);
  console.log(`  ${icon} | ${langStr} | ${probStr} | ${cfgStr} | ${countStr} | ${timeStr}`);
  if (error) {
    console.log(`         \x1b[2m↳ ${error}\x1b[0m`);
  }
}

async function runSingleTestCase(langKey, problem, config) {
  const languageId = LANGUAGES[langKey.toUpperCase()];
  const rawSource = problem.solutions[langKey];
  const testCases = problem.testCases;

  // Build query string
  const queryParts = [];
  if (config.wait !== undefined) queryParts.push(`wait=${config.wait}`);
  if (config.base64 !== undefined) queryParts.push(`base64_encoded=${config.base64}`);
  if (config.fields) queryParts.push(`fields=${config.fields}`);
  const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";

  // Prepare payload according to base64 mode
  const isB64 = config.base64 === true || (config.base64 === undefined); // Judge0 defaults to true if omitted
  let payloadSource = isB64 ? toBase64(rawSource) : rawSource;
  let payloadTestCases = testCases.map(tc => ({
    stdin: isB64 ? toBase64(tc.stdin) : tc.stdin,
    expected_output: isB64 ? toBase64(tc.expected_output) : tc.expected_output
  }));

  const payload = {
    source_code: payloadSource,
    language_id: languageId,
    test_cases: payloadTestCases
  };

  const start = Date.now();
  const res = await fetch(`${JUDGE0_URL}/suites${queryString}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }

  const initialData = await res.json();
  let finalData;

  if (config.wait === true) {
    finalData = initialData;
  } else {
    // Polling mode for async
    const token = initialData.token || initialData.suite_token;
    assert.ok(token, "Async submission must return token");
    const pollQuery = config.base64 !== undefined ? `base64_encoded=${config.base64}` : "";
    finalData = await pollSuite(token, pollQuery);
  }

  const elapsed = Date.now() - start;

  // Assertions
  const statusId = finalData.status?.id || finalData.status_id;
  assert.strictEqual(statusId, STATUS.ACCEPTED, `Expected Accepted (3), got status ${statusId}`);

  if (config.fields) {
    // If fields was filtered, verify requested fields are present
    const fields = config.fields.split(",");
    for (const f of fields) {
      assert.ok(finalData[f] !== undefined, `Filtered response missing requested field: ${f}`);
    }
  } else {
    // Full fields check
    assert.ok(Array.isArray(finalData.test_cases), "Response must include test_cases array");
    assert.strictEqual(finalData.test_cases.length, testCases.length, `Expected ${testCases.length} test cases executed`);
    
    // Check individual test case outcomes
    for (let i = 0; i < testCases.length; i++) {
      const tcResult = finalData.test_cases[i];
      const tcStatus = tcResult.status?.id || tcResult.status_id;
      assert.strictEqual(tcStatus, STATUS.ACCEPTED, `Test Case #${i+1} failed with status ${tcStatus}`);
      
      let actualStdout = tcResult.stdout;
      if (isB64) actualStdout = fromBase64(actualStdout);
      const expectedStdout = testCases[i].expected_output;
      assert.strictEqual(
        actualStdout?.trim(),
        expectedStdout?.trim(),
        `Test Case #${i+1} output mismatch. Got '${actualStdout?.trim()}', expected '${expectedStdout?.trim()}'`
      );
    }
  }

  return elapsed;
}

// Edge Cases & Stress Tests
async function runStressAndEdgeCases() {
  logSection("Stress Tests & Edge Case Failures (CE, TLE, RE, Scale)");
  const edgeResults = [];

  // Edge 1: Time Limit Exceeded (Infinite Loop in C++)
  try {
    const start = Date.now();
    const payload = {
      source_code: "#include <iostream>\nint main() { while(true); return 0; }",
      language_id: LANGUAGES.CPP,
      cpu_time_limit: 1.0,
      wall_time_limit: 2.0,
      test_cases: [{ expected_output: "something" }]
    };
    const res = await fetch(`${JUDGE0_URL}/suites?wait=true&base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    const elapsed = Date.now() - start;
    const tcStatus = data.test_cases?.[0]?.status?.id;
    assert.strictEqual(tcStatus, STATUS.TIME_LIMIT_EXCEEDED, `Expected TLE (5), got ${tcStatus}`);
    logMatrixRow("PASS", "cpp", "Infinite Loop TLE Enforcement", "wait=true | b64=false | cpu=1s", 1, elapsed);
    edgeResults.push(true);
  } catch (e) {
    logMatrixRow("FAIL", "cpp", "Infinite Loop TLE Enforcement", "wait=true | b64=false | cpu=1s", 1, 0, e.message);
    edgeResults.push(false);
  }

  // Edge 2: Runtime Error - Division by Zero (Java ArithmeticException)
  try {
    const start = Date.now();
    const payload = {
      source_code: "public class Main { public static void main(String[] args) { int a = 1 / 0; } }",
      language_id: LANGUAGES.JAVA,
      test_cases: [{ expected_output: "1" }]
    };
    const res = await fetch(`${JUDGE0_URL}/suites?wait=true&base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    const elapsed = Date.now() - start;
    const tcStatus = data.test_cases?.[0]?.status?.id;
    assert.ok(tcStatus === STATUS.RUNTIME_ERROR_NZEC || (tcStatus >= 7 && tcStatus <= 12), `Expected RE status, got ${tcStatus}`);
    logMatrixRow("PASS", "java", "Division By Zero Runtime Error", "wait=true | b64=false", 1, elapsed);
    edgeResults.push(true);
  } catch (e) {
    logMatrixRow("FAIL", "java", "Division By Zero Runtime Error", "wait=true | b64=false", 1, 0, e.message);
    edgeResults.push(false);
  }

  // Edge 3: Syntax Error Short-Circuiting (C Compilation Error)
  try {
    const start = Date.now();
    const payload = {
      source_code: "int main() { compile error here; }",
      language_id: LANGUAGES.C,
      test_cases: [
        { expected_output: "1" },
        { expected_output: "2" },
        { expected_output: "3" }
      ]
    };
    const res = await fetch(`${JUDGE0_URL}/suites?wait=true&base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    const elapsed = Date.now() - start;
    assert.strictEqual(data.status?.id, STATUS.COMPILATION_ERROR);
    assert.ok(data.compile_output && data.compile_output.length > 0);
    assert.ok(elapsed < 2500, `Compile failure should abort immediately without running test cases (${elapsed}ms)`);
    logMatrixRow("PASS", "c", "Compilation Error Short-Circuit", "wait=true | b64=false | 3 TCs", 3, elapsed);
    edgeResults.push(true);
  } catch (e) {
    logMatrixRow("FAIL", "c", "Compilation Error Short-Circuit", "wait=true | b64=false | 3 TCs", 3, 0, e.message);
    edgeResults.push(false);
  }

  // Edge 4: Large Batch Scalability (20 Test Cases in single Python execution)
  try {
    const start = Date.now();
    const manyTestCases = [];
    for (let i = 1; i <= 20; i++) {
      manyTestCases.push({
        stdin: `${i} ${i * 2}\n`,
        expected_output: `${i + i * 2}\n`
      });
    }
    const payload = {
      source_code: "import sys\nfor line in sys.stdin:\n    parts = line.split()\n    if parts:\n        print(int(parts[0]) + int(parts[1]))",
      language_id: LANGUAGES.PYTHON,
      test_cases: manyTestCases
    };
    const res = await fetch(`${JUDGE0_URL}/suites?wait=true&base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    const elapsed = Date.now() - start;
    assert.strictEqual(data.status?.id, STATUS.ACCEPTED);
    assert.strictEqual(data.test_cases?.length, 20);
    logMatrixRow("PASS", "python", "20-Test-Case Single Execution", "wait=true | b64=false | 20 TCs", 20, elapsed);
    edgeResults.push(true);
  } catch (e) {
    logMatrixRow("FAIL", "python", "20-Test-Case Single Execution", "wait=true | b64=false | 20 TCs", 20, 0, e.message);
    edgeResults.push(false);
  }

  return edgeResults;
}

// Master N x N Combinatorial Runner
async function runMatrix() {
  console.log("\n=========================================================================================");
  console.log("            JUDGE0 4-LANGUAGE ENGINE: RIGOROUS N x N COMBINATORIAL MATRIX");
  console.log("=========================================================================================");
  console.log(`Target Host: ${JUDGE0_URL}`);
  console.log("Status | Lang   | Problem                   | Query Parameter Configuration               | Tests    | Time");
  console.log("-----------------------------------------------------------------------------------------");

  const languages = ["c", "cpp", "java", "python"];
  
  // Matrix of Parameter Configurations
  const configs = [
    { name: "wait=true, base64=false", wait: true, base64: false },
    { name: "wait=true, base64=true", wait: true, base64: true },
    { name: "wait=false, base64=false", wait: false, base64: false },
    { name: "wait=false, base64=true", wait: false, base64: true },
    { name: "wait omitted (async default), base64=false", base64: false },
    { name: "wait=true, fields=token,status,test_cases", wait: true, base64: false, fields: "token,status,test_cases" }
  ];

  let totalTests = 0;
  let passedTests = 0;
  const timingByLang = { c: [], cpp: [], java: [], python: [] };

  // N x N loops: Languages x Problems x Configurations
  for (const lang of languages) {
    for (const prob of problems) {
      // Pick 2 representative configurations per (Language x Problem) cell for balanced deep coverage
      const selectedConfigs = [
        configs[totalTests % configs.length],
        configs[(totalTests + 1) % configs.length]
      ];

      for (const cfg of selectedConfigs) {
        totalTests++;
        try {
          const elapsed = await runSingleTestCase(lang, prob, cfg);
          passedTests++;
          timingByLang[lang].push(elapsed);
          logMatrixRow("PASS", lang, prob.name, cfg.name, prob.testCases.length, elapsed);
        } catch (err) {
          logMatrixRow("FAIL", lang, prob.name, cfg.name, prob.testCases.length, 0, err.message);
        }
      }
    }
  }

  // Run Edge Cases & Stress Scenarios
  const edgeResults = await runStressAndEdgeCases();
  for (const ok of edgeResults) {
    totalTests++;
    if (ok) passedTests++;
  }

  // Summary Metrics
  logSection("N x N MATRIX TEST SUMMARY & PERFORMANCE BENCHMARKS");
  console.log(`Total Combinatorial Configurations Evaluated: ${totalTests}`);
  console.log(`Passed: ${passedTests} / ${totalTests} (${Math.round((passedTests / totalTests) * 100)}%)`);

  console.log("\nLanguage Performance Averages (Compile Once + Multi-Test Execution):");
  for (const [lang, times] of Object.entries(timingByLang)) {
    if (times.length > 0) {
      const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      const min = Math.min(...times);
      const max = Math.max(...times);
      console.log(`  • ${lang.toUpperCase().padEnd(6)}: Average ${avg}ms (Min: ${min}ms, Max: ${max}ms) across ${times.length} suites`);
    }
  }

  if (passedTests === totalTests) {
    console.log("\n\x1b[32m✔ ALL COMBINATORIAL N x N RIGOROUS TESTS PASSED PERFECTLY!\x1b[0m\n");
  } else {
    console.log("\n\x1b[31m✖ SOME COMBINATIONS FAILED. SEE DETAILS ABOVE.\x1b[0m\n");
  }
}

if (require.main === module) {
  runMatrix().catch(console.error);
}

module.exports = runMatrix;
