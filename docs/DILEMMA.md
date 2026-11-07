# The Execution Dilemma: CPU Time, Wall Time & Partial Scoring in Online Judges

---

## 1. Fundamentals: CPU Time vs. Wall Time

When an online judge evaluates code, it tracks two fundamentally different clocks:

### A. CPU Time (Execution Work Done)
* **Definition**: The actual amount of time the CPU spends executing instructions on behalf of the user process (user-space time + kernel system call time).
* **Clock Behavior**: The CPU clock only ticks when the process is actively scheduled on a CPU core. If the process is sleeping, waiting for disk I/O, or paused waiting for a network packet, **CPU time does not advance**.
* **Purpose**: Measures algorithm computational complexity ($O(N)$, $O(N^2)$, $O(2^N)$).

### B. Wall Time (Real-World Elapsed Clock)
* **Definition**: The actual elapsed real-world time measured by a clock on the wall (from the exact instant the process starts until it exits).
* **Clock Behavior**: Advances steadily regardless of what the CPU is doing. If a program sleeps for 5 seconds (`sleep(5)`), its CPU time is `0.00s`, but its Wall time is `5.00s`.
* **Purpose**: Prevents programs from hanging indefinitely on deadlocks, infinite sleeps, or waiting on unread input (`cin`, `stdin`).

---

## 2. How the Sandbox (Isolate) Enforces Limits

Judge0 uses the **Isolate sandbox** to enforce these limits on every sandboxed execution:

```bash
isolate \
  -t 2.0 \  # CPU Time Limit (seconds)
  -x 0.5 \  # Extra CPU Grace Period before SIGKILL (seconds)
  -w 10.0 \ # Wall-Clock Time Limit (seconds)
  --run -- /bin/bash run.sh < stdin.txt > stdout.txt
```

### The Three Watchdog Scenarios:

```text
                          [ User Code Execution Begins ]
                                        │
                                        ▼
                       Is it actively burning CPU cycles?
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
    YES: Active CPU Burn (e.g. while true)     NO: Idle / Sleeping (e.g. sleep(100))
                    │                                       │
                    ▼                                       ▼
    [ Kernel Tracks CPU Clock: cpu.stat ]     [ Isolate Tracks Wall Clock: Monotonic ]
                    │                                       │
                    ▼                                       ▼
       CPU Time > 2.0s + 0.5s Grace?           Elapsed Wall Time > 10.0s Limit?
                    │                                       │
                    ▼                                       ▼
   Kernel sends SIGXCPU / SIGKILL              Isolate forcefully kills with SIGKILL
                    │                                       │
                    ▼                                       ▼
      Status 5: Time Limit Exceeded               Status 5: Time Limit Exceeded
          (Terminates in ~2.0s!)                     (Terminates in 10.0s!)
```

1. **CPU-Bound Infinite Loop (`while (true) {}`)**:
   - The program consumes 100% of a core.
   - It hits the **2.0s CPU limit in ~2.0 to 2.2 seconds** and gets killed immediately.
   - **It does NOT wait 10 seconds.**
2. **Sleep / I/O-Bound Infinite Loop (`while (true) { sleep(1); }`)**:
   - The CPU is idle (`0.00s`). Without a wall-time limit, the worker would hang forever.
   - At **10.0s of wall time**, `isolate` forcefully terminates the process tree with `SIGKILL`.
3. **High Server Contention (The Reason Newton School Set 10.0s Wall Time)**:
   - When a server is under 100% CPU load running 10 concurrent workers, the Linux CPU scheduler pauses and resumes processes constantly.
   - A valid solution that needs 1.8s of CPU might take **5 to 7 seconds of wall time** to finish accumulating its CPU cycles.
   - Setting `WALL_TIME_LIMIT=10.0` provides a 5x safety cushion so that legitimate solutions are never falsely killed due to server congestion.

---

## 3. How Suites & Test Cases Use These Clocks

### A. Wall Time Does NOT Accumulate Across Test Cases
In the Suite Engine (`suite_job.rb`), `isolate` is spawned as a **new process** for each test case:
```ruby
suite.suite_test_cases.each do |test_case|
  `#{command}` # Launches new /usr/local/bin/isolate process
end
```
Because each test case launches a new `isolate` process, its wall-clock timer starts at **`0.000s`** every single time. 
- Test Case 1 gets 10.0s of wall time.
- Test Case 2 gets 10.0s of wall time.
- Wall time is completely isolated by the operating system.

### B. The Cgroup v2 Cumulative CPU Trap (And How We Solved It)
Under unified cgroup v2, kernel CPU statistics (`/sys/fs/cgroup/isolate.slice/box-N/cpu.stat`) are **cumulative per cgroup node**.
* Because the Suite Engine keeps the sandbox box alive across $N$ test cases, subsequent test cases would read the *sum* of all previous test cases' CPU time if the cgroup was not cleared.
* **Our Solution:** In [`suite_job.rb`](file:///d:/Projecto/Judge0/judge0/app/jobs/suite_job.rb#L321), `reset_cgroup` recreates the cgroup directory node before each test case run, resetting kernel accounting so every test case gets accurate microsecond timing.

---

## 4. The Real Dilemma: Submissions with Partial Scoring

The core dilemma arises when evaluating sub-optimal algorithms on test suites with partial scoring:

### The Scenario:
* A student submits an $O(N^2)$ algorithm for a problem whose optimal solution is $O(N \log N)$.
* Test suite has **50 test cases**:
  - Tests 1 to 10 have small inputs ($N \le 1,000$). The $O(N^2)$ code passes easily.
  - Tests 11 to 50 have large inputs ($N = 100,000$) designed to enforce $O(N \log N)$.
* Each of these 40 test cases hits the 2.0s CPU limit and gets killed.

```text
Test 1..10  :  [PASS] [PASS] [PASS] ... [PASS] (Takes 0.1s total) -> Earns partial score!
Test 11..50 :  [TLE ] [TLE ] [TLE ] ... [TLE ] (40 test cases x 2.0s = 80 seconds!)
```

### Why Naive Approaches Fail:

| Naive Approach | What Happens | Why It Fails |
| :--- | :--- | :--- |
| **"Stop-on-First-Failure" (Fail-Fast)** | Aborts execution immediately when Test 11 hits TLE. | **Unfair grading**: If Test 11 was in Subtask 2, but Subtask 3 had small edge cases the student solved, stopping early prevents them from earning legitimate partial marks. |
| **"Run All 50 Test Cases"** | Evaluates all 40 TLE test cases sequentially. | **Severe latency**: 1 worker spends $40 \times 2.0\text{s} = \mathbf{80\text{ seconds}}$ killing the exact same loop over and over. If the client used `?wait=true`, reverse proxies (Cloudflare/Nginx) drop the HTTP connection after 60s. |

---

## 5. How Newton School Handled This vs. Our Suite Engine

Did Newton School suffer from this same dilemma? **Yes, but their architecture made it far more damaging to the cluster:**

### In Newton School (`POST /submissions/batch`):
1. **Disabled Synchronous Waiting**: Judge0 hardcodes `wait=false` for batch submissions. The frontend is forced to poll 50 tokens in Redis.
2. **Worker Pool Hijacking**:
   - The 50 test cases are split into **50 independent jobs** in Redis.
   - If the server has 5 worker threads, all 5 workers are immediately seized by that single student's 40 TLE submissions.
   - Each worker compiles the code from scratch (1.0s) and runs the TLE (2.0s) = **3.0s per job**.
   - Total cluster CPU time burned: **$40 \times 3.0\text{s} = 120\text{ seconds}$**.
   - **Impact**: Other students taking the exam have their submissions queued and frozen until those 40 redundant compilations and timeouts finish.

### In Our Suite Engine (`POST /suites`):
1. **Single Enqueued Job**: 50 test cases occupy **1 worker thread**. The other 4 workers on the cluster remain 100% available to evaluate other students' code.
2. **Single Compilation**: The code is compiled **once** (1.0s) instead of 40 times.
3. **Total Cluster CPU Burn**: Reduced from 120s down to **81s**.

---

## 6. Analysis of Production Solutions & Tradeoffs

How do top competitive programming platforms resolve this dilemma?

### Solution 1: Consecutive TLE Heuristic (Fail-Fast Heuristic)
* **Rule**: *"If 3 consecutive test cases hit TLE, auto-mark all remaining test cases as TLE."*
* **Tradeoff**:
  - Drops execution time from **80s down to 6s**.
  - **Not 100% fair**: Fails if problem setters put small corner cases (e.g. $N=1$) at the end of the test suite, or if the algorithm has data-dependent average-case behavior (e.g. QuickSort passing random arrays but failing sorted arrays).

### Solution 2: Subtask Grouping (The IOI / CodeChef Standard) — 100% Fair
* **Rule**: Group test cases into explicit Subtasks (e.g., Subtask 1, Subtask 2, Subtask 3).
* Each subtask is **All-or-Nothing**.
* If Test 11 in Subtask 2 hits TLE, **immediately skip the rest of Subtask 2** (since the student has already lost Subtask 2's points), but **proceed directly to Subtask 3**!
* **Result**: 100% mathematically fair, preserves partial scoring, and cuts useless TLE execution time by 80–90%.

### Solution 3: Global Suite Time Budget (`suite_time_limit`) — 100% Safe
* **Rule**: Give each suite a total CPU budget (e.g., `MAX_SUITE_CPU = 15.0s`).
* A fast solution runs 50 tests in 0.5s.
* A slow solution that hits TLEs is allowed to accumulate up to 15.0s of total CPU across all its test cases before being cleanly capped.
* **Result**: Guarantees no single submission can ever tie up a worker for 80+ seconds.

### Solution 4: Streaming Webhook Callbacks (The UX Solution - Already Built!)
* If a platform needs to evaluate every test case without early termination:
* Submit asynchronously (`POST /suites?wait=false`).
* Our `SuiteJob` streams a webhook `{ "type": "test_case", "status": "Accepted" }` **the exact millisecond each test case completes**.
* The student's UI shows live progress test-by-test, eliminating the 80-second frozen browser spinner.

---

## 7. Current Decision & Summary

For our current deployment:
> **"Let's just keep it, it's only 1 worker anyway."**

This is a pragmatic and sound decision:
1. Because our Suite Engine uses **1 worker per suite**, a 50-test TLE submission only occupies that single worker thread; it **never hijacks the entire cluster** like Newton School's legacy batch model did.
2. The `CPU_TIME_LIMIT=2.0` and `WALL_TIME_LIMIT=10.0` configuration provides the exact production safety cushion Newton School calibrated for peak server loads.
3. If partial scoring subtasks or global suite timeouts are required in the future, the foundation is already isolated and ready to adopt Subtask Grouping or a Global Suite Budget.
