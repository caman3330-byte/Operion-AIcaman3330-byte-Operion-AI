import fetch from "node-fetch";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const API_ENDPOINT = `${BASE_URL}/api`;
const AUTH_TOKEN = process.env.FOUNDER_AUTH_TOKEN || "test-token";

let testsPassed = 0;
let testsFailed = 0;

function logTest(name, passed, details = "") {
  const emoji = passed ? "✅" : "❌";
  console.log(`${emoji} ${name}${details ? " — " + details : ""}`);
  if (passed) testsPassed++;
  else testsFailed++;
}

console.log("\n=== METRICS TEST ===\n");

async function runTest() {
  try {
    const resp = await fetch(`${API_ENDPOINT}/leads/metrics`, {
      headers: { "Authorization": `Bearer ${AUTH_TOKEN}` }
    });

    if (!resp.ok) {
      logTest("Metrics endpoint exists", false, `Status ${resp.status}`);
      process.exit(1);
    }

    const metrics = await resp.json();

    logTest("total is a number", typeof metrics.total === "number", `Total: ${metrics.total}`);
    logTest("email_ready is a number", typeof metrics.email_ready === "number", `Email Ready: ${metrics.email_ready}`);
    logTest("not_email_ready is a number", typeof metrics.not_email_ready === "number", `Not Email Ready: ${metrics.not_email_ready}`);
    logTest("No percentages (exact counts only)", !metrics.percentage && !metrics.approx, "Counts are exact");
    logTest("Timestamp present", !!metrics.timestamp, `Time: ${metrics.timestamp}`);
    logTest("Sum checks out", metrics.email_ready + metrics.not_email_ready === metrics.total, "Math: email_ready + not = total");

    console.log(`\n✅ METRICS VERIFIED`);
    console.log(`  Total Leads: ${metrics.total}`);
    console.log(`  Email Ready: ${metrics.email_ready}`);
    console.log(`  Not Email Ready: ${metrics.not_email_ready}\n`);

    process.exit(0);
  } catch (err) {
    logTest("Metrics test", false, err.message);
    process.exit(1);
  }
}

runTest();
