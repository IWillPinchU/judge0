// Dynamic Algorithmic Generators for Massive Test Cases

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 1. Kadane Max Subarray Generator (Random array of sizes 10 to 500)
function generateKadaneTestCase(size = 50) {
  const arr = [];
  for (let i = 0; i < size; i++) {
    arr.push(randomInt(-500, 500));
  }
  // Compute ground truth
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

// 2. Fast Sum Two Numbers Generator (Ultra-lightweight for extreme high-frequency load)
function generateSumTestCase() {
  const a = randomInt(-100000, 100000);
  const b = randomInt(-100000, 100000);
  return {
    stdin: `${a} ${b}\n`,
    expected_output: `${a + b}\n`
  };
}

// 3. Parentheses Generator (Random valid or invalid strings of length 20 to 100)
function generateParenthesesTestCase(len = 30) {
  const opens = "([{";
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const shouldBeValid = Math.random() > 0.5;
  
  if (shouldBeValid) {
    // Generate valid bracket sequence
    let s = "";
    const stack = [];
    for (let i = 0; i < len / 2; i++) {
      const op = opens[randomInt(0, 2)];
      s += op;
      stack.push(pairs[op]);
    }
    while (stack.length > 0) {
      s += stack.pop();
    }
    return {
      stdin: `${s}\n`,
      expected_output: "VALID\n"
    };
  } else {
    // Random bracket sequence (almost always invalid)
    const all = "()[]{}";
    let s = "";
    for (let i = 0; i < len; i++) {
      s += all[randomInt(0, all.length - 1)];
    }
    // Ground truth check
    const st = [];
    let ok = true;
    for (const c of s) {
      if (opens.includes(c)) st.push(pairs[c]);
      else {
        if (!st.length || st.pop() !== c) { ok = false; break; }
      }
    }
    if (st.length) ok = false;
    return {
      stdin: `${s}\n`,
      expected_output: `${ok ? "VALID" : "INVALID"}\n`
    };
  }
}

// Generate a suite payload with N dynamic test cases
function generateTestSuite(langKey, generatorType, numTestCases = 20) {
  const testCases = [];
  for (let i = 0; i < numTestCases; i++) {
    if (generatorType === "sum") testCases.push(generateSumTestCase());
    else if (generatorType === "parentheses") testCases.push(generateParenthesesTestCase(30));
    else testCases.push(generateKadaneTestCase(randomInt(20, 80)));
  }

  let sourceCode = "";
  let languageId = 54; // C++ default

  if (generatorType === "sum") {
    if (langKey === "c") {
      languageId = 50;
      sourceCode = `#include <stdio.h>\nint main(){long long a, b; if(scanf("%lld %lld",&a,&b)==2) printf("%lld\\n", a+b); return 0;}`;
    } else if (langKey === "cpp") {
      languageId = 54;
      sourceCode = `#include <iostream>\nusing namespace std;\nint main(){ios_base::sync_with_stdio(false);cin.tie(NULL);long long a,b;if(cin>>a>>b)cout<<a+b<<"\\n";return 0;}`;
    } else if (langKey === "java") {
      languageId = 62;
      sourceCode = `import java.util.Scanner;\npublic class Main{public static void main(String[] args){Scanner sc=new Scanner(System.in);if(sc.hasNextLong()){long a=sc.nextLong(),b=sc.nextLong();System.out.println(a+b);}}}`;
    } else {
      languageId = 71;
      sourceCode = `import sys\nparts=sys.stdin.read().split()\nif len(parts)>=2:\n    print(int(parts[0])+int(parts[1]))`;
    }
  } else {
    // Kadane
    if (langKey === "c") {
      languageId = 50;
      sourceCode = `#include <stdio.h>\nint main(){int n;if(scanf("%d",&n)!=1)return 0;long long m,c,x;scanf("%lld",&x);m=c=x;for(int i=1;i<n;i++){scanf("%lld",&x);c=(x>c+x)?x:c+x;if(c>m)m=c;}printf("%lld\\n",m);return 0;}`;
    } else if (langKey === "cpp") {
      languageId = 54;
      sourceCode = `#include <iostream>\n#include <algorithm>\nusing namespace std;\nint main(){ios_base::sync_with_stdio(false);cin.tie(NULL);int n;if(!(cin>>n))return 0;long long x;cin>>x;long long m=x,c=x;for(int i=1;i<n;i++){cin>>x;c=max(x,c+x);m=max(m,c);}cout<<m<<"\\n";return 0;}`;
    } else if (langKey === "java") {
      languageId = 62;
      sourceCode = `import java.util.Scanner;\npublic class Main{public static void main(String[] args){Scanner sc=new Scanner(System.in);if(!sc.hasNextInt())return;int n=sc.nextInt();long x=sc.nextLong();long m=x,c=x;for(int i=1;i<n;i++){x=sc.nextLong();c=Math.max(x,c+x);m=Math.max(m,c);}System.out.println(m);}}`;
    } else {
      languageId = 71;
      sourceCode = `import sys\nlines=sys.stdin.read().split()\nif lines:\n    n=int(lines[0])\n    nums=[int(v) for v in lines[1:n+1]]\n    c=m=nums[0]\n    for x in nums[1:]:\n        c=max(x,c+x)\n        m=max(m,c)\n    print(m)`;
    }
  }

  return {
    source_code: sourceCode,
    language_id: languageId,
    test_cases: testCases
  };
}

module.exports = {
  generateTestSuite,
  generateKadaneTestCase,
  generateSumTestCase,
  generateParenthesesTestCase
};

