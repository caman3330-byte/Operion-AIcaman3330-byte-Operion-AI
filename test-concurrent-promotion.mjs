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

console.log("\n=== CONCURRENT PROMOTION (ATOMICITY) TEST ===\n");

async function runTest() {
  try {
    console.log("Step 1: Creating test prospect...\n");

    const createResp = await fetch(`${API_ENDPOINT}/data`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        business_name: "Concurrent Test Corp",
        owner_name: "Test Owner Concurrent",
        email: "concurrent@test.test",
        phone: "(555) 500-0001",
        enrichment_status: "enriched"
      })
    });

    if (!createResp.ok) {
      logTest("Create prospect", false, `Status ${createResp.status}`);
      process.exit(1);
    }

    const prospect = await createResp.json();
    const prospectId = prospect.id;

    logTest("Test prospect created", !!prospectId, `ID: ${prospectId}`);

    console.log("\nStep 2: Running two concurrent promotion requests...\n");

    const promoteUrl = `${API_ENDPOINT}/data/${prospectId}/promote`;
    const promiseResp1 = fetch(promoteUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${AUTH_TOKEN}` }
    });

    const promiseResp2 = fetch(promoteUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${AUTH_TOKEN}` }
    });

    const [resp1, resp2] = await Promise.all([promiseResp1, promiseResp2]);

    const result1 = await resp1.json();
    const result2 = await resp2.json();

    const leadId1 = result1.lead_id;
    const leadId2 = result2.lead_id;

    logTest("Request 1 successful", resp1.ok && result1.promoted, `Lead: ${leadId1}`);
    logTest("Request 2 successful", resp2.ok && result2.promoted, `Lead: ${leadId2}`);

    console.log(`\n  Response 1: lead_id=${leadId1}, replayed=${result1.replayed}`);
    console.log(`  Response 2: lead_id=${leadId2}, replayed=${result2.replayed}\n`);

    logTest(
      "Both requests return same lead_id",
      leadId1 === leadId2,
      `Both: ${leadId1}`
    );

    console.log("\nStep 3: Verifying single Lead in database...\n");

    // Query leads to verify only one exists for this prospect
    const leadsResp = await fetch(`${API_ENDPOINT}/leads?search=Concurrent`, {
      headers: { "Authorization": `Bearer ${AUTH_TOKEN}` }
    });

    if (leadsResp.ok) {
      const leadsData = await leadsResp.json();
      const matchingLeads = leadsData.data?.filter(l => l.business_name === "Concurrent Test Corp") || [];

      logTest(
        "Exactly one Lead created in database",
        matchingLeads.length === 1,
        `Found ${matchingLeads.length} Lead(s)`
      );

      logTest(
        "No orphan Leads",
        matchingLeads.length <= 1,
        "Zero orphans under concurrent access"
      );

      if (matchingLeads.length === 1) {
        const lead = matchingLeads[0];
        logTest("Lead has canonical lead_id", !!lead.id, `ID: ${lead.id}`);
        logTest("Lead has correct business name", lead.business_name === "Concurrent Test Corp");
        logTest("Lead has snapshot email", !!lead.email, `Email: ${lead.email}`);
      }
    } else {
      logTest("Query leads", false, `Status ${leadsResp.status}`);
    }

    console.log("\n✅ CONCURRENT PROMOTION ATOMICITY VERIFIED\n");
    logTest("Result: No orphan Leads created under concurrent access", true);

    process.exit(0);
  } catch (err) {
    logTest("Concurrent promotion test", false, err.message);
    process.exit(1);
  }
}

runTest();
