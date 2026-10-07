import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import crypto from "crypto";

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

console.log("\n=== MANUAL UPLOAD UI TEST — REAL FILE WORKFLOW ===\n");

// Create a test CSV file with realistic merchant data (but synthetic emails/phones)
const testFilename = `test-merchants-${Date.now()}.csv`;
const csvContent = `Business Name,Owner Name,Email,Phone,Industry,State,City
Test Merchant Alpha,John Smith,john.alpha@test.test,(555) 111-0001,Technology,CA,San Francisco
Test Merchant Beta,Jane Doe,jane.beta@test.test,(555) 111-0002,Retail,NY,New York
Test Merchant Gamma,Bob Johnson,bob.gamma@test.test,(555) 111-0003,Manufacturing,TX,Dallas`;

const scratchDir = "./scratchpad/manual-upload-test";
if (!fs.existsSync(scratchDir)) {
  fs.mkdirSync(scratchDir, { recursive: true });
}

const testFilePath = path.join(scratchDir, testFilename);
fs.writeFileSync(testFilePath, csvContent);
console.log(`✓ Created test CSV file: ${testFilename}\n`);
logTest(
  "Test CSV created with synthetic contact data",
  true,
  `3 merchants, @test.test emails, (555) phones`
);

// Step 1: Upload for preview
console.log("STEP 1: Upload for Preview\n");

async function testPreview() {
  try {
    const formData = new FormData();
    const fileContent = fs.readFileSync(testFilePath);
    const blob = new Blob([fileContent], { type: "text/csv" });
    formData.append("file", blob, testFilename);
    formData.append("confirm", "false");

    const previewResp = await fetch(`${API_ENDPOINT}/data/csv-upload`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`
      },
      body: formData
    });

    if (previewResp.ok) {
      const previewResult = await previewResp.json();
      console.log(`Response:`, JSON.stringify(previewResult, null, 2));
      return previewResult;
    } else {
      const errorText = await previewResp.text();
      console.error(`Error: ${previewResp.status} — ${errorText}`);
      logTest("Preview upload", false, `Status ${previewResp.status}`);
      return null;
    }
  } catch (err) {
    logTest("Preview upload", false, err.message);
    return null;
  }
}

// Step 2: Confirm upload
async function testConfirm(previewResult) {
  if (!previewResult) return null;

  console.log("\nSTEP 2: Confirm Upload\n");

  try {
    const formData = new FormData();
    const fileContent = fs.readFileSync(testFilePath);
    const blob = new Blob([fileContent], { type: "text/csv" });
    formData.append("file", blob, testFilename);
    formData.append("confirm", "true");
    formData.append("preview_id", previewResult.preview_id || previewResult.content_hash || "test-preview");

    const confirmResp = await fetch(`${API_ENDPOINT}/data/csv-upload`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`
      },
      body: formData
    });

    if (confirmResp.ok) {
      const confirmResult = await confirmResp.json();
      console.log(`Response:`, JSON.stringify(confirmResult, null, 2));
      logTest(
        "Confirm upload returns success",
        confirmResult.success === true,
        `Total rows: ${confirmResult.total_rows || 0}`
      );
      return confirmResult;
    } else {
      const errorText = await confirmResp.text();
      console.error(`Error: ${confirmResp.status} — ${errorText}`);
      logTest("Confirm upload", false, `Status ${confirmResp.status}`);
      return null;
    }
  } catch (err) {
    logTest("Confirm upload", false, err.message);
    return null;
  }
}

// Step 3: Verify prospects created
async function testProspectsCreated(confirmResult) {
  if (!confirmResult || !confirmResult.batch_id) return;

  console.log("\nSTEP 3: Verify Prospects Created\n");

  try {
    // Query for prospects from this batch
    const listResp = await fetch(`${API_ENDPOINT}/data?search=Test%20Merchant`, {
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`
      }
    });

    if (listResp.ok) {
      const listResult = await listResp.json();
      const prospects = listResult.data || [];

      logTest(
        "Prospects visible in data listing",
        prospects.length >= 3,
        `Found ${prospects.length} prospects`
      );

      // Verify each prospect
      for (const prospect of prospects.slice(0, 3)) {
        logTest(
          `Prospect has source_kind=manual`,
          prospect.source_kind === "manual",
          `ID: ${prospect.id}`
        );

        logTest(
          `Prospect has provider=csv_upload`,
          prospect.provider === "csv_upload",
          `Provider: ${prospect.provider}`
        );

        logTest(
          `Prospect has enrichment_status (pending or enriching)`,
          ["pending", "enriching", "enriched"].includes(prospect.enrichment_status),
          `Status: ${prospect.enrichment_status}`
        );

        logTest(
          `Prospect has business_name`,
          !!prospect.business_name,
          `Name: ${prospect.business_name}`
        );
      }
    } else {
      logTest("List prospects", false, `Status ${listResp.status}`);
    }
  } catch (err) {
    logTest("Verify prospects", false, err.message);
  }
}

// Run the full flow
async function runTests() {
  const previewResult = await testPreview();
  if (previewResult) {
    logTest(
      "Preview contains expected row count",
      previewResult.total_rows === 3,
      `Rows: ${previewResult.total_rows}`
    );
  }

  const confirmResult = await testConfirm(previewResult);
  if (confirmResult) {
    await testProspectsCreated(confirmResult);
  }

  // Cleanup
  console.log(`\nCleaning up test file...`);
  fs.unlinkSync(testFilePath);
  logTest("Test file cleaned up", true, testFilename);

  // Summary
  console.log("\n=== TEST SUMMARY ===");
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`Total: ${testsPassed + testsFailed}`);

  if (testsFailed === 0) {
    console.log("\n✅ MANUAL UPLOAD UI TEST PASSED");
  } else {
    console.log(`\n⚠️  ${testsFailed} tests failed`);
  }

  console.log("\n=== END MANUAL UPLOAD UI TEST ===\n");

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
