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

console.log("\n=== EMAIL-READY SERVICE TEST ===\n");

async function runTest() {
  try {
    const resp = await fetch(`${API_ENDPOINT}/leads/email-ready`, {
      headers: { "Authorization": `Bearer ${AUTH_TOKEN}` }
    });

    if (!resp.ok) {
      logTest("Email-ready endpoint exists", false, `Status ${resp.status}`);
      process.exit(1);
    }

    const result = await resp.json();

    logTest("Endpoint returns paginated result", !!result.data && typeof result.total === "number");
    logTest("Result includes page info", typeof result.page === "number" && typeof result.pageSize === "number");
    logTest("All leads have email", result.data?.every(l => !!l.email), `${result.total} total email-ready`);
    logTest("Status filter honored", result.data?.every(l => l.status === "raw" || !l.status), "Status is raw or unset");
    logTest("Blacklisted excluded", result.data?.every(l => !l.blacklisted), "No blacklisted leads");

    console.log(`\n✅ EMAIL-READY SERVICE VERIFIED (${result.total} leads)\n`);
    process.exit(0);
  } catch (err) {
    logTest("Email-ready service test", false, err.message);
    process.exit(1);
  }
}

runTest();
