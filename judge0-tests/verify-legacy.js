const http = require('http');

async function run() {
  const tests = [
    { lang: 'C (GCC 12)', id: 50, code: '#include <stdio.h>\nint main() { int a, b; if (scanf("%d %d", &a, &b) == 2) printf("%d\\n", a+b); return 0; }' },
    { lang: 'C++ (G++ 12)', id: 54, code: '#include <iostream>\nint main() { int a, b; if (std::cin >> a >> b) std::cout << a+b << std::endl; return 0; }' },
    { lang: 'Java (OpenJDK 21)', id: 62, code: 'import java.util.Scanner;\npublic class Main { public static void main(String[] args) { Scanner sc = new Scanner(System.in); if (sc.hasNextInt()) { int a = sc.nextInt(); int b = sc.nextInt(); System.out.println(a+b); } } }' },
    { lang: 'Python (3.11)', id: 71, code: 'import sys\nline = sys.stdin.read().strip()\nif line:\n    a, b = map(int, line.split())\n    print(a + b)' }
  ];

  console.log('--- Verifying Legacy API (POST /submissions?base64_encoded=false&wait=true) ---');
  for (const t of tests) {
    const postData = JSON.stringify({
      language_id: t.id,
      source_code: t.code,
      stdin: '15 25',
      expected_output: '40\n'
    });
    
    await new Promise((resolve, reject) => {
      const req = http.request('http://localhost:2358/submissions?base64_encoded=false&wait=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
      }, res => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          const resObj = JSON.parse(raw);
          console.log(`✔ ${t.lang.padEnd(20)}: Status "${resObj.status ? resObj.status.description : 'ERR'}" (ID ${resObj.status ? resObj.status.id : 'N/A'}), Time: ${resObj.time}s, Mem: ${resObj.memory} KB, stdout: ${JSON.stringify(resObj.stdout)}`);
          resolve();
        });
      });
      req.write(postData);
      req.end();
    });
  }
}

run();
