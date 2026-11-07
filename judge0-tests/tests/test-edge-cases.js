const assert = require("node:assert");
const { JUDGE0_URL, LANGUAGES, STATUS } = require("../config");
const { logSection, logPass, logFail } = require("../utils");

async function runEdgeCaseTests() {
  logSection("Sandbox Hardening & Edge Cases Verification");
  let passed = 0;
  let total = 0;

  async function testCase(name, payload, validator) {
    total++;
    try {
      const res = await fetch(`${JUDGE0_URL}/suites?wait=true&base64_encoded=false`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res.status, 201, `HTTP ${res.status}`);
      const data = await res.json();
      assert.ok(validator(data), "Validator returned false");
      logPass(name);
      passed++;
    } catch (err) {
      logFail(name, err.message);
    }
  }

  // 1. Crash Isolation: SIGSEGV in Case 1 does NOT corrupt Case 2
  await testCase(
    "Crash Isolation: SIGSEGV in Case 1 does not affect Case 2",
    {
      language_id: LANGUAGES.CPP,
      source_code: `
        #include <iostream>
        using namespace std;
        int main() {
            int cmd;
            if (cin >> cmd) {
                if (cmd == 1) { int *p = nullptr; *p = 42; }
                else { cout << "CASE_2_OK" << endl; }
            }
            return 0;
        }
      `,
      test_cases: [{ stdin: "1\n" }, { stdin: "2\n" }]
    },
    data => {
      const c1 = data.test_cases[0];
      const c2 = data.test_cases[1];
      return (c1.status?.id === 7 || c1.status?.id === 11) &&
             c2.status?.id === STATUS.ACCEPTED &&
             c2.stdout?.trim() === "CASE_2_OK";
    }
  );

  // 2. TLE Isolation: Infinite Loop in Case 1 does not bleed into Case 2
  await testCase(
    "TLE Isolation: Time Limit in Case 1 does not starve Case 2",
    {
      language_id: LANGUAGES.CPP,
      cpu_time_limit: 1,
      wall_time_limit: 2,
      source_code: `
        #include <iostream>
        using namespace std;
        int main() {
            int cmd;
            if (cin >> cmd) {
                if (cmd == 1) { while(true) {} }
                else { cout << "FAST_RESULT" << endl; }
            }
            return 0;
        }
      `,
      test_cases: [{ stdin: "1\n" }, { stdin: "2\n" }]
    },
    data => {
      const c1 = data.test_cases[0];
      const c2 = data.test_cases[1];
      return c1.status?.id === STATUS.TIME_LIMIT_EXCEEDED &&
             c2.status?.id === STATUS.ACCEPTED &&
             c2.stdout?.trim() === "FAST_RESULT" &&
             parseFloat(c2.time) < 0.2;
    }
  );

  // 3. Java Exception Isolation
  await testCase(
    "Java Exception Isolation: Uncaught Exception in Case 1 isolated from Case 2",
    {
      language_id: LANGUAGES.JAVA,
      source_code: `
        import java.util.Scanner;
        public class Main {
            public static void main(String[] args) {
                Scanner sc = new Scanner(System.in);
                int cmd = sc.nextInt();
                if (cmd == 1) {
                    throw new RuntimeException("Test failure in Case 1");
                } else {
                    System.out.println("JAVA_CASE_2_OK");
                }
            }
        }
      `,
      test_cases: [{ stdin: "1\n" }, { stdin: "2\n" }]
    },
    data => {
      const c1 = data.test_cases[0];
      const c2 = data.test_cases[1];
      return c1.status?.id === STATUS.RUNTIME_ERROR_NZEC &&
             c2.status?.id === STATUS.ACCEPTED &&
             c2.stdout?.trim() === "JAVA_CASE_2_OK";
    }
  );

  // 4. Disk Spam in /tmp: Clearing /tmp between test cases
  await testCase(
    "Disk Scratchpad Isolation: /tmp files purged between test cases",
    {
      language_id: LANGUAGES.PYTHON,
      source_code: `
import os, sys
cmd = sys.stdin.read().strip()
if cmd == "SPAM":
    for i in range(50):
        with open(f"/tmp/spam_{i}.dat", "w") as f:
            f.write("A" * 1024)
    print("SPAMMED")
elif cmd == "CHECK":
    spam_files = [f for f in os.listdir("/tmp") if f.startswith("spam_")]
    if len(spam_files) == 0:
        print("CLEAN")
    else:
        print(f"DIRTY:{len(spam_files)}")
      `,
      test_cases: [{ stdin: "SPAM\n" }, { stdin: "CHECK\n" }]
    },
    data => {
      const c1 = data.test_cases[0];
      const c2 = data.test_cases[1];
      return c1.stdout?.trim() === "SPAMMED" &&
             c2.stdout?.trim() === "CLEAN";
    }
  );

  // 5. Python NumPy Vectorization under cgroup limits
  await testCase(
    "Python NumPy: Vector operations under cgroup memory enforcement",
    {
      language_id: LANGUAGES.PYTHON,
      memory_limit: 128000,
      source_code: `
import numpy as np
import sys
data = sys.stdin.read().split()
if data:
    n = int(data[0])
    a = np.ones(n, dtype=np.float64)
    b = np.full(n, 2.5, dtype=np.float64)
    print(f"{np.dot(a, b):.1f}")
      `,
      test_cases: [
        { stdin: "1000\n", expected_output: "2500.0\n" },
        { stdin: "50000\n", expected_output: "125000.0\n" }
      ]
    },
    data => {
      return data.status?.id === STATUS.ACCEPTED &&
             data.test_cases[0].stdout?.trim() === "2500.0" &&
             data.test_cases[1].stdout?.trim() === "125000.0";
    }
  );

  return { passed, total };
}

module.exports = runEdgeCaseTests;

