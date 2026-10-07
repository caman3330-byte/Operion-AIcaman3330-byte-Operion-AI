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

console.log("\n=== AUDIT EVENTS TEST ===\n");

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
        business_name: "Audit Test Corp",
        owner_name: "Test Owner",
        email: "audit-test@test.test",
        phone: "(555) 400-0001",
        enrichment_status: "enriched"
      })
    });

    if (!createResp.ok) {
      logTest("Create prospect", false, `Status ${createResp.status}`);
      process.exit(1);
    }

    const prospect = await createResp.json();
    const prospectId = prospect.id;

    logTest("Prospect created", !!prospectId, `ID: ${prospectId}`);

    console.log("\nStep 2: Promoting to Lead (should create audit event)...\n");

    const promoteResp = await fetch(`${API_ENDPOINT}/data/${prospectId}/promote`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${AUTH_TOKEN}` }
    });

    if (!promoteResp.ok) {
      logTest("Promotion", false, `Status ${promoteResp.status}`);
      process.exit(1);
    }

    const promoteResult = await promoteResp.json();
    const leadId = promoteResult.lead_id;

    logTest("Lead created", !!leadId, `Lead ID: ${leadId}`);

    console.log("\nStep 3: Querying audit log...\n");

    const auditResp = await fetch(`${API_ENDPOINT}/audit-log?limit=50`, {
      headers: { "Authorization": `Bearer ${AUTH_TOKEN}` }
    });

    if (!auditResp.ok) {
      logTest("Audit log accessible", false, `Status ${auditResp.status}`);
      process.exit(1);
    }

    const auditData = await auditResp.json();
    const events = auditData.data || [];

    logTest("Audit log has events", events.length > 0, `Found ${events.length} events`);

    // Look for promotion-related events
    const promotionEvents = events.filter(e =>
      e.entity_type === "acquisition_prospect" ||
      e.action?.includes("promote") ||
      e.metadata?.action?.includes("promote")
    );

    logTest(
      "Promotion event recorded in audit log",
      promotionEvents.length > 0,
      `Found ${promotionEvents.length} promotion events`
    );

    if (promotionEvents.length > 0) {
      const event = promotionEvents[0];
      logTest("Event has entity_id", !!event.entity_id, `ID: ${event.entity_id}`);
      logTest("Event has action", !!event.action, `Action: ${event.action}`);
      logTest("Event has created_at", !!event.created_at, `Time: ${event.created_at}`);
      logTest("Event has actor info", !!event.actor_id, `Actor: ${event.actor_id}`);
    }

    console.log("\n✅ AUDIT EVENTS VERIFIED\n");
    process.exit(0);
  } catch (err) {
    logTest("Audit events test", false, err.message);
    process.exit(1);
  }
}

runTest();
