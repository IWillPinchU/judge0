# Judge0 Architecture: Original vs. Modernized Engine

---

## 1. Executive Comparison

```mermaid
flowchart TD
    subgraph Original["Original Upstream Judge0 (Legacy Batch Architecture)"]
        O_Client["Client Application"] -->|"POST /submissions/batch (N Test Cases)"| O_API["Rails API Server"]
        O_API -->|"N Independent Records"| O_DB[("PostgreSQL submissions Table")]
        O_API -->|"Enqueues N Jobs"| O_Redis[("Redis Queue (Max 200 Slots)")]
        O_Redis -->|"Workers dequeue N jobs"| O_Workers["Multiple Resque Workers"]
        O_Workers -->|"For EVERY Test Case"| O_Box["Isolate Box N Init"]
        O_Box -->|"Recompile Source Code (N times!)"| O_Compile["Compiler (g++, javac, etc.)"]
        O_Compile -->|"Execute Single Test"| O_Run["Execute Binary"]
        O_Run -->|"Destroy Sandbox"| O_Clean["Box Cleanup"]
    end

    subgraph Modern["Modernized Judge0 Engine (Compile-Once Suite Architecture)"]
        M_Client["Client Application"] -->|"POST /suites (1 Suite with N Test Cases)"| M_API["Rails API Server"]
        M_API -->|"1 Suite + N Test Case Records"| M_DB[("PostgreSQL suites + test_cases")]
        M_API -->|"Enqueues EXACTLY 1 Job"| M_Redis[("Redis Queue (1 Slot Occupied)")]
        M_Redis -->|"1 Worker dequeues SuiteJob"| M_Worker["Single Resque Worker"]
        M_Worker -->|"Init Sandbox Box Once"| M_Box["Isolate Box N Init"]
        M_Box -->|"Compile Source Code EXACTLY ONCE"| M_Compile["Compiler (g++, javac, etc.)"]
        M_Compile -->|"If Syntax Error"| M_CE["Immediate Fail-Fast Abort (0.78s)"]
        M_Compile -->|"If Compile Success"| M_Loop["Sequential In-Box Test Runner"]
        M_Loop -->|"Test 1 against Binary"| M_T1["Run Test 1 -> reset_cgroup"]
        M_T1 -->|"Test 2 against Binary"| M_T2["Run Test 2 -> reset_cgroup"]
        M_T2 -->|"Test N against Binary"| M_TN["Run Test N -> reset_cgroup"]
        M_TN -->|"Complete Suite Output"| M_Out["Batch Telemetry & Streaming Webhooks"]
    end
```

---

## 2. Sandboxing & Cgroup Architecture

```mermaid
flowchart LR
    subgraph Upstream_Sandbox["Legacy Sandboxing (Upstream Judge0)"]
        direction TB
        U_Host["Host Kernel (Modern Unified Cgroup v2)"]
        U_Host -->|"Incompatible Legacy Paths"| U_Err["Crash: /sys/fs/cgroup/memory/box-N not found"]
        U_Err -->|"Fallback"| U_Rlimit["RLIMIT Mode (rlimit_as)"]
        U_Rlimit -->|"Virtual Memory Cap"| U_Java["Java 21 / Python NumPy OOM Crash"]
        U_BoxLimit["Box ID Limit: num_boxes = 1000"] -->|"After 1000 runs"| U_BoxCrash["Crash: Sandbox ID out of range"]
    end

    subgraph Modern_Sandbox["Hardened Cgroup v2 Sandboxing (Modern Engine)"]
        direction TB
        M_Host["Host Kernel (Unified Cgroup v2 / Windows WSL2)"]
        M_Host -->|"USER root delegation in entrypoint"| M_Root["/sys/fs/cgroup"]
        M_Root -->|"Satisfies No Internal Process rule"| M_Scope["api.scope (Rails & Workers)"]
        M_Root -->|"Controller Delegation (+cpu +memory +pids)"| M_Slice["isolate.slice"]
        M_Slice -->|"Box 1..N Isolated Cgroups"| M_Boxes["box-0, box-1, ... box-N"]
        M_Boxes -->|"Real Physical RSS Limits"| M_RSS["memory.max (RSS Tracking)"]
        M_RSS -->|"Java 21 & NumPy Clean Execution"| M_Stable["Stable at 64MB - 128MB"]
        M_Boxes -->|"Per-Test Cgroup Node Wiping"| M_Reset["reset_cgroup (rmdir/mkdir)"]
        M_Reset -->|"Eliminates Cumulative CPU Leak"| M_FreshCPU["Fresh 0.0s CPU Quota per Test"]
        M_Boxes -->|"num_boxes = 2,147,483,647"| M_InfBoxes["Scales up to 2.14 Billion Suites"]
    end
```

---

## 3. Database Schema Evolution

```mermaid
erDiagram
    SUBMISSIONS_LEGACY {
        int id PK
        string token
        text source_code
        text stdin
        text stdout
        text stderr
        int status_id
        decimal time
        int memory
        datetime created_at "Indexed in Modern Build"
    }

    SUITES {
        int id PK
        string token UK
        int language_id
        text source_code
        int status_id
        text compile_output
        decimal cpu_time_limit
        decimal wall_time_limit
        int memory_limit
        string callback_url
        datetime created_at "Indexed"
    }

    SUITE_TEST_CASES {
        int id PK
        int suite_id FK
        string token UK
        text stdin
        text expected_output
        text stdout
        text stderr
        int status_id
        decimal time
        decimal wall_time
        int memory
        int exit_code
        datetime created_at "Indexed"
    }

    SUITES ||--o{ SUITE_TEST_CASES : "1 suite compiles once and executes N test cases"
```

---

## 4. Architectural Comparison Table

| Architecture Dimension | Original Upstream Judge0 (`/submissions/batch`) | Modernized Engine (`/suites`) |
| :--- | :--- | :--- |
| **API Paradigm** | Flat array of individual submissions | Hierarchical domain model (`Suite` $\to$ `N SuiteTestCases`) |
| **Compilation Frequency** | Compiles code **$N$ times** for $N$ test cases | Compiles code **1 time** for $N$ test cases |
| **Compilation Error (CE)** | Attempts compilation $N$ times, failing each individually (~35s wasted) | Short-circuits immediately in **0.78s**, running 0 test cases |
| **Redis Queue Impact** | Consumes $N$ slots (triggers `HTTP 503: Queue is full` beyond 200) | Consumes **1 slot per suite** (handles 15,000+ tests safely) |
| **Cluster Worker Load** | Hijacks multiple worker threads simultaneously | Confines execution to **1 worker process**, freeing others |
| **Cgroup Hierarchy** | Hardcoded cgroup v1 paths (`/sys/fs/cgroup/memory`) | Sibling hierarchy: `api.scope` + `isolate.slice` |
| **Memory Enforcement** | Virtual memory (`RLIMIT_AS`) causing fake Java/Python OOMs | Real Resident Set Size (`memory.max` RSS tracking) |
| **Sandbox Concurrency Limit**| Capped at 1,000 runs (`num_boxes = 1000`) | Scaled to **2.14 Billion runs** (`num_boxes = INT_MAX`) |
| **Cgroup CPU Accumulation** | Leaks CPU across processes inside the same box | `reset_cgroup` wipes node between runs (zero leakage) |
| **Log Management** | Hardcoded `debug` level causing 22 GB disk bloat | Configurable `RAILS_LOG_LEVEL=warn` with fail-fast validation |
| **Database Performance** | Sequential table scans during cleanup jobs | Added B-tree indexes on `created_at` across all tables |
| **Supported Run-times** | Monolithic 60+ unmaintained compilers | Lean 4 OA languages: C (GCC 12), C++20, Java 21, Python 3.11 |
