// Comprehensive 10-Problem DSA Benchmark Suite
// Covers 10 distinct DSA archetypes implemented in C (50), C++ (54), Java (62), Python (71)

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ----------------------------------------------------------------------------
// Problem 1: Kadane's Algorithm (Max Subarray Sum - 1D DP)
// ----------------------------------------------------------------------------
function genKadane(size = 40) {
  const arr = [];
  for (let i = 0; i < size; i++) arr.push(randomInt(-500, 500));
  let maxSoFar = arr[0], curr = arr[0];
  for (let i = 1; i < size; i++) {
    curr = Math.max(arr[i], curr + arr[i]);
    maxSoFar = Math.max(maxSoFar, curr);
  }
  return {
    stdin: `${size}\n${arr.join(" ")}\n`,
    expected_output: `${maxSoFar}\n`
  };
}

// ----------------------------------------------------------------------------
// Problem 2: Two-Sum in Sorted Array (Two Pointers)
// ----------------------------------------------------------------------------
function genTwoSum(size = 40) {
  const arr = [];
  let cur = randomInt(-100, 100);
  for (let i = 0; i < size; i++) {
    cur += randomInt(1, 10);
    arr.push(cur);
  }
  const shouldExist = Math.random() > 0.4;
  let target;
  if (shouldExist && size >= 2) {
    const i = randomInt(0, size - 2);
    const j = randomInt(i + 1, size - 1);
    target = arr[i] + arr[j];
  } else {
    target = arr[0] + arr[1] - 9999;
  }
  let l = 0, r = size - 1, found = false;
  while (l < r) {
    const s = arr[l] + arr[r];
    if (s === target) { found = true; break; }
    else if (s < target) l++;
    else r--;
  }
  return {
    stdin: `${size}\n${arr.join(" ")}\n${target}\n`,
    expected_output: found ? "YES\n" : "NO\n"
  };
}

// ----------------------------------------------------------------------------
// Problem 3: 0/1 Knapsack (2D Dynamic Programming)
// ----------------------------------------------------------------------------
function genKnapsack(n = 20, maxW = 50) {
  const weights = [];
  const values = [];
  for (let i = 0; i < n; i++) {
    weights.push(randomInt(1, 15));
    values.push(randomInt(5, 50));
  }
  const W = randomInt(20, maxW);
  const dp = new Array(W + 1).fill(0);
  for (let i = 0; i < n; i++) {
    const w = weights[i], v = values[i];
    for (let j = W; j >= w; j--) {
      dp[j] = Math.max(dp[j], dp[j - w] + v);
    }
  }
  return {
    stdin: `${n} ${W}\n${weights.join(" ")}\n${values.join(" ")}\n`,
    expected_output: `${dp[W]}\n`
  };
}

// ----------------------------------------------------------------------------
// Problem 4: Longest Increasing Subsequence - LIS (Binary Search + DP)
// ----------------------------------------------------------------------------
function genLIS(size = 40) {
  const arr = [];
  for (let i = 0; i < size; i++) arr.push(randomInt(1, 1000));
  const tails = [];
  for (const x of arr) {
    let l = 0, r = tails.length;
    while (l < r) {
      const mid = (l + r) >> 1;
      if (tails[mid] < x) l = mid + 1;
      else r = mid;
    }
    tails[l] = x;
  }
  return {
    stdin: `${size}\n${arr.join(" ")}\n`,
    expected_output: `${tails.length}\n`
  };
}

// ----------------------------------------------------------------------------
// Problem 5: Modular Exponentiation (Number Theory)
// ----------------------------------------------------------------------------
function genModExp() {
  const a = randomInt(2, 1000);
  const b = randomInt(1, 100000);
  const m = randomInt(1000, 1000000);
  const bigA = BigInt(a), bigB = BigInt(b), bigM = BigInt(m);
  let res = 1n, base = bigA % bigM, exp = bigB;
  while (exp > 0n) {
    if (exp & 1n) res = (res * base) % bigM;
    base = (base * base) % bigM;
    exp >>= 1n;
  }
  return {
    stdin: `${a} ${b} ${m}\n`,
    expected_output: `${res.toString()}\n`
  };
}

// ----------------------------------------------------------------------------
// Problem 6: Balanced Parentheses (Stack)
// ----------------------------------------------------------------------------
function genParentheses(len = 40) {
  const opens = "([{";
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const shouldBeValid = Math.random() > 0.5;
  if (shouldBeValid) {
    let s = "";
    const stack = [];
    for (let i = 0; i < len / 2; i++) {
      const op = opens[randomInt(0, 2)];
      s += op;
      stack.push(pairs[op]);
    }
    while (stack.length > 0) s += stack.pop();
    return { stdin: `${s}\n`, expected_output: "VALID\n" };
  } else {
    const all = "()[]{}";
    let s = "";
    for (let i = 0; i < len; i++) s += all[randomInt(0, all.length - 1)];
    const st = [];
    let ok = true;
    for (const c of s) {
      if (opens.includes(c)) st.push(pairs[c]);
      else {
        if (!st.length || st.pop() !== c) { ok = false; break; }
      }
    }
    if (st.length) ok = false;
    return { stdin: `${s}\n`, expected_output: ok ? "VALID\n" : "INVALID\n" };
  }
}

// ----------------------------------------------------------------------------
// Problem 7: Prime Sieve Count (Array Memory & Math)
// ----------------------------------------------------------------------------
function genPrimeSieve(maxN = 10000) {
  const n = randomInt(500, maxN);
  const isPrime = new Uint8Array(n + 1);
  isPrime.fill(1);
  isPrime[0] = isPrime[1] = 0;
  for (let p = 2; p * p <= n; p++) {
    if (isPrime[p]) {
      for (let i = p * p; i <= n; i += p) isPrime[i] = 0;
    }
  }
  let count = 0;
  for (let i = 2; i <= n; i++) if (isPrime[i]) count++;
  return {
    stdin: `${n}\n`,
    expected_output: `${count}\n`
  };
}

// ----------------------------------------------------------------------------
// Problem 8: BFS Shortest Path on Graph (Graph Theory / Queue)
// ----------------------------------------------------------------------------
function genBFSGraph(v = 15) {
  const eList = [];
  const adj = Array.from({ length: v }, () => []);
  for (let i = 0; i < v - 1; i++) {
    const u = i, w = i + 1;
    eList.push(`${u} ${w}`);
    adj[u].push(w);
    adj[w].push(u);
  }
  for (let i = 0; i < Math.floor(v / 2); i++) {
    const u = randomInt(0, v - 1);
    const w = randomInt(0, v - 1);
    if (u !== w) {
      eList.push(`${u} ${w}`);
      adj[u].push(w);
      adj[w].push(u);
    }
  }
  const start = 0, target = v - 1;
  const dist = new Array(v).fill(-1);
  const q = [start];
  dist[start] = 0;
  while (q.length > 0) {
    const curr = q.shift();
    if (curr === target) break;
    for (const next of adj[curr]) {
      if (dist[next] === -1) {
        dist[next] = dist[curr] + 1;
        q.push(next);
      }
    }
  }
  return {
    stdin: `${v} ${eList.length} ${start} ${target}\n${eList.join("\n")}\n`,
    expected_output: `${dist[target]}\n`
  };
}

// ----------------------------------------------------------------------------
// Problem 9: String Run-Length Compression (String Parsing)
// ----------------------------------------------------------------------------
function genRunLength(len = 50) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let s = "";
  let curLen = 0;
  while (curLen < len) {
    const ch = letters[randomInt(0, letters.length - 1)];
    const count = randomInt(1, 6);
    s += ch.repeat(count);
    curLen += count;
  }
  let res = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    let run = 1;
    while (i + 1 < s.length && s[i + 1] === c) {
      run++;
      i++;
    }
    res += `${c}${run}`;
    i++;
  }
  return {
    stdin: `${s}\n`,
    expected_output: `${res}\n`
  };
}

// ----------------------------------------------------------------------------
// Problem 10: Binary Search Lower Bound (Logarithmic Search)
// ----------------------------------------------------------------------------
function genBinarySearch(size = 40) {
  const arr = [];
  let cur = randomInt(1, 10);
  for (let i = 0; i < size; i++) {
    cur += randomInt(1, 15);
    arr.push(cur);
  }
  const target = randomInt(arr[0] - 5, arr[size - 1] + 5);
  let l = 0, r = size, ans = -1;
  while (l < r) {
    const mid = (l + r) >> 1;
    if (arr[mid] >= target) {
      ans = mid;
      r = mid;
    } else {
      l = mid + 1;
    }
  }
  return {
    stdin: `${size}\n${arr.join(" ")}\n${target}\n`,
    expected_output: `${ans}\n`
  };
}

// ============================================================================
// 10 DSA PROBLEMS DEFINITIONS WITH MULTI-LANGUAGE IMPLEMENTATIONS
// ============================================================================
const PROBLEMS = {
  kadane: {
    id: "kadane",
    name: "Kadane Max Subarray",
    generator: genKadane,
    solutions: {
      c: `#include <stdio.h>
int main() {
    int n;
    if (scanf("%d", &n) != 1 || n <= 0) return 0;
    long long x, max_so_far, curr;
    if (scanf("%lld", &x) != 1) return 0;
    max_so_far = curr = x;
    for (int i = 1; i < n; i++) {
        if (scanf("%lld", &x) != 1) break;
        curr = (x > curr + x) ? x : curr + x;
        if (curr > max_so_far) max_so_far = curr;
    }
    printf("%lld\\n", max_so_far);
    return 0;
}`,
      cpp: `#include <iostream>
#include <algorithm>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false); cin.tie(NULL);
    int n; if (!(cin >> n) || n <= 0) return 0;
    long long x, max_so_far, curr; cin >> x;
    max_so_far = curr = x;
    for (int i = 1; i < n; i++) {
        cin >> x;
        curr = max(x, curr + x);
        max_so_far = max(max_so_far, curr);
    }
    cout << max_so_far << "\\n";
    return 0;
}`,
      java: `import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.StringTokenizer;
public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String line = br.readLine();
        while (line != null && line.trim().isEmpty()) line = br.readLine();
        if (line == null) return;
        StringTokenizer st = new StringTokenizer(line);
        if (!st.hasMoreTokens()) return;
        int n = Integer.parseInt(st.nextToken());
        long maxSoFar = 0, curr = 0;
        for (int i = 0; i < n; i++) {
            while (!st.hasMoreTokens()) { line = br.readLine(); if (line == null) break; st = new StringTokenizer(line); }
            long x = Long.parseLong(st.nextToken());
            if (i == 0) { maxSoFar = curr = x; }
            else { curr = Math.max(x, curr + x); maxSoFar = Math.max(maxSoFar, curr); }
        }
        System.out.println(maxSoFar);
    }
}`,
      python: `import sys
def main():
    data = sys.stdin.read().split()
    if not data: return
    n = int(data[0])
    nums = [int(v) for v in data[1:n+1]]
    if not nums: return
    max_so_far = curr = nums[0]
    for x in nums[1:]:
        curr = max(x, curr + x)
        max_so_far = max(max_so_far, curr)
    print(max_so_far)
if __name__ == '__main__': main()`
    }
  },

  twosum: {
    id: "twosum",
    name: "Two Sum Sorted",
    generator: genTwoSum,
    solutions: {
      c: `#include <stdio.h>
#include <stdlib.h>
int main() {
    int n; if (scanf("%d", &n) != 1 || n <= 0) return 0;
    long long *a = (long long*)malloc(n * sizeof(long long));
    for (int i = 0; i < n; i++) scanf("%lld", &a[i]);
    long long target; scanf("%lld", &target);
    int l = 0, r = n - 1, found = 0;
    while (l < r) {
        long long s = a[l] + a[r];
        if (s == target) { found = 1; break; }
        else if (s < target) l++;
        else r--;
    }
    printf("%s\\n", found ? "YES" : "NO");
    free(a);
    return 0;
}`,
      cpp: `#include <iostream>
#include <vector>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false); cin.tie(NULL);
    int n; if (!(cin >> n) || n <= 0) return 0;
    vector<long long> a(n);
    for (int i = 0; i < n; i++) cin >> a[i];
    long long target; cin >> target;
    int l = 0, r = n - 1; bool found = false;
    while (l < r) {
        long long s = a[l] + a[r];
        if (s == target) { found = true; break; }
        else if (s < target) l++;
        else r--;
    }
    cout << (found ? "YES\\n" : "NO\\n");
    return 0;
}`,
      java: `import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.StringTokenizer;
public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String line = br.readLine();
        while (line != null && line.trim().isEmpty()) line = br.readLine();
        if (line == null) return;
        StringTokenizer st = new StringTokenizer(line);
        int n = Integer.parseInt(st.nextToken());
        long[] a = new long[n];
        for (int i = 0; i < n; i++) {
            while (!st.hasMoreTokens()) { line = br.readLine(); st = new StringTokenizer(line); }
            a[i] = Long.parseLong(st.nextToken());
        }
        while (!st.hasMoreTokens()) { line = br.readLine(); st = new StringTokenizer(line); }
        long target = Long.parseLong(st.nextToken());
        int l = 0, r = n - 1; boolean found = false;
        while (l < r) {
            long s = a[l] + a[r];
            if (s == target) { found = true; break; }
            else if (s < target) l++;
            else r--;
        }
        System.out.println(found ? "YES" : "NO");
    }
}`,
      python: `import sys
def main():
    data = sys.stdin.read().split()
    if not data: return
    n = int(data[0])
    a = [int(v) for v in data[1:n+1]]
    target = int(data[n+1])
    l, r = 0, n - 1
    found = False
    while l < r:
        s = a[l] + a[r]
        if s == target: found = True; break
        elif s < target: l += 1
        else: r -= 1
    print("YES" if found else "NO")
if __name__ == '__main__': main()`
    }
  },

  knapsack: {
    id: "knapsack",
    name: "0/1 Knapsack DP",
    generator: genKnapsack,
    solutions: {
      c: `#include <stdio.h>
#include <string.h>
int main() {
    int n, W;
    if (scanf("%d %d", &n, &W) != 2) return 0;
    int w[n], v[n];
    for (int i = 0; i < n; i++) scanf("%d", &w[i]);
    for (int i = 0; i < n; i++) scanf("%d", &v[i]);
    int dp[W + 1];
    memset(dp, 0, sizeof(dp));
    for (int i = 0; i < n; i++) {
        for (int j = W; j >= w[i]; j--) {
            if (dp[j - w[i]] + v[i] > dp[j]) dp[j] = dp[j - w[i]] + v[i];
        }
    }
    printf("%d\\n", dp[W]);
    return 0;
}`,
      cpp: `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false); cin.tie(NULL);
    int n, W; if (!(cin >> n >> W)) return 0;
    vector<int> w(n), v(n);
    for (int i = 0; i < n; i++) cin >> w[i];
    for (int i = 0; i < n; i++) cin >> v[i];
    vector<int> dp(W + 1, 0);
    for (int i = 0; i < n; i++) {
        for (int j = W; j >= w[i]; j--) dp[j] = max(dp[j], dp[j - w[i]] + v[i]);
    }
    cout << dp[W] << "\\n";
    return 0;
}`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt(), W = sc.nextInt();
        int[] w = new int[n], v = new int[n];
        for (int i = 0; i < n; i++) w[i] = sc.nextInt();
        for (int i = 0; i < n; i++) v[i] = sc.nextInt();
        int[] dp = new int[W + 1];
        for (int i = 0; i < n; i++) {
            for (int j = W; j >= w[i]; j--) dp[j] = Math.max(dp[j], dp[j - w[i]] + v[i]);
        }
        System.out.println(dp[W]);
    }
}`,
      python: `import sys
def main():
    data = sys.stdin.read().split()
    if not data: return
    n, W = int(data[0]), int(data[1])
    w = [int(x) for x in data[2:2+n]]
    v = [int(x) for x in data[2+n:2+2*n]]
    dp = [0] * (W + 1)
    for i in range(n):
        wi, vi = w[i], v[i]
        for j in range(W, wi - 1, -1):
            if dp[j - wi] + vi > dp[j]:
                dp[j] = dp[j - wi] + vi
    print(dp[W])
if __name__ == '__main__': main()`
    }
  },

  lis: {
    id: "lis",
    name: "Longest Increasing Subsequence",
    generator: genLIS,
    solutions: {
      c: `#include <stdio.h>
int main() {
    int n; if (scanf("%d", &n) != 1 || n <= 0) return 0;
    int arr[n], tails[n], len = 0;
    for (int i = 0; i < n; i++) {
        scanf("%d", &arr[i]);
        int l = 0, r = len;
        while (l < r) {
            int m = (l + r) / 2;
            if (tails[m] < arr[i]) l = m + 1;
            else r = m;
        }
        tails[l] = arr[i];
        if (l == len) len++;
    }
    printf("%d\\n", len);
    return 0;
}`,
      cpp: `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false); cin.tie(NULL);
    int n; if (!(cin >> n) || n <= 0) return 0;
    vector<int> tails;
    for (int i = 0; i < n; i++) {
        int x; cin >> x;
        auto it = lower_bound(tails.begin(), tails.end(), x);
        if (it == tails.end()) tails.push_back(x);
        else *it = x;
    }
    cout << tails.size() << "\\n";
    return 0;
}`,
      java: `import java.util.Scanner;
import java.util.ArrayList;
import java.util.Collections;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        ArrayList<Integer> tails = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            int x = sc.nextInt();
            int idx = Collections.binarySearch(tails, x);
            if (idx < 0) idx = -(idx + 1);
            if (idx == tails.size()) tails.add(x);
            else tails.set(idx, x);
        }
        System.out.println(tails.size());
    }
}`,
      python: `import sys
import bisect
def main():
    data = sys.stdin.read().split()
    if not data: return
    n = int(data[0])
    arr = [int(v) for v in data[1:n+1]]
    tails = []
    for x in arr:
        idx = bisect.bisect_left(tails, x)
        if idx == len(tails): tails.append(x)
        else: tails[idx] = x
    print(len(tails))
if __name__ == '__main__': main()`
    }
  },

  modexp: {
    id: "modexp",
    name: "Modular Exponentiation",
    generator: genModExp,
    solutions: {
      c: `#include <stdio.h>
int main() {
    long long a, b, m;
    if (scanf("%lld %lld %lld", &a, &b, &m) != 3) return 0;
    long long res = 1;
    a %= m;
    while (b > 0) {
        if (b & 1) res = (res * a) % m;
        a = (a * a) % m;
        b >>= 1;
    }
    printf("%lld\\n", res);
    return 0;
}`,
      cpp: `#include <iostream>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false); cin.tie(NULL);
    long long a, b, m; if (!(cin >> a >> b >> m)) return 0;
    long long res = 1; a %= m;
    while (b > 0) {
        if (b & 1) res = (res * a) % m;
        a = (a * a) % m;
        b >>= 1;
    }
    cout << res << "\\n";
    return 0;
}`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextLong()) return;
        long a = sc.nextLong(), b = sc.nextLong(), m = sc.nextLong();
        long res = 1; a %= m;
        while (b > 0) {
            if ((b & 1) == 1) res = (res * a) % m;
            a = (a * a) % m;
            b >>= 1;
        }
        System.out.println(res);
    }
}`,
      python: `import sys
def main():
    parts = sys.stdin.read().split()
    if len(parts) >= 3:
        a, b, m = int(parts[0]), int(parts[1]), int(parts[2])
        print(pow(a, b, m))
if __name__ == '__main__': main()`
    }
  },

  parentheses: {
    id: "parentheses",
    name: "Balanced Parentheses",
    generator: genParentheses,
    solutions: {
      c: `#include <stdio.h>
#include <string.h>
int main() {
    char s[10000]; if (scanf("%9999s", s) != 1) return 0;
    char stack[10000]; int top = 0, ok = 1;
    for (int i = 0; s[i]; i++) {
        char c = s[i];
        if (c == '(' || c == '[' || c == '{') stack[top++] = c;
        else if (c == ')' || c == ']' || c == '}') {
            if (top == 0) { ok = 0; break; }
            char prev = stack[--top];
            if ((c == ')' && prev != '(') || (c == ']' && prev != '[') || (c == '}' && prev != '{')) { ok = 0; break; }
        }
    }
    if (top != 0) ok = 0;
    printf("%s\\n", ok ? "VALID" : "INVALID");
    return 0;
}`,
      cpp: `#include <iostream>
#include <string>
#include <vector>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false); cin.tie(NULL);
    string s; if (!(cin >> s)) return 0;
    vector<char> st; bool ok = true;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') st.push_back(c);
        else if (c == ')' || c == ']' || c == '}') {
            if (st.empty()) { ok = false; break; }
            char prev = st.back(); st.pop_back();
            if ((c == ')' && prev != '(') || (c == ']' && prev != '[') || (c == '}' && prev != '{')) { ok = false; break; }
        }
    }
    if (!st.empty()) ok = false;
    cout << (ok ? "VALID\\n" : "INVALID\\n");
    return 0;
}`,
      java: `import java.util.Scanner;
import java.util.ArrayList;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNext()) return;
        String s = sc.next();
        ArrayList<Character> st = new ArrayList<>();
        boolean ok = true;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '(' || c == '[' || c == '{') st.add(c);
            else if (c == ')' || c == ']' || c == '}') {
                if (st.isEmpty()) { ok = false; break; }
                char prev = st.remove(st.size() - 1);
                if ((c == ')' && prev != '(') || (c == ']' && prev != '[') || (c == '}' && prev != '{')) { ok = false; break; }
            }
        }
        if (!st.isEmpty()) ok = false;
        System.out.println(ok ? "VALID" : "INVALID");
    }
}`,
      python: `import sys
def main():
    s = sys.stdin.read().strip()
    if not s: return
    st = []; pairs = {')': '(', ']': '[', '}': '{'}; ok = True
    for c in s:
        if c in '([{': st.append(c)
        elif c in ')]}':
            if not st or st[-1] != pairs[c]: ok = False; break
            st.pop()
    if st: ok = False
    print("VALID" if ok else "INVALID")
if __name__ == '__main__': main()`
    }
  },

  primesieve: {
    id: "primesieve",
    name: "Prime Sieve Count",
    generator: genPrimeSieve,
    solutions: {
      c: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
int main() {
    int n; if (scanf("%d", &n) != 1 || n < 2) { printf("0\\n"); return 0; }
    char *prime = (char*)malloc(n + 1);
    memset(prime, 1, n + 1);
    prime[0] = prime[1] = 0;
    for (int p = 2; p * p <= n; p++) {
        if (prime[p]) {
            for (int i = p * p; i <= n; i += p) prime[i] = 0;
        }
    }
    int count = 0;
    for (int i = 2; i <= n; i++) if (prime[i]) count++;
    printf("%d\\n", count);
    free(prime);
    return 0;
}`,
      cpp: `#include <iostream>
#include <vector>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false); cin.tie(NULL);
    int n; if (!(cin >> n) || n < 2) { cout << "0\\n"; return 0; }
    vector<bool> prime(n + 1, true);
    prime[0] = prime[1] = false;
    for (int p = 2; p * p <= n; p++) {
        if (prime[p]) {
            for (int i = p * p; i <= n; i += p) prime[i] = false;
        }
    }
    int count = 0;
    for (int i = 2; i <= n; i++) if (prime[i]) count++;
    cout << count << "\\n";
    return 0;
}`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        if (n < 2) { System.out.println(0); return; }
        boolean[] prime = new boolean[n + 1];
        for (int i = 2; i <= n; i++) prime[i] = true;
        for (int p = 2; p * p <= n; p++) {
            if (prime[p]) {
                for (int i = p * p; i <= n; i += p) prime[i] = false;
            }
        }
        int count = 0;
        for (int i = 2; i <= n; i++) if (prime[i]) count++;
        System.out.println(count);
    }
}`,
      python: `import sys
def main():
    data = sys.stdin.read().split()
    if not data: return
    n = int(data[0])
    if n < 2:
        print(0); return
    prime = bytearray([1]) * (n + 1)
    prime[0] = prime[1] = 0
    p = 2
    while p * p <= n:
        if prime[p]:
            prime[p * p : n + 1 : p] = bytearray((n - p * p) // p + 1)
        p += 1
    print(sum(prime))
if __name__ == '__main__': main()`
    }
  },

  bfs: {
    id: "bfs",
    name: "BFS Shortest Path",
    generator: genBFSGraph,
    solutions: {
      c: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef struct Node { int v; struct Node* next; } Node;
int main() {
    int v, e, s, t;
    if (scanf("%d %d %d %d", &v, &e, &s, &t) != 4) return 0;
    Node** adj = (Node**)calloc(v, sizeof(Node*));
    for (int i = 0; i < e; i++) {
        int u, w; scanf("%d %d", &u, &w);
        Node* n1 = (Node*)malloc(sizeof(Node)); n1->v = w; n1->next = adj[u]; adj[u] = n1;
        Node* n2 = (Node*)malloc(sizeof(Node)); n2->v = u; n2->next = adj[w]; adj[w] = n2;
    }
    int dist[v], q[v], head = 0, tail = 0;
    memset(dist, -1, sizeof(dist));
    dist[s] = 0; q[tail++] = s;
    while (head < tail) {
        int curr = q[head++];
        if (curr == t) break;
        for (Node* p = adj[curr]; p; p = p->next) {
            if (dist[p->v] == -1) { dist[p->v] = dist[curr] + 1; q[tail++] = p->v; }
        }
    }
    printf("%d\\n", dist[t]);
    return 0;
}`,
      cpp: `#include <iostream>
#include <vector>
#include <queue>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false); cin.tie(NULL);
    int v, e, s, t; if (!(cin >> v >> e >> s >> t)) return 0;
    vector<vector<int>> adj(v);
    for (int i = 0; i < e; i++) {
        int u, w; cin >> u >> w;
        adj[u].push_back(w); adj[w].push_back(u);
    }
    vector<int> dist(v, -1);
    queue<int> q;
    dist[s] = 0; q.push(s);
    while (!q.empty()) {
        int curr = q.front(); q.pop();
        if (curr == t) break;
        for (int next : adj[curr]) {
            if (dist[next] == -1) { dist[next] = dist[curr] + 1; q.push(next); }
        }
    }
    cout << dist[t] << "\\n";
    return 0;
}`,
      java: `import java.util.Scanner;
import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.Arrays;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int v = sc.nextInt(), e = sc.nextInt(), s = sc.nextInt(), t = sc.nextInt();
        ArrayList<Integer>[] adj = new ArrayList[v];
        for (int i = 0; i < v; i++) adj[i] = new ArrayList<>();
        for (int i = 0; i < e; i++) {
            int u = sc.nextInt(), w = sc.nextInt();
            adj[u].add(w); adj[w].add(u);
        }
        int[] dist = new int[v];
        Arrays.fill(dist, -1);
        ArrayDeque<Integer> q = new ArrayDeque<>();
        dist[s] = 0; q.add(s);
        while (!q.isEmpty()) {
            int curr = q.poll();
            if (curr == t) break;
            for (int next : adj[curr]) {
                if (dist[next] == -1) { dist[next] = dist[curr] + 1; q.add(next); }
            }
        }
        System.out.println(dist[t]);
    }
}`,
      python: `import sys
from collections import deque
def main():
    data = sys.stdin.read().split()
    if not data: return
    v, e, s, t = int(data[0]), int(data[1]), int(data[2]), int(data[3])
    adj = [[] for _ in range(v)]
    idx = 4
    for _ in range(e):
        u, w = int(data[idx]), int(data[idx+1])
        adj[u].append(w); adj[w].append(u)
        idx += 2
    dist = [-1] * v
    dist[s] = 0
    q = deque([s])
    while q:
        curr = q.popleft()
        if curr == t: break
        for nxt in adj[curr]:
            if dist[nxt] == -1:
                dist[nxt] = dist[curr] + 1
                q.append(nxt)
    print(dist[t])
if __name__ == '__main__': main()`
    }
  },

  runlength: {
    id: "runlength",
    name: "Run Length Encoding",
    generator: genRunLength,
    solutions: {
      c: `#include <stdio.h>
#include <string.h>
int main() {
    char s[10000]; if (scanf("%9999s", s) != 1) return 0;
    int len = strlen(s), i = 0;
    while (i < len) {
        char c = s[i]; int run = 1;
        while (i + 1 < len && s[i + 1] == c) { run++; i++; }
        printf("%c%d", c, run);
        i++;
    }
    printf("\\n");
    return 0;
}`,
      cpp: `#include <iostream>
#include <string>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false); cin.tie(NULL);
    string s; if (!(cin >> s)) return 0;
    int n = s.size(), i = 0;
    string res = "";
    while (i < n) {
        char c = s[i]; int run = 1;
        while (i + 1 < n && s[i + 1] == c) { run++; i++; }
        res += c + to_string(run);
        i++;
    }
    cout << res << "\\n";
    return 0;
}`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNext()) return;
        String s = sc.next();
        StringBuilder sb = new StringBuilder();
        int n = s.length(), i = 0;
        while (i < n) {
            char c = s.charAt(i); int run = 1;
            while (i + 1 < n && s.charAt(i + 1) == c) { run++; i++; }
            sb.append(c).append(run);
            i++;
        }
        System.out.println(sb.toString());
    }
}`,
      python: `import sys
def main():
    s = sys.stdin.read().strip()
    if not s: return
    res = []; n = len(s); i = 0
    while i < n:
        c = s[i]; run = 1
        while i + 1 < n and s[i+1] == c:
            run += 1; i += 1
        res.append(f"{c}{run}")
        i += 1
    print("".join(res))
if __name__ == '__main__': main()`
    }
  },

  binsearch: {
    id: "binsearch",
    name: "Binary Search Lower Bound",
    generator: genBinarySearch,
    solutions: {
      c: `#include <stdio.h>
int main() {
    int n; if (scanf("%d", &n) != 1 || n <= 0) return 0;
    long long a[n]; for (int i = 0; i < n; i++) scanf("%lld", &a[i]);
    long long target; scanf("%lld", &target);
    int l = 0, r = n, ans = -1;
    while (l < r) {
        int m = (l + r) / 2;
        if (a[m] >= target) { ans = m; r = m; }
        else l = m + 1;
    }
    printf("%d\\n", ans);
    return 0;
}`,
      cpp: `#include <iostream>
#include <vector>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false); cin.tie(NULL);
    int n; if (!(cin >> n) || n <= 0) return 0;
    vector<long long> a(n); for (int i = 0; i < n; i++) cin >> a[i];
    long long target; cin >> target;
    int l = 0, r = n, ans = -1;
    while (l < r) {
        int m = (l + r) / 2;
        if (a[m] >= target) { ans = m; r = m; }
        else l = m + 1;
    }
    cout << ans << "\\n";
    return 0;
}`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        long[] a = new long[n];
        for (int i = 0; i < n; i++) a[i] = sc.nextLong();
        long target = sc.nextLong();
        int l = 0, r = n, ans = -1;
        while (l < r) {
            int m = (l + r) / 2;
            if (a[m] >= target) { ans = m; r = m; }
            else l = m + 1;
        }
        System.out.println(ans);
    }
}`,
      python: `import sys
def main():
    data = sys.stdin.read().split()
    if not data: return
    n = int(data[0])
    a = [int(v) for v in data[1:n+1]]
    target = int(data[n+1])
    l, r, ans = 0, n, -1
    while l < r:
        m = (l + r) // 2
        if a[m] >= target: ans = m; r = m
        else: l = m + 1
    print(ans)
if __name__ == '__main__': main()`
    }
  }
};

const LANG_CONFIG = {
  c: { id: 50, name: "C (GCC 12.2.0)" },
  cpp: { id: 54, name: "C++ (G++ 12.2.0)" },
  java: { id: 62, name: "Java (OpenJDK 21)" },
  python: { id: 71, name: "Python (3.11.2)" }
};

module.exports = {
  PROBLEMS,
  LANG_CONFIG,
  randomInt
};
