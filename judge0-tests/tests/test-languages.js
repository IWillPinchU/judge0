const assert = require("node:assert");
const { JUDGE0_URL, LANGUAGES, STATUS } = require("../config");
const { logSection, logPass, logFail } = require("../utils");

async function runLanguageTests() {
  logSection("Testing All 4 Compilers & Execution Sandboxes");
  let passed = 0;
  let total = 0;

  // 1. C (GCC 12.2.0)
  total++;
  try {
    const payload = {
      source_code: `#include <stdio.h>
int main() {
    int a, b;
    if (scanf("%d %d", &a, &b) == 2) {
        printf("%d\n", a * b);
    }
    return 0;
}`,
      language_id: LANGUAGES.C,
      test_cases: [
        { stdin: "5 6\n", expected_output: "30\n" },
        { stdin: "7 8\n", expected_output: "56\n" }
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
    assert.strictEqual(data.test_cases[0].stdout, "30\n");
    assert.strictEqual(data.test_cases[1].stdout, "56\n");

    logPass(`C (GCC 12) compile-once executed 2 test cases with Accepted`);
    passed++;
  } catch (err) {
    logFail("C test failed", err.message);
  }

  // 2. C++ (G++ 12.2.0, C++20) with Mixed Results (AC + WA)
  total++;
  try {
    const payload = {
      source_code: `#include <iostream>
#include <vector>
#include <numeric>
using namespace std;
int main() {
    int n;
    if (cin >> n) {
        cout << n * n << endl;
    }
    return 0;
}`,
      language_id: LANGUAGES.CPP,
      test_cases: [
        { stdin: "5\n", expected_output: "25\n" }, // Expected AC
        { stdin: "9\n", expected_output: "999\n" } // Expected WA
      ]
    };

    const res = await fetch(`${JUDGE0_URL}/suites?wait=true&base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();

    assert.strictEqual(data.test_cases[0].status.id, STATUS.ACCEPTED);
    assert.strictEqual(data.test_cases[1].status.id, STATUS.WRONG_ANSWER);
    assert.strictEqual(data.status?.id, STATUS.WRONG_ANSWER, "Overall suite status should reflect Wrong Answer");

    logPass(`C++ (C++20) multi-test evaluated mixed results (Case 1: AC, Case 2: WA)`);
    passed++;
  } catch (err) {
    logFail("C++ test failed", err.message);
  }

  // 3. Java (OpenJDK 21 LTS)
  total++;
  try {
    const payload = {
      source_code: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int x = sc.nextInt();
            System.out.println("Java21:" + (x + 100));
        }
    }
}`,
      language_id: LANGUAGES.JAVA,
      test_cases: [
        { stdin: "42\n", expected_output: "Java21:142\n" }
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
    assert.strictEqual(data.test_cases[0].stdout, "Java21:142\n");

    logPass(`Java (OpenJDK 21) compiled and executed successfully with Accepted`);
    passed++;
  } catch (err) {
    logFail("Java test failed", err.message);
  }

  // 4. Python 3.11 with NumPy
  total++;
  try {
    const payload = {
      source_code: `import numpy as np
a = np.array([2, 4, 6])
b = np.array([1, 2, 3])
print(int(np.dot(a, b)))`,
      language_id: LANGUAGES.PYTHON,
      test_cases: [
        { expected_output: "28\n" }
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
    assert.strictEqual(data.test_cases[0].stdout, "28\n");

    logPass(`Python 3.11 with NumPy vector dot-product executed with Accepted`);
    passed++;
  } catch (err) {
    logFail("Python NumPy test failed", err.message);
  }

  // 5. Runtime Error (Division by Zero in C++)
  total++;
  try {
    const payload = {
      source_code: `#include <iostream>
using namespace std;
int main() {
    volatile int a = 1;
    volatile int b = 0;
    cout << a / b << endl;
    return 0;
}`,
      language_id: LANGUAGES.CPP,
      test_cases: [
        { expected_output: "0\n" }
      ]
    };

    const res = await fetch(`${JUDGE0_URL}/suites?wait=true&base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    const statusId = data.test_cases[0].status.id;
    assert.ok(statusId >= 7 && statusId <= 12, `Expected Runtime Error status (7-12), got ${statusId}`);

    logPass(`Runtime Error correctly intercepted and categorized (Status: ${data.test_cases[0].status.description})`);
    passed++;
  } catch (err) {
    logFail("Runtime error test failed", err.message);
  }

  return { passed, total };
}

if (require.main === module) {
  runLanguageTests().catch(console.error);
}

module.exports = runLanguageTests;
