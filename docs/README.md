# Judge0 Suite Engine & Modernization Documentation

Welcome to the documentation for the modernized **Judge0 Compile-Once Multi-Test-Case Suite Engine** and **Hardened Cgroup v2 Sandboxing Stack**.

---

## 📚 Documentation Index

| Document | Description |
| :--- | :--- |
| **[Architecture Diagrams](architecture.md)** | Visual comparison between legacy batch execution and the compile-once suite engine, plus cgroup v2 sandbox hierarchy and DB schema. |
| **[Benchmark Report](benchmark.md)** | Empirical 15,000 test cases stress benchmark results, latency distributions, and head-to-head comparison against the legacy batch API. |
| **[Changes & What's New](changes.md)** | Comprehensive summary of all new features, sandbox bug fixes, outage preventions, and language toolchains. |
| **[The Execution Dilemma](dilemma.md)** | Deep-dive into CPU time vs. Wall time, sandbox watchdog mechanics, and handling partial scoring ($O(N^2)$ vs. $O(N \log N)$). |
| **[Implementation & Verification Report](IMPLEMENTATION_AND_VERIFICATION_REPORT.md)** | Forensic audit log, milestone tracking, bug root causes, and verification matrices. |
| **[Suite Engine Specifications](SUITE_ENGINE.md)** | Core domain model, schema design, and API contract for `/suites` and `/suites/:token`. |
| **[Postman Collection](Judge0_v2_Postman_Collection.json)** | Postman v2.1.0 collection with 20 pre-configured requests across all metadata, suite, and legacy endpoints. |
