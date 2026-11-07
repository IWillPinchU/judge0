# Judge0 Suite Engine & Sandboxing Documentation

Welcome to the documentation for the modernized **Judge0 Compile-Once Multi-Test-Case Suite Engine** and **Hardened Cgroup v2 Sandboxing Stack**.

---

## 📚 Master Documentation Index

| Document | Description |
| :--- | :--- |
| **[Architecture & Suite API](ARCHITECTURE.md)** | Full architectural specification: compile-once engine, cgroup v2 sandbox lifecycle, database schema, and CPU vs. Wall time watchdog mechanics. |
| **[The Execution Dilemma](DILEMMA.md)** | CPU Time vs. Wall Time analysis, cgroup cumulative CPU accounting, partial scoring trade-offs, and TLE mitigation strategies. |
| **[Benchmark & Scaling Report](BENCHMARKS.md)** | Empirical 93,000 sandboxed test cases benchmark across 6 worker tiers (COUNT = 2 to 24), Ryzen 5 5600X hardware analysis, and legacy comparison. |
| **[Security & Exploit Hardening](SECURITY.md)** | Comprehensive sandbox security model: read-only `/box` (0555), scratchpad `/tmp` purging, binary tampering prevention, and automated audit suites. |
| **[Implementation & Verification Report](IMPLEMENTATION_AND_VERIFICATION_REPORT.md)** | Milestone audit trail, bug root causes, and verification matrices. |
| **[Postman Collection](Judge0_v2_Postman_Collection.json)** | Postman v2.1.0 collection with pre-configured requests across all metadata, suite, and legacy endpoints. |

---

## 🧪 Testing & Verification

All automated tests are consolidated inside [`judge0-tests/`](../judge0-tests/):

* **Run Full Verification Suite:**
  ```bash
  node judge0-tests/test.js
  ```
* **Run Specific Categories:**
  ```bash
  node judge0-tests/test.js --security    # Runs exploit & file leakage tests
  node judge0-tests/test.js --languages   # Tests C, C++, Java 21, and Python 3.11 with NumPy
  node judge0-tests/test.js --edge        # Tests SIGSEGV, TLE, and memory bounds
  ```
* **Run Dynamic Benchmarks:**
  ```bash
  node judge0-tests/benchmark.js --engine=suite --count=1000 --concurrency=12
  node judge0-tests/benchmark.js --engine=legacy --count=500
  ```
