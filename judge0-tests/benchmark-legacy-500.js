const http = require('http');

const BATCH_SIZE = 50;
const TOTAL_TESTS = 500;

const LANGUAGES = [
  { name: 'C (GCC 12)', id: 50, code: '#include <stdio.h>\nint main() { int a, b; if (scanf("%d %d", &a, &b) == 2) printf("%d\\n", a+b); return 0; }' },
  { name: 'C++ (G++ 12)', id: 54, code: '#include <iostream>\nint main() { int a, b; if (std::cin >> a >> b) std::cout << (a+b) << std::endl; return 0; }' },
  { name: 'Java (OpenJDK 21)', id: 62, code: 'import java.util.Scanner;\npublic class Main { public static void main(String[] args) { Scanner sc = new Scanner(System.in); if (sc.hasNextInt()) { int a = sc.nextInt(); int b = sc.nextInt(); System.out.println(a+b); } } }' },
  { name: 'Python (3.11)', id: 71, code: 'import sys\nline = sys.stdin.read().strip()\nif line:\n    a, b = map(int, line.split())\n    print(a + b)' }
];

async function submitBatch(submissions) {
  const postData = JSON.stringify({ submissions });
  return new Promise((resolve, reject) => {
    const req = http.request('http://localhost:2358/submissions/batch?base64_encoded=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw).map(s => s.token));
        } catch (e) {
          reject(new Error(`Failed to submit batch: ${raw}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function pollTokens(tokens) {
  let pending = true;
  while (pending) {
    await new Promise(r => setTimeout(r, 1000));
    await new Promise((resolve) => {
      http.get('http://localhost:2358/submissions/batch?tokens=' + tokens.join(',') + '&base64_encoded=false&fields=token,status', res => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          try {
            const list = JSON.parse(raw).submissions || [];
            const done = list.filter(s => s && s.status && s.status.id >= 3).length;
            if (done === tokens.length) pending = false;
          } catch(e) {}
          resolve();
        });
      });
    });
  }
}

async function runBenchmark() {
  console.log(`Starting Legacy API Benchmark: ${TOTAL_TESTS} Submissions in Batches of ${BATCH_SIZE}...`);
  const startTime = Date.now();
  let completed = 0;

  for (let i = 0; i < TOTAL_TESTS; i += BATCH_SIZE) {
    const batch = [];
    for (let j = 0; j < BATCH_SIZE; j++) {
      const idx = i + j;
      const lang = LANGUAGES[idx % LANGUAGES.length];
      batch.push({
        language_id: lang.id,
        source_code: lang.code,
        stdin: `${idx} ${idx * 2}`,
        expected_output: `${idx * 3}\n`
      });
    }

    const tokens = await submitBatch(batch);
    await pollTokens(tokens);
    completed += batch.length;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (completed / elapsed).toFixed(1);
    console.log(`[LEGACY BATCH] Completed ${completed}/${TOTAL_TESTS} tests | Time: ${elapsed}s | Rate: ${rate} tests/sec | Compilations: ${completed}`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  const throughput = (TOTAL_TESTS / totalTime).toFixed(1);
  console.log('\n======================================================');
  console.log(`Total Time:         ${totalTime}s`);
  console.log(`Total Submissions:  ${TOTAL_TESTS}`);
  console.log(`Total Compilations: ${TOTAL_TESTS} (Every single test case compiled!)`);
  console.log(`Throughput:         ${throughput} tests/sec`);
  console.log('======================================================');
}

runBenchmark().catch(console.error);

