// Library of Real DSA Problems with Solutions in all 4 Languages

const problems = [
  // 1. Kadane's Algorithm (Maximum Subarray Sum)
  {
    id: "kadane",
    name: "Kadane Max Subarray",
    testCases: [
      { stdin: "8\n-2 -3 4 -1 -2 1 5 -3\n", expected_output: "7\n" },
      { stdin: "5\n-1 -2 -3 -4 -5\n", expected_output: "-1\n" },
      { stdin: "4\n1 2 3 4\n", expected_output: "10\n" },
      { stdin: "1\n42\n", expected_output: "42\n" },
      { stdin: "6\n0 0 -1 0 0 5\n", expected_output: "5\n" }
    ],
    solutions: {
      c: `#include <stdio.h>
int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    long long max_so_far, max_ending_here;
    long long x;
    scanf("%lld", &x);
    max_so_far = max_ending_here = x;
    for (int i = 1; i < n; i++) {
        scanf("%lld", &x);
        max_ending_here = (x > max_ending_here + x) ? x : max_ending_here + x;
        if (max_ending_here > max_so_far) max_so_far = max_ending_here;
    }
    printf("%lld\n", max_so_far);
    return 0;
}`,
      cpp: `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    int n;
    if (!(cin >> n)) return 0;
    long long x;
    cin >> x;
    long long max_so_far = x, curr = x;
    for (int i = 1; i < n; i++) {
        cin >> x;
        curr = max(x, curr + x);
        max_so_far = max(max_so_far, curr);
    }
    cout << max_so_far << "\n";
    return 0;
}`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        long x = sc.nextLong();
        long maxSoFar = x, curr = x;
        for (int i = 1; i < n; i++) {
            x = sc.nextLong();
            curr = Math.max(x, curr + x);
            maxSoFar = Math.max(maxSoFar, curr);
        }
        System.out.println(maxSoFar);
    }
}`,
      python: `import sys
lines = sys.stdin.read().split()
if lines:
    n = int(lines[0])
    nums = [int(v) for v in lines[1:n+1]]
    curr = max_so_far = nums[0]
    for x in nums[1:]:
        curr = max(x, curr + x)
        max_so_far = max(max_so_far, curr)
    print(max_so_far)
`
    }
  },

  // 2. 0/1 Knapsack (Dynamic Programming)
  {
    id: "knapsack",
    name: "0/1 Knapsack DP",
    testCases: [
      { stdin: "3 50\n60 10\n100 20\n120 30\n", expected_output: "220\n" },
      { stdin: "4 10\n10 5\n40 4\n30 6\n50 3\n", expected_output: "90\n" },
      { stdin: "1 5\n100 10\n", expected_output: "0\n" },
      { stdin: "2 15\n20 5\n30 10\n", expected_output: "50\n" }
    ],
    solutions: {
      c: `#include <stdio.h>
#define MAX(a, b) ((a) > (b) ? (a) : (b))
int dp[105][1005];
int val[105], wt[105];
int main() {
    int n, W;
    if (scanf("%d %d", &n, &W) != 2) return 0;
    for (int i = 0; i < n; i++) scanf("%d %d", &val[i], &wt[i]);
    for (int i = 1; i <= n; i++) {
        for (int w = 0; w <= W; w++) {
            if (wt[i - 1] <= w)
                dp[i][w] = MAX(val[i - 1] + dp[i - 1][w - wt[i - 1]], dp[i - 1][w]);
            else
                dp[i][w] = dp[i - 1][w];
        }
    }
    printf("%d\n", dp[n][W]);
    return 0;
}`,
      cpp: `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main() {
    int n, W;
    if (!(cin >> n >> W)) return 0;
    vector<int> val(n), wt(n);
    for (int i = 0; i < n; i++) cin >> val[i] >> wt[i];
    vector<int> dp(W + 1, 0);
    for (int i = 0; i < n; i++) {
        for (int w = W; w >= wt[i]; w--) {
            dp[w] = max(dp[w], val[i] + dp[w - wt[i]]);
        }
    }
    cout << dp[W] << "\n";
    return 0;
}`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        int W = sc.nextInt();
        int[] val = new int[n];
        int[] wt = new int[n];
        for (int i = 0; i < n; i++) {
            val[i] = sc.nextInt();
            wt[i] = sc.nextInt();
        }
        int[] dp = new int[W + 1];
        for (int i = 0; i < n; i++) {
            for (int w = W; w >= wt[i]; w--) {
                dp[w] = Math.max(dp[w], val[i] + dp[w - wt[i]]);
            }
        }
        System.out.println(dp[W]);
    }
}`,
      python: `import sys
inp = sys.stdin.read().split()
if inp:
    n, W = int(inp[0]), int(inp[1])
    idx = 2
    dp = [0] * (W + 1)
    for _ in range(n):
        v, w = int(inp[idx]), int(inp[idx+1])
        idx += 2
        for cap in range(W, w - 1, -1):
            dp[cap] = max(dp[cap], v + dp[cap - w])
    print(dp[W])
`
    }
  },

  // 3. Graph BFS Shortest Path
  {
    id: "bfs_graph",
    name: "Graph BFS Shortest Path",
    testCases: [
      { stdin: "4 4\n1 2\n2 3\n3 4\n1 3\n1 4\n", expected_output: "2\n" },
      { stdin: "3 1\n1 2\n1 3\n", expected_output: "-1\n" },
      { stdin: "2 1\n1 2\n1 2\n", expected_output: "1\n" },
      { stdin: "5 4\n1 2\n2 3\n3 4\n4 5\n1 5\n", expected_output: "4\n" }
    ],
    solutions: {
      c: `#include <stdio.h>
#include <string.h>
int adj[50][50];
int dist[50];
int q[100], head = 0, tail = 0;
int main() {
    int n, m;
    if (scanf("%d %d", &n, &m) != 2) return 0;
    memset(adj, 0, sizeof(adj));
    memset(dist, -1, sizeof(dist));
    for (int i = 0; i < m; i++) {
        int u, v;
        scanf("%d %d", &u, &v);
        adj[u][v] = adj[v][u] = 1;
    }
    int src, dst;
    scanf("%d %d", &src, &dst);
    dist[src] = 0;
    q[tail++] = src;
    while (head < tail) {
        int u = q[head++];
        if (u == dst) break;
        for (int v = 1; v <= n; v++) {
            if (adj[u][v] && dist[v] == -1) {
                dist[v] = dist[u] + 1;
                q[tail++] = v;
            }
        }
    }
    printf("%d\n", dist[dst]);
    return 0;
}`,
      cpp: `#include <iostream>
#include <vector>
#include <queue>
using namespace std;
int main() {
    int n, m;
    if (!(cin >> n >> m)) return 0;
    vector<vector<int>> g(n + 1);
    for (int i = 0; i < m; i++) {
        int u, v;
        cin >> u >> v;
        g[u].push_back(v);
        g[v].push_back(u);
    }
    int src, dst;
    cin >> src >> dst;
    vector<int> dist(n + 1, -1);
    queue<int> q;
    dist[src] = 0;
    q.push(src);
    while (!q.empty()) {
        int u = q.front(); q.pop();
        if (u == dst) break;
        for (int v : g[u]) {
            if (dist[v] == -1) {
                dist[v] = dist[u] + 1;
                q.push(v);
            }
        }
    }
    cout << dist[dst] << "\n";
    return 0;
}`,
      java: `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        int m = sc.nextInt();
        List<List<Integer>> g = new ArrayList<>();
        for (int i = 0; i <= n; i++) g.add(new ArrayList<>());
        for (int i = 0; i < m; i++) {
            int u = sc.nextInt(), v = sc.nextInt();
            g.get(u).add(v);
            g.get(v).add(u);
        }
        int src = sc.nextInt(), dst = sc.nextInt();
        int[] dist = new int[n + 1];
        Arrays.fill(dist, -1);
        Queue<Integer> q = new LinkedList<>();
        dist[src] = 0;
        q.add(src);
        while (!q.isEmpty()) {
            int u = q.poll();
            if (u == dst) break;
            for (int v : g.get(u)) {
                if (dist[v] == -1) {
                    dist[v] = dist[u] + 1;
                    q.add(v);
                }
            }
        }
        System.out.println(dist[dst]);
    }
}`,
      python: `import sys
from collections import deque
inp = sys.stdin.read().split()
if inp:
    n, m = int(inp[0]), int(inp[1])
    idx = 2
    g = [[] for _ in range(n + 1)]
    for _ in range(m):
        u, v = int(inp[idx]), int(inp[idx+1])
        idx += 2
        g[u].append(v)
        g[v].append(u)
    src, dst = int(inp[idx]), int(inp[idx+1])
    dist = [-1] * (n + 1)
    dist[src] = 0
    q = deque([src])
    while q:
        u = q.popleft()
        if u == dst:
            break
        for v in g[u]:
            if dist[v] == -1:
                dist[v] = dist[u] + 1
                q.append(v)
    print(dist[dst])
`
    }
  },

  // 4. Valid Parentheses (Stack)
  {
    id: "parentheses",
    name: "Valid Parentheses Stack",
    testCases: [
      { stdin: "()[]{}\n", expected_output: "VALID\n" },
      { stdin: "([)]\n", expected_output: "INVALID\n" },
      { stdin: "{[]}\n", expected_output: "VALID\n" },
      { stdin: "(((\n", expected_output: "INVALID\n" },
      { stdin: "}\n", expected_output: "INVALID\n" }
    ],
    solutions: {
      c: `#include <stdio.h>
#include <string.h>
char stack[1000];
int top = -1;
int main() {
    char s[1000];
    if (scanf("%s", s) != 1) return 0;
    int valid = 1;
    for (int i = 0; s[i]; i++) {
        char c = s[i];
        if (c == '(' || c == '[' || c == '{') stack[++top] = c;
        else {
            if (top == -1) { valid = 0; break; }
            char open = stack[top--];
            if ((c == ')' && open != '(') || (c == ']' && open != '[') || (c == '}' && open != '{')) {
                valid = 0; break;
            }
        }
    }
    if (top != -1) valid = 0;
    printf("%s\n", valid ? "VALID" : "INVALID");
    return 0;
}`,
      cpp: `#include <iostream>
#include <string>
#include <stack>
using namespace std;
int main() {
    string s;
    if (!(cin >> s)) return 0;
    stack<char> st;
    bool ok = true;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') st.push(c);
        else {
            if (st.empty()) { ok = false; break; }
            char top = st.top(); st.pop();
            if ((c == ')' && top != '(') || (c == ']' && top != '[') || (c == '}' && top != '{')) {
                ok = false; break;
            }
        }
    }
    if (!st.empty()) ok = false;
    cout << (ok ? "VALID" : "INVALID") << "\n";
    return 0;
}`,
      java: `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNext()) return;
        String s = sc.next();
        Deque<Character> st = new ArrayDeque<>();
        boolean ok = true;
        for (char c : s.toCharArray()) {
            if (c == '(' || c == '[' || c == '{') st.push(c);
            else {
                if (st.isEmpty()) { ok = false; break; }
                char top = st.pop();
                if ((c == ')' && top != '(') || (c == ']' && top != '[') || (c == '}' && top != '{')) {
                    ok = false; break;
                }
            }
        }
        if (!st.isEmpty()) ok = false;
        System.out.println(ok ? "VALID" : "INVALID");
    }
}`,
      python: `import sys
s = sys.stdin.read().strip()
if s:
    st = []
    pairs = {')': '(', ']': '[', '}': '{'}
    ok = True
    for c in s:
        if c in '([{':
            st.append(c)
        elif c in pairs:
            if not st or st[-1] != pairs[c]:
                ok = False
                break
            st.pop()
    if st:
        ok = False
    print("VALID" if ok else "INVALID")
`
    }
  }
];

module.exports = problems;
