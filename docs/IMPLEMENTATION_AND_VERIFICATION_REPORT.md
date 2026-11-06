# Comprehensive Implementation & Verification Report
## Compile-Once Multi-Test-Case Suite Engine & Cgroup v2 Modernization

---

## 1. Executive Summary

This project successfully modernized and hardened the **Judge0** execution engine by integrating the **Compile-Once Multi-Test-Case Suite Engine** with the production-grade sandboxing, cgroup v2 architecture, and runtime fixes discovered from Newton School's enterprise deployment. 

The system has been fully ported to a modern **Debian 12 (Bookworm)** base supporting 4 core competitive programming languages (C GCC 12, C++ G++ 12 with C++20, Java OpenJDK 21 LTS, and Python 3.11 with NumPy). It runs natively on unified **cgroup v2** hosts (including Windows Docker Desktop via WSL 2, modern Linux distributions, and cloud container environments) without requiring VMware virtual machines, custom kernel flags, or disabling AppArmor.

In head-to-head benchmarking, the engine evaluated **1,500 test cases (15 suites $\times$ 100 test cases) in 20.65 seconds** at **72.6 tests/second** with **100% acceptance rate**, reducing compilation CPU overhead by **99%** through compile-once caching and immediate fail-fast compilation error short-circuiting.

---

## 2. Core Architectural Objectives & Outcomes

| Objective | Target State | Implementation / Resolution | Status |
| :--- | :--- | :--- | :--- |
| **High-Throughput Suite Engine** | 1 compilation per suite of $N$ test cases | Dedicated `/suites` and `/suites/:token` endpoints with compile-once lifecycle | **Accomplished** |
| **CE Fail-Fast Short-Circuiting** | Abort on compile failure; run 0 tests | `SuiteJob` checks compilation status; on error marks all test cases CE and skips execution | **Accomplished** (1.13s abort) |
| **Cgroup v2 & Issue #603 Resolution** | Native cgroup v2 sandboxing without cgroup v1 paths | Sibling cgroup layout (`api.scope` + `isolate.slice`) + upgrade to `ioi/isolate v2.0` | **Accomplished** |
| **Physical RSS Enforcement** | Enforce memory on resident memory (`memory.max`) | Hybrid `--cg` mode replaces virtual address limit (`RLIMIT_AS`) preventing Java/Python crashes | **Accomplished** |
| **Sandbox Scalability** | Prevent box crashes beyond 1,000 suites | Patched `num_boxes = 2147483647` in `/usr/local/etc/isolate` | **Accomplished** |
| **Cumulative Telemetry Isolation** | Prevent Test Case $i$ inheriting CPU/memory from $i-1$ | `SuiteJob` isolates per-test execution telemetry without cumulative statistic leakage | **Accomplished** |
| **Log Bloat Protection** | Prevent Newton School's 22 GB log overflow | `RAILS_LOG_LEVEL` environment configuration with fail-fast validation and default `warn` | **Accomplished** |
| **Database Indexing** | Eliminate sequential table scans during DB cleanup | Created migration adding index on `created_at` across `submissions`, `suites`, and `suite_test_cases` | **Accomplished** |

---

## 3. Milestones & Detailed Implementation Log

### Milestone 1: Critical Sandbox Hardening & Isolate v2 Upgrade
- **Issue**: Upstream Judge0 relied on an unmaintained fork of Isolate (`v1.8.1`), hardcoded to cgroup v1 paths (`/sys/fs/cgroup/memory/box-N`), with a default limit of 1,000 sandbox boxes (`num_boxes = 1000`).
- **Actions Taken**:
  1. Upgraded sandbox compiler base in `compilers/Dockerfile.four-languages` to official `ioi/isolate v2.0` with native cgroup v2 support.
  2. Patched `num_boxes = 2147483647` in `/usr/local/etc/isolate` inside Dockerfile and entrypoint.
  3. Stripped deprecated isolate v1 flags (`--cg-timing` and `--no-cg-timing`) from both `app/jobs/suite_job.rb` and `app/jobs/isolate_job.rb`.
  4. Added `--open-files=#{Config::MAX_OPEN_FILES}` to sandbox commands to protect against file descriptor starvation.

### Milestone 2: Cgroup v2 Entrypoint & Delegation Setup
- **Issue**: Under unified cgroup v2, the kernel enforces the *"no internal processes"* rule — a cgroup cannot have member processes if it controls child cgroups.
- **Actions Taken in `docker-entrypoint.sh`**:
  1. Sibling Hierarchy Layout:
     ```text
     <container cgroup>/               (from /proc/self/cgroup)
       ├── api.scope/                  (Rails server / Resque workers move here)
       └── isolate.slice/              (isolate v2 creates per-box children here)
           ├── box-0/
           └── ...
     ```
  2. Migrated PID 1 and all initial processes into `api.scope`.
  3. Delegated `+memory +pids +cpu` controllers on `cgroup.subtree_control` and `isolate.slice/cgroup.subtree_control`.
  4. Created `/run/isolate/locks` and wrote pointer to `/run/isolate/cgroup`.
  5. Configured runtime export of `OVERRIDE_PER_PROCESS_TIME=false` and `OVERRIDE_PER_PROCESS_MEMORY=false` when cgroup v2 succeeds.

### Milestone 3: Suite Telemetry & RSS Memory Fallback
- **Actions Taken in `app/jobs/suite_job.rb`**:
  1. Ensured per-test-case metrics accurately report individual CPU time and physical RSS memory.
  2. Hardened cleanup hooks to always run `isolate --cleanup` and wipe temporary files even on unhandled job aborts.
  3. Suppressed redundant serialized payloads on compilation errors (`test_cases: null`).

### Milestone 4: Runtime Optimization for the 4 Core Languages
- **Java 21 LTS (`db/languages/active_four_languages.rb`)**:
  - Throttled JIT/GC thread pools with `-XX:ActiveProcessorCount=2` to eliminate container thread exhaustion on multi-core hosts.
- **Python 3.11 with NumPy**:
  - Validated memory tracking under physical RSS mode; NumPy allocations execute under real resident memory bounds without hitting virtual memory traps.
- **C & C++ (GCC 12 / G++ 12 with C++20)**:
  - Verified static/dynamic linking paths with glibc 2.36 on Debian 12 Bookworm.

### Milestone 5: Enterprise Safeguards (Learned from Newton School Outages)
- **Log Level Safeguard (`config/environments/production.rb`, `scripts/load-config`, `judge0.conf`)**:
  - Set default `RAILS_LOG_LEVEL=warn`.
  - Added fail-fast startup validation rejecting invalid log level strings.
  - Eliminated high-volume SQL query logging to stdout/disk.
- **Database Cleanup Indexing (`db/migrate/20261106000001_add_index_to_created_at_on_tables.rb`)**:
  - Added `add_index :submissions, :created_at, algorithm: :concurrently`
  - Added `add_index :suites, :created_at, algorithm: :concurrently`
  - Added `add_index :suite_test_cases, :created_at, algorithm: :concurrently`
  - Prevents sequential table scans during background cron database pruning.

---

## 4. Root Cause & Solution: The Cgroup Subtree Permission Warning

### The Symptom
```text
[entrypoint] /sys/fs/cgroup/cgroup.subtree_control not writable
[entrypoint] cgroup v2 setup unavailable; isolate stays in rlimit mode (memory limits enforced as virtual address)
```

### The Root Cause
1. **Unprivileged Container User**: `Dockerfile.four-languages` previously concluded with `USER judge0` (UID 1000). When Docker launched the container, the `ENTRYPOINT ["/api/docker-entrypoint.sh"]` started as UID 1000. Under WSL 2 and Linux cgroup v2, `/sys/fs/cgroup/cgroup.subtree_control` is owned by `root:root` with file mode `0644`. Consequently, the unprivileged user could not enable controllers on the parent subtree.
2. **Missing Sudoers Definition**: `echo "judge0 ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers` replaced the file, omitting `root`, which caused `sudo` commands invoked in Rails jobs to warn `root is not in the sudoers file`.
3. **Missing Lock Directory**: Isolate v2 requires directory `/run/isolate/locks` to exist for box locking.

### The Fix
1. Switched container user to `USER root` in `Dockerfile.four-languages` (matching Newton School's production Dockerfile architecture).
2. Configured passwordless sudo for both `root` and `judge0` in `/etc/sudoers`.
3. Added `mkdir -p /run/isolate/locks` to `docker-entrypoint.sh`.
4. Rebuilt and pushed updated base compiler and server images to Docker Hub.

---

## 5. Verification & Benchmark Results

### 5.1 Verification Checklist
| Test Item | Command / Payload | Expected | Observed | Pass/Fail |
| :--- | :--- | :--- | :--- | :--- |
| **Startup Log** | `docker compose logs server` | `isolate cgroup-v2 mode active` | Confirmed | **PASS** |
| **Languages API** | `GET /languages` | 4 active languages | 4 languages (IDs 50, 54, 62, 71) | **PASS** |
| **Single Submission** | `POST /submissions` (Python) | Status 3 (Accepted) | Accepted, 0.016s, 3,752 KB | **PASS** |
| **Multi-Test Suite** | `POST /suites` (Python 3 tests) | Status 3 (Accepted) | 3/3 Accepted | **PASS** |
| **CE Short-Circuit** | `POST /suites` (C++ syntax error) | Status 6 (CE), 0 tests run | CE in 1.13s, 0 tests run | **PASS** |
| **Java 21 Cgroup v2** | `POST /suites` (Java 21) | Status 3 (Accepted) | Accepted, 74,280 KB RSS | **PASS** |
| **C (GCC 12)** | `POST /suites` (C) | Status 3 (Accepted) | Accepted, 0.068s, 7,072 KB | **PASS** |
| **C++ (G++ 12)** | `POST /suites` (C++) | Status 3 (Accepted) | Accepted, 0.505s, 89,244 KB | **PASS** |

### 5.2 1,500 Test Cases Head-to-Head Benchmark
Executed with `node run-1500-head-to-head.js` against `http://localhost:2358`:
```text
===============================================================================
                     BENCHMARK SUMMARY (1,500 TESTS)
===============================================================================
• Total Test Cases:        1500
• Total Suites:            15
• Total Wall Clock Time:   20.65s (~0.34 mins)
• Acceptance Rate:         15/15 (100%)
• Compilations Performed:  15 (1 per suite, 1,485 compilations saved)
• Effective Throughput:    72.6 tests/second
===============================================================================
```

### 5.3 Extreme 15,000 Test Cases Stress Test (Comprehensive Endpoints & Flows)
Executed with `node master-stress-15000.js` targeting all endpoints, parameters, status flows, and an extreme 15,000 sandboxed test cases load:

#### Part 1: All Endpoints, Query Params & Flows (16/16 Passed)
- `GET /about` (v1.13.1-four)
- `GET /languages` and `GET /languages/:id` (GCC 12, G++ 12, OpenJDK 21, Python 3.11)
- `GET /statuses` (14 status definitions)
- `GET /config_info` (CPU: 2s, Memory: 262,144 KB)
- `POST /submissions?wait=true` (Single synchronous submission)
- `POST /submissions` & `GET /submissions/:token` (Asynchronous polling)
- `POST /submissions/batch` & `GET /submissions/batch` (Batch API)
- `POST /suites?wait=true` (Suite synchronous mode)
- `GET /suites/:token?fields=token,status,test_cases` (Field filtering)
- `GET /suites/test_cases/:token` (Individual test case token retrieval)
- `FLOW: Wrong Answer (WA)` (Caught output mismatch, Status 4)
- `FLOW: Time Limit Exceeded (TLE)` (Isolate caught infinite loop at 1.0s, Status 5)
- `FLOW: Compilation Error Short-Circuit` (Aborted 50 tests in 0.78s with 0 test executions, Status 6)
- `FLOW: Runtime Error NZEC` (Caught `java.lang.ArithmeticException`, Status 11)
- `FLOW: Segmentation Fault / Signal Trap` (Caught memory violation safely, Status 11)
- `FLOW: Cgroup v2 RSS Memory Enforcement` (Java 21 executed cleanly at 20,132 KB RSS)

#### Part 2: 15,000 Test Cases Stress Benchmark
```text
===============================================================================
               15,000 TEST CASES STRESS BENCHMARK SUMMARY
===============================================================================
Total Wall Clock Time:          273.43 seconds (~4.56 mins)
Total Sandboxed TCs Executed:   15,000 / 15,000
Total Suites Evaluated:         150 / 150
Suites Accepted:                150 / 150 (100.0%)
Effective Sandbox Throughput:   54.9 test_cases / second
Suite Processing Rate:          0.55 suites / second
Compilations Performed:         150 (Saved 14,850 redundant compilations!)
-------------------------------------------------------------------------------
LATENCY DISTRIBUTION (End-to-End Suite Lifecycle):
  • Minimum Latency:            12,032 ms
  • Median (p50):               16,361 ms
  • 90th Percentile (p90):      24,098 ms
  • 95th Percentile (p95):      25,057 ms
  • 99th Percentile (p99):      25,580 ms
  • Maximum Latency:            25,596 ms
===============================================================================
✔ 100% OF 15,000 TEST CASES PASSED WITH ZERO LOSS, ZERO CRASHES, AND ZERO BOX LEAKS!
```

#### Root-Cause Investigation: Cumulative Cgroup v2 CPU Accounting
During initial stress testing at 15,000 test cases, 43 Java suites failed with Status 5 (Time Limit Exceeded).
- **Exact Root Cause Discovered**:
  In cgroup v2, kernel CPU statistics in `/sys/fs/cgroup/isolate.slice/box-N/cpu.stat` accumulate across every process executed within that node. Because `SuiteJob` reuses `box-N` across all 100 test cases of a single suite, Java test cases accumulated JVM startup CPU (~0.07s/test) until the cumulative sum reached the 2.0s suite ceiling around test case #7 or #8, causing false TLEs.
- **The Fix (`reset_cgroup`)**:
  In `app/jobs/suite_job.rb`, added `reset_cgroup` method:
  ```ruby
  def reset_cgroup
    return unless cgroups.present? && box_id
    cg_root = (File.read("/run/isolate/cgroup").strip rescue "/sys/fs/cgroup/isolate.slice")
    box_cg = "#{cg_root}/box-#{box_id}"
    if Dir.exist?(box_cg)
      `rmdir #{box_cg} 2>/dev/null && mkdir #{box_cg} 2>/dev/null`
    end
  end
  ```
  Calling `reset_cgroup` after compilation and between consecutive test cases wipes kernel CPU and memory metrics back to 0 without deleting or affecting the sandbox filesystem (`/var/local/lib/isolate/N/box`).
- **Verification**: Re-running the full 15,000 test case benchmark resulted in 150/150 suites (100.0%) accepted and 0 failures.

#### Verification: Legacy API Compatibility & Empirical Benchmark (Section 5.4)
To ensure no regressions were introduced to existing integrations, the legacy submission endpoints (`POST /submissions`, `POST /submissions/batch`, and `GET /submissions/batch`) were verified across all 4 language runtimes:
- **C (GCC 12)**: Status Accepted (ID 3), Time: 0.036s
- **C++ (G++ 12)**: Status Accepted (ID 3), Time: 0.323s
- **Java (OpenJDK 21)**: Status Accepted (ID 3), Time: 0.927s
- **Python (3.11)**: Status Accepted (ID 3), Time: 0.011s

A 500-submission empirical legacy benchmark was executed in batches of 50:
- **Measured Legacy Throughput**: 6.8 test_cases/second (73.71s for 500 tests).
- **Extrapolated 15,000 Legacy Time**: ~2,211 seconds (~36.8 minutes) vs 273.43 seconds (~4.56 minutes) on the Suite Engine (**8.1x speedup**).
- **Compilations on 15,000 Tests**: 15,000 compilations (Legacy) vs 150 compilations (Suite Engine), eliminating 14,850 redundant compilations (99.0% CPU reduction).
- **Queue Limits**: Legacy requires 15,000 Redis slots (triggering HTTP 503 queue overflows without client-side drip-feeding), while Suite Engine occupies just 150 slots.

---

## 6. Git Branch & Commits Summary

Working branch: `feat/cgroupv2-suite-hardening` on `https://github.com/IWillPinchU/judge0.git`

```text
96497c9 fix(suite): reset box cgroup between test cases to prevent cumulative CPU leakage
63162f0 fix(sandbox): support isolate v2 cgroup hierarchy and remove legacy cg-timing
4c59a2d perf(db): add created_at index on submissions, suites, and suite_test_cases
0d0fff9 fix(logging): prevent disk bloat outage with configurable RAILS_LOG_LEVEL and fail-fast validation
11d9dc8 perf(java): cap OpenJDK 21 thread pools with -XX:ActiveProcessorCount=2
e34fa61 fix(suite): extract per-test telemetry accurately and isolate RSS memory in cgroup v2
6ce3616 feat(cgroup): bootstrap cgroup v2 hierarchy with isolate.slice delegation and rlimit fallback
deccb13 fix(isolate): patch num_boxes to INT_MAX, strip deprecated --cg-timing, and expose --open-files
```

Compilers repository branch: `feat/four-languages-base` on `https://github.com/IWillPinchU/compilers.git`
```text
b63733d build(isolate): switch to ioi/isolate v2.0 for cgroup v2 support
c3c9d9e fix(isolate): patch isolate box limit to INT_MAX in four-languages compiler image
```

---

## 7. Published Docker Hub Artifacts & Distribution Package

- **Base Compiler Image**:
  - `iwillpinchu/judge0-compilers-four:v2-cgroup`
  - `iwillpinchu/judge0-compilers-four:latest`
- **Judge0 Server & Worker Image**:
  - `iwillpinchu/judge0-four:v2-cgroup` (Digest: `sha256:5bbfc4f076c0dd6c33486c1b7d67a1a118957b24a0912e00fe002bf56efd90f2`)
  - `iwillpinchu/judge0-four:latest`
- **Local Ready-to-Run Package**:
  - Directory: `D:\Projecto\Judge0\judge0-v2`
  - Archive: `D:\Projecto\Judge0\judge0-v2.zip` containing `docker-compose.yml` and pre-configured `judge0.conf`.

