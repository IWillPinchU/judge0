const http = require("node:http");
const { JUDGE0_URL } = require("./config");

// Base64 Helpers
function toBase64(str) {
  if (str === null || str === undefined) return null;
  return Buffer.from(str, "utf8").toString("base64");
}

function fromBase64(b64) {
  if (b64 === null || b64 === undefined) return null;
  return Buffer.from(b64, "base64").toString("utf8");
}

// Pretty Terminal Logger
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m"
};

function logPass(msg) {
  console.log(`  ${colors.green}✔ PASS:${colors.reset} ${msg}`);
}

function logFail(msg, detail) {
  console.log(`  ${colors.red}✖ FAIL:${colors.reset} ${msg}`);
  if (detail) console.log(`    ${colors.dim}${detail}${colors.reset}`);
}

function logInfo(msg) {
  console.log(`  ${colors.cyan}ℹ INFO:${colors.reset} ${msg}`);
}

function logSection(title) {
  console.log(`\n${colors.bold}${colors.yellow}=== ${title} ===${colors.reset}`);
}

// Poll Suite until finished
async function pollSuite(token, queryParams = "", maxWaitMs = 90000) {
  const url = `${JUDGE0_URL}/suites/${token}${queryParams ? "?" + queryParams : ""}`;
  const intervalMs = 500;
  const maxAttempts = Math.floor(maxWaitMs / intervalMs);
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch suite ${token}: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const statusId = data.status?.id || data.status_id;
    // Status 1 (In Queue) or 2 (Processing) mean still running
    if (statusId !== 1 && statusId !== 2) {
      return data;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Suite ${token} timed out waiting for completion (${maxWaitMs / 1000}s)`);
}

// Poll Legacy Submission until finished
async function pollSubmission(token, queryParams = "") {
  const url = `${JUDGE0_URL}/submissions/${token}${queryParams ? "?" + queryParams : ""}`;
  const maxAttempts = 40;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch submission ${token}: ${res.status}`);
    }
    const data = await res.json();
    const statusId = data.status?.id;
    if (statusId !== 1 && statusId !== 2) {
      return data;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Submission ${token} timed out waiting for completion`);
}

// Temporary Callback Webhook Listener
function startCallbackServer(port = 9876) {
  const callbacks = new Map(); // token -> payload
  let serverInstance = null;

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const json = JSON.parse(body);
        const token = json.token || json.suite_token;
        callbacks.set(token, json);
        callbacks.set(req.url, json);
      } catch (e) {
        callbacks.set(req.url, body);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "received" }));
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(port, "0.0.0.0", () => {
      serverInstance = server;
      resolve({
        server,
        port,
        getCallbacks: () => callbacks,
        waitForCallback: (key, timeoutMs = 10000) => {
          return new Promise((res) => {
            const start = Date.now();
            const check = () => {
              if (callbacks.has(key)) {
                return res(callbacks.get(key));
              }
              if (Date.now() - start >= timeoutMs) {
                return res(null);
              }
              setTimeout(check, 100);
            };
            check();
          });
        },
        close: () => new Promise((done) => server.close(done))
      });
    });
    server.on("error", reject);
  });
}

module.exports = {
  toBase64,
  fromBase64,
  logPass,
  logFail,
  logInfo,
  logSection,
  pollSuite,
  pollSubmission,
  startCallbackServer
};
