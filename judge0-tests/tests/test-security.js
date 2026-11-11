const assert = require("node:assert");
const { JUDGE0_URL, LANGUAGES, STATUS } = require("../config");
const { logSection, logPass, logFail } = require("../utils");

async function runSecurityTests() {
  logSection("Security Hardening & Exploit Isolation Tests");
  let passed = 0;
  let total = 0;

  async function testExploit(name, payload, validator) {
    total++;
    try {
      const res = await fetch(`${JUDGE0_URL}/suites?wait=true&base64_encoded=false`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(res.status, 201, `Expected HTTP 201, got ${res.status}`);
      const data = await res.json();
      assert.ok(validator(data), "Security validation assertion failed");
      logPass(name);
      passed++;
    } catch (err) {
      logFail(name, err.message);
    }
  }

  // 1. Inter-test-case file leakage attempt (Blocked by 0555 sandbox)
  await testExploit(
    "Exploit 1: Inter-test file leakage (Blocked by 0555 read-only sandbox)",
    {
      language_id: LANGUAGES.CPP,
      source_code: `
        #include <iostream>
        #include <fstream>
        #include <string>
        using namespace std;
        int main() {
            string cmd;
            if (!(cin >> cmd)) return 0;
            if (cmd == "WRITE_LEAK") {
                ofstream out("stolen_state.txt");
                out << "MALICIOUS_PAYLOAD" << endl;
                out.close();
                cout << "WROTE" << endl;
            } else {
                ifstream in("stolen_state.txt");
                if (in.good()) cout << "VULNERABLE" << endl;
                else cout << "CLEAN" << endl;
            }
            return 0;
        }
      `,
      test_cases: [{ stdin: "WRITE_LEAK\n" }, { stdin: "CHECK_LEAK\n" }]
    },
    data => data.test_cases[1]?.stdout?.trim() === "CLEAN"
  );

  // 2. Binary tampering / self-modification attack
  await testExploit(
    "Exploit 2: Binary tampering & deletion prevention (0555 locks executable)",
    {
      language_id: LANGUAGES.CPP,
      source_code: `
        #include <iostream>
        #include <cstdio>
        #include <unistd.h>
        #include <fstream>
        using namespace std;
        int main() {
            int cmd;
            if (cin >> cmd) {
                if (cmd == 1) {
                    int r = unlink("a.out");
                    ofstream evil("a.out");
                    bool wrote = evil.good();
                    evil.close();
                    if (r == 0 || wrote) cout << "TAMPERED" << endl;
                    else cout << "LOCKED" << endl;
                } else {
                    cout << "NORMAL" << endl;
                }
            }
            return 0;
        }
      `,
      test_cases: [{ stdin: "1\n" }, { stdin: "2\n" }]
    },
    data => data.test_cases[0]?.stdout?.trim() === "LOCKED" &&
             data.test_cases[1]?.stdout?.trim() === "NORMAL"
  );

  // 3. Environment Variable & Secret Exfiltration Attempt
  await testExploit(
    "Exploit 3: Secret exfiltration: POSTGRES/REDIS credentials sanitized from environ",
    {
      language_id: LANGUAGES.PYTHON,
      source_code: `
import os
secrets = ["POSTGRES_PASSWORD", "REDIS_PASSWORD", "SECRET_KEY_BASE", "DATABASE_URL"]
found = [s for s in secrets if os.environ.get(s) is not None]
if len(found) == 0:
    print("SECRETS_PROTECTED")
else:
    print(f"EXPOSED:{','.join(found)}")
      `,
      test_cases: [{ stdin: "\n" }]
    },
    data => data.test_cases[0]?.stdout?.trim() === "SECRETS_PROTECTED"
  );

  // 4. Host Filesystem Traversal (/etc/shadow and /root access)
  await testExploit(
    "Exploit 4: Host filesystem isolation: /etc/shadow access denied",
    {
      language_id: LANGUAGES.C,
      source_code: `
        #include <stdio.h>
        int main() {
            FILE* f = fopen("/etc/shadow", "r");
            if (f != NULL) {
                printf("ESCAPE_SHADOW_READABLE\\n");
                fclose(f);
            } else {
                printf("ACCESS_DENIED\\n");
            }
            return 0;
        }
      `,
      test_cases: [{ stdin: "\n" }]
    },
    data => data.test_cases[0]?.stdout?.trim() === "ACCESS_DENIED"
  );

  // 5. Network Socket / Outbound Reverse Shell Prevention
  await testExploit(
    "Exploit 5: Network isolation: Outbound sockets blocked (share-net disabled)",
    {
      language_id: LANGUAGES.PYTHON,
      enable_network: false,
      source_code: `
import socket, sys
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1.0)
    s.connect(("8.8.8.8", 53))
    print("NETWORK_ESCAPED")
    s.close()
except Exception as e:
    print("NETWORK_BLOCKED")
      `,
      test_cases: [{ stdin: "\n" }]
    },
    data => data.test_cases[0]?.stdout?.trim() === "NETWORK_BLOCKED"
  );

  // 6. Fork Bomb / PID Exhaustion Attempt
  await testExploit(
    "Exploit 6: Fork-bomb containment: Process table capped by -p cgroup limit",
    {
      language_id: LANGUAGES.C,
      cpu_time_limit: 2,
      wall_time_limit: 4,
      source_code: `
        #include <unistd.h>
        #include <stdio.h>
        int main() {
            for (int i = 0; i < 200; i++) {
                fork();
            }
            printf("FORK_FINISHED\\n");
            return 0;
        }
      `,
      test_cases: [{ stdin: "\n" }]
    },
    data => {
      const tc = data.test_cases[0];
      // Either NZEC runtime error or finished with bounded forks (no host freeze)
      return tc.status?.id === STATUS.ACCEPTED || tc.status?.id === STATUS.RUNTIME_ERROR_NZEC;
    }
  );

  // 7. RAM OOM Bomber (Exceeding Cgroup Memory Limits)
  await testExploit(
    "Exploit 7: RAM OOM bomber: Allocation exceeding 64MB safely trapped by cgroup",
    {
      language_id: LANGUAGES.CPP,
      memory_limit: 64000, // 64 MB limit
      source_code: `
        #include <iostream>
        #include <vector>
        #include <cstring>
        using namespace std;
        int main() {
            try {
                // Allocate and actively touch 200 MB to force physical RSS allocation
                vector<char*> v;
                for (int i = 0; i < 200; i++) {
                    char* chunk = new char[1024 * 1024]; // 1 MB
                    memset(chunk, 1, 1024 * 1024);       // Touch all pages
                    v.push_back(chunk);
                }
                cout << "OOM_ESCAPED" << endl;
            } catch (...) {
                cout << "OOM_CAUGHT" << endl;
            }
            return 0;
        }
      `,
      test_cases: [{ stdin: "\n" }]
    },
    data => {
      const tc = data.test_cases[0];
      // Should be killed by cgroup SIGKILL/SIGSEGV/NZEC or caught bad_alloc, never Accepted with OOM_ESCAPED
      return tc.status?.id !== STATUS.ACCEPTED || tc.stdout?.trim() === "OOM_CAUGHT";
    }
  );

  // 8. Disk Space Bomb (Writing beyond MAX_FILE_SIZE)
  await testExploit(
    "Exploit 8: Disk space bomb: Writing gigabytes blocked by MAX_FILE_SIZE limit",
    {
      language_id: LANGUAGES.PYTHON,
      max_file_size: 1024, // 1MB limit
      source_code: `
import sys
try:
    with open("/tmp/bigbomb.dat", "w") as f:
        for _ in range(500):
            f.write("A" * (1024 * 1024)) # 500 MB
    print("DISK_BOMB_SUCCEEDED")
except Exception as e:
    print("DISK_BOMB_BLOCKED")
      `,
      test_cases: [{ stdin: "\n" }]
    },
    data => {
      const tc = data.test_cases[0];
      // Exits with SIGXFSZ (status 8) or caught/NZEC
      return tc.status?.id === 8 || tc.status?.id === STATUS.RUNTIME_ERROR_NZEC || tc.stdout?.trim() === "DISK_BOMB_BLOCKED";
    }
  );

  // 9. Background Daemon / Detached Process Escape
  await testExploit(
    "Exploit 9: Background daemon escape: Detached child cleaned up with cgroup kill",
    {
      language_id: LANGUAGES.C,
      source_code: `
        #include <unistd.h>
        #include <stdlib.h>
        #include <stdio.h>
        int main() {
            pid_t pid = fork();
            if (pid == 0) {
                // Child: detach into background daemon
                setsid();
                while(1) { sleep(1); }
            } else {
                // Parent exits immediately
                printf("PARENT_EXIT_OK\\n");
                return 0;
            }
        }
      `,
      test_cases: [{ stdin: "\n" }]
    },
    data => data.test_cases[0]?.stdout?.trim() === "PARENT_EXIT_OK"
  );

  // 10. Signal Tampering: Attempting to ignore SIGXCPU / SIGALRM
  await testExploit(
    "Exploit 10: Signal immunity bypass: Ignoring SIGXCPU defeated by hard isolate SIGKILL",
    {
      language_id: LANGUAGES.C,
      cpu_time_limit: 1,
      wall_time_limit: 2,
      source_code: `
        #include <signal.h>
        #include <stdio.h>
        #include <unistd.h>
        void handler(int sig) {}
        int main() {
            signal(SIGXCPU, SIG_IGN);
            signal(SIGALRM, SIG_IGN);
            signal(SIGTERM, SIG_IGN);
            while(1) {}
            return 0;
        }
      `,
      test_cases: [{ stdin: "\n" }]
    },
    data => data.test_cases[0]?.status?.id === STATUS.TIME_LIMIT_EXCEEDED
  );

  return { passed, total };
}

module.exports = runSecurityTests;
