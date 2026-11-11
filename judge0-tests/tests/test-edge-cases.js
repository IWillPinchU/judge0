const assert = require("node:assert");
const { JUDGE0_URL, LANGUAGES, STATUS } = require("../config");
const { logSection, logPass, logFail } = require("../utils");

async function runEdgeCaseTests() {
  logSection("Sandbox Hardening & Comprehensive Edge Cases Verification");
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
    "Edge Case 1: Crash Isolation: SIGSEGV in Case 1 does not affect Case 2",
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
    "Edge Case 2: TLE Isolation: Time Limit in Case 1 does not starve Case 2",
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
             c2.stdout?.trim() === "FAST_RESULT";
    }
  );

  // 3. Java Exception Isolation
  await testCase(
    "Edge Case 3: Java Exception Isolation: Uncaught Exception in Case 1 isolated from Case 2",
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
    "Edge Case 4: Disk Scratchpad Isolation: /tmp files purged between test cases",
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
    "Edge Case 5: Python NumPy: Vector operations under cgroup memory enforcement",
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

  // 6. Arithmetic Division by Zero (SIGFPE)
  await testCase(
    "Edge Case 6: Integer division by zero correctly categorized as SIGFPE / NZEC",
    {
      language_id: LANGUAGES.C,
      source_code: `
        #include <stdio.h>
        int main() {
            volatile int a = 10;
            volatile int b = 0;
            volatile int c = a / b;
            printf("%d\\n", c);
            return 0;
        }
      `,
      test_cases: [{ stdin: "\n" }]
    },
    data => {
      const tc = data.test_cases[0];
      // Status 9 is SIGFPE, Status 11 is NZEC
      return tc.status?.id === 9 || tc.status?.id === STATUS.RUNTIME_ERROR_NZEC;
    }
  );

  // 7. Zero-Byte Input and Zero-Byte Output
  await testCase(
    "Edge Case 7: Zero-Byte Input & Output: Empty execution returns Accepted with empty stdout",
    {
      language_id: LANGUAGES.CPP,
      source_code: `
        int main() {
            return 0;
        }
      `,
      test_cases: [{ stdin: "" }]
    },
    data => {
      const tc = data.test_cases[0];
      return tc.status?.id === STATUS.ACCEPTED && (tc.stdout === null || tc.stdout === "");
    }
  );

  // 8. Multi-Case Mixed Verdicts: Suite status adopts first non-AC
  await testCase(
    "Edge Case 8: Multi-Case Mixed Evaluation: Suite correctly marks first non-AC verdict",
    {
      language_id: LANGUAGES.PYTHON,
      source_code: `
import sys
val = sys.stdin.read().strip()
print(f"OUT_{val}")
      `,
      test_cases: [
        { stdin: "1\n", expected_output: "OUT_1\n" }, // AC
        { stdin: "2\n", expected_output: "OUT_WRONG\n" }, // WA
        { stdin: "3\n", expected_output: "OUT_3\n" } // AC
      ]
    },
    data => {
      const c1 = data.test_cases[0];
      const c2 = data.test_cases[1];
      const c3 = data.test_cases[2];
      return data.status?.id === STATUS.WRONG_ANSWER &&
             c1.status?.id === STATUS.ACCEPTED &&
             c2.status?.id === STATUS.WRONG_ANSWER &&
             c3.status?.id === STATUS.ACCEPTED;
    }
  );

  return { passed, total };
}

module.exports = runEdgeCaseTests;
