import fetch from "node-fetch";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const API_ENDPOINT = `${BASE_URL}/api`;
const AUTH_TOKEN = process.env.FOUNDER_AUTH_TOKEN || "test-token";

let testsPassed = 0;
let testsFailed = 0;

function logTest(name, passed, details = "") {
  const status = passed ? "✓" : "✗";
  const emoji = passed ? "✅" : "❌";
  console.log(`${emoji} ${status} ${name}${details ? " — " + details : ""}`);
  if (passed) testsPassed++;
  else testsFailed++;
}

console.log("\n=== SUPPRESSION / UNSUBSCRIBE ARCHITECTURE TEST ===\n");

async function runTest() {
  try {
    // Step 1: Create two test prospects
    console.log("Step 1: Creating test prospects...\n");

    const prospect1Resp = await fetch(`${API_ENDPOINT}/data`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        business_name: "Suppression Test Corp A",
        owner_name: "Test Owner A",
        email: "suppress-test-a@test.test",
        phone: "(555) 300-0001",
        enrichment_status: "enriched"
      })
    });

    if (!prospect1Resp.ok) {
      logTest("Create prospect A", false, `Status ${prospect1Resp.status}`);
      return;
    }

    const prospect1 = await prospect1Resp.json();
    const prospect1Id = prospect1.id;
    const prospect1Email = prospect1.email;

    logTest("Test prospect A created", !!prospect1Id, `ID: ${prospect1Id}`);

    // Step 2: Promote both prospects to leads
    console.log("\nStep 2: Promoting prospects to Leads...\n");

    const promoteResp1 = await fetch(`${API_ENDPOINT}/data/${prospect1Id}/promote`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`
      }
    });

    if (!promoteResp1.ok) {
      logTest("Promote prospect A", false, `Status ${promoteResp1.status}`);
      return;
    }

    const promoteResult1 = await promoteResp1.json();
    const lead1Id = promoteResult1.lead_id;

    logTest("Prospect A promoted to Lead", !!lead1Id, `Lead ID: ${lead1Id}`);

    // Step 3: Verify Lead A is email-ready
    console.log("\nStep 3: Verifying Lead A is email-ready...\n");

    const emailReadyResp1 = await fetch(`${API_ENDPOINT}/leads/email-ready?search=${prospect1Email}`, {
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`
      }
    });

    if (emailReadyResp1.ok) {
      const emailReadyList1 = await emailReadyResp1.json();
      const isEmailReady1 = emailReadyList1.data?.some(l => l.id === lead1Id);

      logTest(
        "Lead A appears in email-ready query",
        isEmailReady1,
        `Found in list: ${isEmailReady1}`
      );
    }

    // Step 4: Add Lead A to suppression list
    console.log("\nStep 4: Adding Lead A to suppression list...\n");

    // This would typically be done through a suppression endpoint or by marking the lead as blacklisted
    // For testing, we'll try to update the lead's blacklisted flag
    const suppressResp = await fetch(`${API_ENDPOINT}/leads/${lead1Id}`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        blacklisted: true
      })
    });

    if (suppressResp.ok) {
      logTest("Lead marked as blacklisted", true, `Lead ID: ${lead1Id}`);
    } else {
      console.log("  (Note: Could not update blacklist flag directly)");
    }

    // Step 5: Verify Lead A is NO LONGER email-ready
    console.log("\nStep 5: Verifying suppression blocks email-ready query...\n");

    const emailReadyResp2 = await fetch(`${API_ENDPOINT}/leads/email-ready?search=${prospect1Email}`, {
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`
      }
    });

    if (emailReadyResp2.ok) {
      const emailReadyList2 = await emailReadyResp2.json();
      const isStillEmailReady = emailReadyList2.data?.some(l => l.id === lead1Id);

      logTest(
        "Suppressed Lead A no longer in email-ready query",
        !isStillEmailReady,
        `Now excluded: ${!isStillEmailReady}`
      );
    }

    // Step 6: Create a phone-only lead and verify it's not email-ready
    console.log("\nStep 6: Testing phone-only lead (not email-ready)...\n");

    const prospect2Resp = await fetch(`${API_ENDPOINT}/data`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        business_name: "Suppression Test Corp B",
        owner_name: "Test Owner B",
        phone: "(555) 300-0002",
        enrichment_status: "enriched"
      })
    });

    if (!prospect2Resp.ok) {
      logTest("Create phone-only prospect", false, `Status ${prospect2Resp.status}`);
      return;
    }

    const prospect2 = await prospect2Resp.json();
    const prospect2Id = prospect2.id;

    logTest(
      "Phone-only prospect created (no email)",
      !!prospect2Id && !prospect2.email,
      `ID: ${prospect2Id}`
    );

    // Promote phone-only prospect
    const promoteResp2 = await fetch(`${API_ENDPOINT}/data/${prospect2Id}/promote`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`
      }
    });

    if (promoteResp2.ok) {
      const promoteResult2 = await promoteResp2.json();
      const lead2Id = promoteResult2.lead_id;

      logTest(
        "Phone-only prospect can be promoted",
        !!lead2Id,
        "Lead created successfully"
      );

      // Verify phone-only lead is NOT email-ready
      const emailReadyResp3 = await fetch(`${API_ENDPOINT}/leads/email-ready`, {
        headers: {
          "Authorization": `Bearer ${AUTH_TOKEN}`
        }
      });

      if (emailReadyResp3.ok) {
        const emailReadyList3 = await emailReadyResp3.json();
        const isEmailReady2 = emailReadyList3.data?.some(l => l.id === lead2Id);

        logTest(
          "Phone-only Lead NOT in email-ready query",
          !isEmailReady2,
          "Correctly excluded due to missing email"
        );
      }
    } else {
      logTest("Promote phone-only prospect", false, `Status ${promoteResp2.status}`);
    }

  } catch (err) {
    logTest("Suppression test", false, err.message);
  }

  // Summary
  console.log("\n=== TEST SUMMARY ===");
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`Total: ${testsPassed + testsFailed}`);

  if (testsFailed === 0) {
    console.log("\n✅ SUPPRESSION ARCHITECTURE VERIFIED");
  } else {
    console.log(`\n⚠️  ${testsFailed} tests failed`);
  }

  console.log("\n=== END SUPPRESSION TEST ===\n");

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTest().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
