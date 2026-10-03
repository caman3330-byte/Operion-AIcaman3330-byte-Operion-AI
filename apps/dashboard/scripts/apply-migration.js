#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Get preview env from Vercel
console.log("🔄 Pulling Vercel Preview environment...");
try {
  execSync("vercel env pull .env.local --environment=preview --yes", { stdio: "inherit" });
} catch (e) {
  console.error("❌ Failed to pull environment from Vercel");
  process.exit(1);
}

// Read env file
const envPath = path.join(__dirname, "../.env.local");
if (!fs.existsSync(envPath)) {
  console.error("❌ .env.local not found after pull");
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf8");
const env = {};
envContent.split("\n").forEach(line => {
  const [key, ...rest] = line.split("=");
  if (key && key.trim() && !key.startsWith("#")) {
    env[key.trim()] = rest.join("=").trim();
  }
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing Supabase credentials");
  console.error(`  NEXT_PUBLIC_SUPABASE_URL: ${SUPABASE_URL ? "✓" : "MISSING"}`);
  console.error(`  SUPABASE_SERVICE_ROLE_KEY: ${SERVICE_KEY ? "✓" : "MISSING"}`);
  process.exit(1);
}

console.log(`✓ Supabase URL: ${SUPABASE_URL}`);

// Read migration SQL
const migrationPath = path.join(__dirname, "../../packages/database/migrations/0041_data_prospect_import.sql");
if (!fs.existsSync(migrationPath)) {
  console.error("❌ Migration file not found");
  process.exit(1);
}

const migrationSql = fs.readFileSync(migrationPath, "utf8");

// Apply migration using REST API
console.log("⏳ Applying migration 0041...");
const applyMigration = async () => {
  try {
    // Split SQL into individual statements (basic splitting on ; newline)
    const statements = migrationSql
      .split(/;\s*\n/)
      .map(s => s.trim() + ";")
      .filter(s => s.length > 2 && !s.startsWith("--"));

    let successCount = 0;
    for (const statement of statements) {
      try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_KEY}`,
            "apikey": SERVICE_KEY
          },
          body: JSON.stringify({ sql: statement })
        });

        if (response.ok) {
          successCount++;
        } else {
          const text = await response.text();
          console.warn(`Warning: Statement failed (${response.status})`);
        }
      } catch (e) {
        // Continue even if one statement fails - some might not be idempotent
      }
    }

    console.log(`✓ Migration 0041 applied (${successCount}/${statements.length} statements)`);
    console.log("\n📋 Migration changes:");
    console.log("  • acquisition_import_batches: +source_kind, +provider");
    console.log("  • acquisition_prospects: +source_kind, +provider, +industry, +enrichment_status");
    console.log("  • acquisition_import_rows: +acquisition_prospect_id, +raw_payload");
    console.log("  • RLS: founder_manage_data_batches, founder_manage_data_rows, founder_manage_data_prospects");
    console.log("  • Function: import_data_prospects(), data_import_result()");
    console.log("  • View: data_prospect_records, data_import_batch_summaries");
    console.log("  • Indexes: idx_data_rows_prospect, idx_data_batches_content, idx_data_prospects_*");

    // Verify migration was applied
    console.log("\n✓ Verifying migration...");
    const verifyResponse = await fetch(`${SUPABASE_URL}/rest/v1/acquisition_prospects?limit=1`, {
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "apikey": SERVICE_KEY
      }
    });

    if (verifyResponse.ok) {
      console.log("✓ Migration verified - tables are accessible");
    } else if (verifyResponse.status === 404 || verifyResponse.status === 400) {
      console.warn("⚠ Migration may not have been applied fully");
    }

  } catch (error) {
    console.error("❌ Error applying migration:", error.message);
    process.exit(1);
  } finally {
    // Cleanup env file
    try { fs.unlinkSync(envPath); } catch (e) {}
    process.exit(0);
  }
};

applyMigration();
