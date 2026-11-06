const fs = require("fs");
const path = require("path");
const { generateSumTestCase, generateKadaneTestCase } = require("./generators");

const outDir = path.join(__dirname, "batch_requests");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Batch 1: C++ (20 submissions)
const cppSource = `#include <iostream>\nusing namespace std;\nint main(){long long a,b;if(cin>>a>>b)cout<<a+b<<"\\n";return 0;}`;
const batch1 = {
  submissions: Array.from({ length: 20 }, () => {
    const tc = generateSumTestCase();
    return { source_code: cppSource, language_id: 54, stdin: tc.stdin, expected_output: tc.expected_output };
  })
};
fs.writeFileSync(path.join(outDir, "batch1_cpp.json"), JSON.stringify(batch1, null, 2));

// Batch 2: Python 3 with NumPy (20 submissions)
const pySource = `import sys\nparts = sys.stdin.read().split()\nif len(parts) >= 2:\n    print(int(parts[0]) + int(parts[1]))`;
const batch2 = {
  submissions: Array.from({ length: 20 }, () => {
    const tc = generateSumTestCase();
    return { source_code: pySource, language_id: 71, stdin: tc.stdin, expected_output: tc.expected_output };
  })
};
fs.writeFileSync(path.join(outDir, "batch2_python.json"), JSON.stringify(batch2, null, 2));

// Batch 3: Java 21 (20 submissions)
const javaSource = `import java.util.Scanner;\npublic class Main{public static void main(String[] args){Scanner sc=new Scanner(System.in);if(sc.hasNextLong()){System.out.println(sc.nextLong()+sc.nextLong());}}}`;
const batch3 = {
  submissions: Array.from({ length: 20 }, () => {
    const tc = generateSumTestCase();
    return { source_code: javaSource, language_id: 62, stdin: tc.stdin, expected_output: tc.expected_output };
  })
};
fs.writeFileSync(path.join(outDir, "batch3_java.json"), JSON.stringify(batch3, null, 2));

// Batch 4: C (20 submissions)
const cSource = `#include <stdio.h>\nint main(){long long a,b;if(scanf("%lld %lld",&a,&b)==2)printf("%lld\\n",a+b);return 0;}`;
const batch4 = {
  submissions: Array.from({ length: 20 }, () => {
    const tc = generateSumTestCase();
    return { source_code: cSource, language_id: 50, stdin: tc.stdin, expected_output: tc.expected_output };
  })
};
fs.writeFileSync(path.join(outDir, "batch4_c.json"), JSON.stringify(batch4, null, 2));

// Batch 5: Kadane Algorithm C++ (20 submissions)
const kadaneSource = `#include <iostream>\n#include <algorithm>\nusing namespace std;\nint main(){int n;if(!(cin>>n))return 0;long long x;cin>>x;long long m=x,c=x;for(int i=1;i<n;i++){cin>>x;c=max(x,c+x);m=max(m,c);}cout<<m<<"\\n";return 0;}`;
const batch5 = {
  submissions: Array.from({ length: 20 }, () => {
    const tc = generateKadaneTestCase(25);
    return { source_code: kadaneSource, language_id: 54, stdin: tc.stdin, expected_output: tc.expected_output };
  })
};
fs.writeFileSync(path.join(outDir, "batch5_kadane.json"), JSON.stringify(batch5, null, 2));

console.log("Generated 5 batch JSON files in d:\\Projecto\\judge0-tests\\batch_requests (20 submissions each = 100 total)");

