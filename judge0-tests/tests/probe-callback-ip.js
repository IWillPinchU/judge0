const { JUDGE0_URL, CALLBACK_CANDIDATE_IPS, CALLBACK_PORT, LANGUAGES } = require("../config");
const { startCallbackServer, logSection, logPass, logFail, logInfo } = require("../utils");

async function runProbe() {
  logSection("Probing Callback IPs from VM to Host");
  logInfo(`Starting callback listener on 0.0.0.0:${CALLBACK_PORT}...`);

  let receiver;
  try {
    receiver = await startCallbackServer(CALLBACK_PORT);
  } catch (err) {
    logFail(`Could not bind port ${CALLBACK_PORT}: ${err.message}`);
    return;
  }

  logInfo(`Listener active. Submitting test jobs with candidate callback URLs...`);

  const results = {};

  for (const ip of CALLBACK_CANDIDATE_IPS) {
    const callbackUrl = `http://${ip}:${CALLBACK_PORT}/cb-${ip}`;
    logInfo(`Testing Candidate IP: ${ip} -> ${callbackUrl}`);

    try {
      const payload = {
        source_code: "print('probe-test')",
        language_id: LANGUAGES.PYTHON,
        callback_url: callbackUrl
      };

      const res = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=false`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        logFail(`Submission rejected for ${ip}: HTTP ${res.status}`);
        results[ip] = "SUBMISSION_REJECTED";
        continue;
      }

      const { token } = await res.json();
      logInfo(`Job submitted (token: ${token}). Waiting up to 8s for callback...`);

      const received = await receiver.waitForCallback(`/cb-${ip}`, 8000);
      if (received) {
        logPass(`Callback SUCCEEDED on IP: ${ip}! 🎉`);
        results[ip] = "WORKING";
      } else {
        logFail(`No callback received on IP: ${ip} (timed out)`);
        results[ip] = "TIMED_OUT";
      }
    } catch (e) {
      logFail(`Error probing ${ip}: ${e.message}`);
      results[ip] = `ERROR: ${e.message}`;
    }
  }

  await receiver.close();

  logSection("Probe Summary");
  console.table(
    Object.entries(results).map(([ip, status]) => ({
      "Candidate IP": ip,
      "Callback Status": status,
      "Verdict": status === "WORKING" ? "USE THIS IP FOR CALLBACKS" : "Unreachable or blocked by Windows Firewall"
    }))
  );

  return results;
}

if (require.main === module) {
  runProbe().catch(console.error);
}

module.exports = runProbe;
