#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Step 1: Pull Vercel Preview env vars
console.log("🔄 Pulling Preview environment from Vercel...");
let envFile;
try {
  // Try to get Preview environment variables
  execSync("vercel env pull .env.migration --environment=preview --yes 2>&1", { stdio: "pipe" });
  envFile = ".env.migration";
} catch (e) {
  try {
    // Fallback: try without --yes
    execSync("vercel env pull .env.migration 2>&1", { stdio: "pipe" });
    envFile = ".env.migration";
  } catch (e2) {
    console.error("❌ Failed to pull environment from Vercel");
    console.error("   Make sure: 'vercel login' is authenticated and 'vercel link' is connected");
    process.exit(1);
  }
}

if (!fs.existsSync(envFile)) {
  console.error("❌ Environment file not created");
  process.exit(1);
}

// Step 2: Parse env file
const envContent = fs.readFileSync(envFile, "utf8");
const env = {};
envContent.split("\n").forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#")) {
    const [key, ...rest] = line.split("=");
    if (key) {
      env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing Supabase credentials in Preview environment");
  console.error(`   URL: ${SUPABASE_URL ? "✓" : "MISSING"}`);
  console.error(`   Key: ${SERVICE_KEY ? "✓" : "MISSING"}`);
  fs.unlinkSync(envFile);
  process.exit(1);
}

// Extract database URL from Supabase URL
// supabase.co URLs look like: https://project-ref.supabase.co
const projectRef = SUPABASE_URL.split("/")[2].split(".")[0];
const dbUrl = `postgresql://postgres:${SERVICE_KEY}@${projectRef}.supabase.co:5432/postgres`;

console.log(`✓ Supabase Project: ${projectRef}`);
console.log(`✓ Database URL configured`);

// Step 3: Read migration SQL
const migrationPath = path.join(__dirname, "../../packages/database/migrations/0041_data_prospect_import.sql");
const migrationSql = fs.readFileSync(migrationPath, "utf8");

console.log("⏳ Connecting to Supabase database...");

// Step 4: Apply migration using node-postgres (pg)
const { Client } = require("pg");

const migrate = async () => {
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("✓ Connected to Supabase");

    console.log("⏳ Applying migration 0041_data_prospect_import...");

    // Execute the entire migration as one transaction
    await client.query(migrationSql);

    console.log("✓ Migration applied successfully");
    console.log("\n📋 Changes applied:");
    console.log("  ✓ Columns: source_kind, provider, industry, enrichment_status");
    console.log("  ✓ RLS Policies: founder_manage_data_* (batches, rows, prospects)");
    console.log("  ✓ Functions: import_data_prospects(), data_import_result()");
    console.log("  ✓ Views: data_prospect_records, data_import_batch_summaries");
    console.log("  ✓ Indexes: data_rows_prospect, data_batches_content, data_prospects_source_created");

    // Verify migration by checking if view exists
    console.log("\n⏳ Verifying migration...");
    const result = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_schema = 'public' AND table_name = 'data_prospect_records'
      ) as view_exists;
    `);

    if (result.rows[0].view_exists) {
      console.log("✓ Verification passed - data_prospect_records view exists");
    } else {
      console.error("⚠ Warning: View may not have been created");
    }

  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    if (error.position) {
      console.error(`   at position ${error.position}`);
    }
    process.exit(1);
  } finally {
    await client.end();
    // Cleanup
    try { fs.unlinkSync(envFile); } catch (e) {}
    console.log("\n✓ Done");
    process.exit(0);
  }
};

migrate().catch(err => {
  console.error(err);
  try { fs.unlinkSync(envFile); } catch (e) {}
  process.exit(1);
});
