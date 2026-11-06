# Judge0 Modernization: What's New & What Changed

This document summarizes the new features, architecture improvements, bug fixes, and performance gains introduced in this custom build of **Judge0**. It is written to quickly get any engineer, product owner, or evaluator up to speed.

---

## 🚀 At a Glance: What Was Accomplished

1. **Compile-Once Multi-Test-Case Engine (`/suites`)**:
   Instead of compiling user code $N$ times for $N$ test cases, code is compiled **exactly once** and executed across all test cases sequentially inside the sandbox.
   - **Impact**: Cuts compilation CPU overhead by up to **99%**.
   - **Benchmark**: Evaluates **1,500 test cases in 20.65 seconds** (~72.6 tests/sec) on a local machine.

2. **Immediate Fail-Fast on Compilation Error (CE)**:
   If compilation fails, all $N$ test cases are immediately marked with `Compilation Error (ID: 6)` and execution aborts in **~1 second** without wasting CPU cycles running test cases.

3. **Native Cgroup v2 Support (Solves Upstream Issue #603)**:
   Modern hosts (Debian 12, Ubuntu 22.04/24.04, and Windows Docker Desktop WSL 2) use unified cgroup v2. Upstream Judge0 hardcoded obsolete cgroup v1 paths, causing crashes.
   - **Fix**: Upgraded to **Isolate v2.0** and implemented a sibling cgroup layout (`api.scope` + `isolate.slice`).
   - **Impact**: Judge0 now runs **natively on Windows Docker Desktop and modern Linux** without needing VMware, custom kernel parameters, or disabling AppArmor.

4. **Real Resident Memory (RSS) Enforcement**:
   Switched from virtual address space limits (`RLIMIT_AS`) to cgroup physical memory limits (`memory.max`).
   - **Impact**: Prevents fake Out-of-Memory crashes for runtimes like **Java 21** and **Python 3.11 with NumPy**, which pre-reserve large virtual memory blocks.

5. **Enterprise Hardening & Outage Prevention (Lessons from Newton School)**:
   - **22 GB Log Bloat Safeguard**: Introduced `RAILS_LOG_LEVEL` environment configuration with a fail-fast validator and `warn` default, eliminating runaway SQL logging that previously took down production.
   - **Database Pruning Indexing**: Added database indexes on `created_at` across `submissions`, `suites`, and `suite_test_cases`, stopping slow sequential full-table scans during automated cleanup jobs.
   - **Java 21 Thread Throttling**: Added `-XX:ActiveProcessorCount=2` to OpenJDK 21, preventing the JVM from spawning 32+ background GC/JIT threads that exhaust container process limits.

---

## 🛠️ Detailed Changes by Category

### 1. New Features

| Feature | Endpoint / Component | Description |
| :--- | :--- | :--- |
| **Suite Submission API** | `POST /suites` | Accepts source code and an array of test cases (`stdin`, `expected_output`). Compiles once and runs all test cases. |
| **Suite Retrieval API** | `GET /suites/:token` | Returns overall suite status and individual per-test results (`time`, `memory`, `stdout`, `exit_code`). |
| **Synchronous Waiting** | `?wait=true` parameter | Allows clients to wait synchronously for suite completion instead of polling. |
| **Base64 Encoding** | `?base64_encoded=true` | Full support for base64 encoded source code, inputs, and outputs. |
| **Payload Sanitization** | `SuiteSerializer` | On Compilation Error, suppresses bloated empty test case arrays to keep response payloads small. |

---

### 2. Sandbox Hardening & Bug Fixes

- **Patched Sandbox Limit from 1,000 to 2.14 Billion**:
  - *Problem*: Isolate defaults to `num_boxes = 1000`. Once submission/suite IDs reached 1,000, sandbox initialization crashed with `"Sandbox ID out of range"`.
  - *Fix*: Patched `/usr/local/etc/isolate` with `num_boxes = 2147483647` (INT_MAX).
- **Stripped Deprecated Flags (`--cg-timing`)**:
  - *Problem*: Passing `--cg-timing` or `--no-cg-timing` to Isolate v2 dumped `--help` to stdout and broke runs.
  - *Fix*: Stripped all occurrences from `suite_job.rb` and `isolate_job.rb`.
- **Exposed Open Files Limit**:
  - *Fix*: Added `--open-files=#{Config::MAX_OPEN_FILES}` to sandbox commands to prevent file descriptor exhaustion under load.
- **Isolated Per-Test Telemetry & Cgroup Node Reset**:
  - *Problem*: Under cgroup v2, `cpu.stat` in `/sys/fs/cgroup/isolate.slice/box-N` is strictly cumulative across all processes run inside that cgroup node. In multi-test suites sharing the same sandbox box directory across 100 test cases, JVM startup CPU (~0.07s per test) accumulated in the box cgroup until the cumulative sum hit the 2.0s ceiling at test case #7 or #8, causing false Time Limit Exceeded (TLE) errors.
  - *Fix*: Added `reset_cgroup` in `SuiteJob` (`rmdir /sys/fs/cgroup/isolate.slice/box-N && mkdir ...`) executed after compilation and between consecutive test cases. This resets kernel CPU and memory metrics to 0 without affecting the sandbox file system or requiring isolate re-initialization.
  - *Result*: Achieved **15,000 / 15,000 test cases accepted (100.0%)** across 150 concurrent suites with zero errors.

---

### 3. Cgroup v2 & Architecture Fixes

- **Container User & Permission Hierarchy**:
  - *Problem*: Running the container entrypoint as unprivileged `USER judge0` caused `/sys/fs/cgroup/cgroup.subtree_control not writable` because the cgroup filesystem is owned by `root:root 0644`.
  - *Fix*: Changed container user to `USER root` and granted passwordless sudo to both `root` and `judge0` in `/etc/sudoers`.
- **Delegation Layout**:
  - The entrypoint moves container processes into `api.scope` so the parent cgroup satisfies cgroup v2's *"no internal processes"* rule, allowing `+memory +pids +cpu` controllers to be delegated to child boxes in `isolate.slice`.
- **Automatic Fallback**:
  - If started on an environment without cgroup v2 delegation, the engine logs a warning and automatically falls back to standard rlimit mode without crashing.

---

### 4. Language Toolchains (Debian 12 Bookworm Base)

This build is packaged into a lean 4-language base image:

| Language | Version / Compiler | Highlights |
| :--- | :--- | :--- |
| **C** | GCC 12.2.0 | Standard glibc 2.36 |
| **C++** | G++ 12.2.0 | Full C++20 standard support (`-std=c++20`) |
| **Java** | OpenJDK 21 LTS (Temurin) | Throttled with `-XX:ActiveProcessorCount=2` (74 MB footprint) |
| **Python** | Python 3.11 | Pre-installed with **NumPy**; RSS cgroup memory tracking |

---

## 📊 Benchmark Summary: Legacy vs. Modern Engine

| Metric | Upstream Judge0 (Batch API) | This Custom Suite Engine |
| :--- | :--- | :--- |
| **Compilation Strategy** | Compiles code for **every** test case ($N$ times) | Compiles code **once** ($1$ time) |
| **100 Test Cases Time** | ~32 - 45 seconds | **~2.8 - 4.1 seconds** (~10x faster) |
| **1,500 Test Cases Time** | ~7 - 10 minutes | **20.65 seconds** (72.6 tests/sec) |
| **15,000 Test Cases Stress** | **~36.8 minutes** (6.8 tests/sec, 15,000 compilations) | **273.43 seconds (~4.56 mins)** (54.9 tests/sec, 150 compilations) |
| **Compilations on 15,000 TCs** | **15,000 compilations** (1 per test case) | **150 compilations** (99.0% reduction!) |
| **Redis Queue Occupancy** | **15,000 slots** (hits `MAX_QUEUE_SIZE` HTTP 503 error) | **150 slots** (fits easily under 200 limit) |
| **Compilation Error Behavior** | Attempts to compile and fail all $N$ submissions | Aborts in **1.13s**, executes 0 test cases |
| **Host Support** | Cgroup v1 only (requires old Ubuntu/VMware) | **Unified Cgroup v2** (native Windows WSL2 & modern Linux) |
| **Java 21 Memory Stability** | Crashes on `< 1.5 GB` limits (`RLIMIT_AS`) | Stable down to **64 MB - 128 MB** (`memory.max` RSS) |
| **Log Management** | Hardcoded `debug` / runaway disk writes | Configurable `RAILS_LOG_LEVEL=warn` with fail-fast validation |

---

## 📦 Ready-to-Use Artifacts

- **Docker Images (Docker Hub)**:
  - `iwillpinchu/judge0-four:v2-cgroup` / `:latest`
  - `iwillpinchu/judge0-compilers-four:v2-cgroup` / `:latest`
- **Distribution Archive**:
  - `judge0-v2.zip`: Contains `docker-compose.yml` and `judge0.conf` ready for single-command launch (`docker compose up -d`).

