const assert = require("node:assert");
const { JUDGE0_URL, LANGUAGES, STATUS } = require("../config");
const { logSection, logPass, logFail } = require("../utils");

async function runSecurityTests() {
  logSection("Security Hardening & Exploit Isolation Tests");
  let passed = 0;
  let total = 0;

  // Test 1: Inter-test-case file leakage attempt
  total++;
  try {
    const maliciousCpp = `
#include <iostream>
#include <fstream>
#include <string>
using namespace std;

int main() {
    string cmd;
    if (!(cin >> cmd)) return 0;
    if (cmd == "WRITE_LEAK") {
        ofstream out("stolen_state.txt");
        out << "MALICIOUS_PAYLOAD_LEAKED" << endl;
        out.close();
        cout << "WROTE_LEAK" << endl;
    } else if (cmd == "CHECK_LEAK") {
        ifstream in("stolen_state.txt");
        if (in.good()) {
            string content;
            in >> content;
            if (content == "MALICIOUS_PAYLOAD_LEAKED") {
                cout << "VULNERABILITY_CONFIRMED" << endl;
            } else {
                cout << "FILE_EXISTS_CORRUPT" << endl;
            }
        } else {
            cout << "CLEAN_NO_LEAK" << endl;
        }
    }
    return 0;
}
    `;

    const res = await fetch(`${JUDGE0_URL}/suites?wait=true&base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language_id: LANGUAGES.CPP,
        source_code: maliciousCpp,
        test_cases: [
          { stdin: "WRITE_LEAK\n" },
          { stdin: "CHECK_LEAK\n" }
        ]
      })
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    const tc2Output = data.test_cases[1]?.stdout?.trim();

    assert.strictEqual(tc2Output, "CLEAN_NO_LEAK", `Expected 'CLEAN_NO_LEAK', got '${tc2Output}'`);
    logPass("Inter-test-case file leakage: Blocked by read-only sandbox (0555)");
    passed++;
  } catch (err) {
    logFail("Inter-test file leakage test failed", err.message);
  }

  // Test 2: Binary tampering and deletion attempt (DoS attack)
  total++;
  try {
    const tamperCpp = `
#include <iostream>
#include <cstdio>
#include <unistd.h>
#include <fstream>
using namespace std;

int main() {
    int cmd;
    if (!(cin >> cmd)) return 0;
    if (cmd == 1) {
        int r1 = unlink("a.out");
        ofstream evil("a.out");
        bool wrote = evil.good();
        evil.close();
        if (r1 == 0 || wrote) {
            cout << "BINARY_CORRUPTED" << endl;
        } else {
            cout << "BINARY_PROTECTED" << endl;
        }
    } else {
        cout << "NORMAL_EXECUTION" << endl;
    }
    return 0;
}
    `;

    const res = await fetch(`${JUDGE0_URL}/suites?wait=true&base64_encoded=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language_id: LANGUAGES.CPP,
        source_code: tamperCpp,
        test_cases: [
          { stdin: "1\n" },
          { stdin: "2\n" }
        ]
      })
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    const tc1Output = data.test_cases[0]?.stdout?.trim();
    const tc2Output = data.test_cases[1]?.stdout?.trim();

    assert.strictEqual(tc1Output, "BINARY_PROTECTED", `Expected Case 1 'BINARY_PROTECTED', got '${tc1Output}'`);
    assert.strictEqual(tc2Output, "NORMAL_EXECUTION", `Expected Case 2 'NORMAL_EXECUTION', got '${tc2Output}'`);
    logPass("Binary tampering & deletion: Prevented (chmod 555 locks executable)");
    passed++;
  } catch (err) {
    logFail("Binary tampering test failed", err.message);
  }

  return { passed, total };
}

module.exports = runSecurityTests;

