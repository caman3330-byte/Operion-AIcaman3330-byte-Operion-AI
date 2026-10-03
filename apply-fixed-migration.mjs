#!/usr/bin/env node
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://dstqbiccseijydgsvlgj.supabase.co";

// Read key from .env.db securely
const envContent = fs.readFileSync("./.env.preview-fresh", "utf8");
const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL="?([^"\n]+)"?/);
const keyMatch = fs.readFileSync("./.env.db", "utf8").match(/SUPABASE_SERVICE_ROLE_KEY=([^\n]+)/);

const SERVICE_KEY = keyMatch ? keyMatch[1].trim() : null;

if (!SERVICE_KEY) {
  console.error("❌ Cannot find SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  try {
    console.log("⏳ Reading corrected migration SQL...");
    const migrationSql = fs.readFileSync("./packages/database/migrations/0041_data_prospect_import_fixed.sql", "utf8");
    console.log(`   Size: ${migrationSql.length} bytes\n`);

    console.log("⏳ Applying migration to staging database...");
    
    // Try RPC first
    const { error: rpcError } = await supabase
      .rpc("exec_sql", { sql: migrationSql });

    if (!rpcError) {
      console.log("✓ Migration applied successfully via RPC\n");
      await verifyMigration();
      return;
    }

    console.error("❌ Cannot apply migration programmatically");
    console.error("   SQL Editor required: https://app.supabase.com/project/dstqbiccseijydgsvlgj/sql");
    process.exit(1);

  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

async function verifyMigration() {
  console.log("🔍 Verifying migration...");

  // Test 1: Check current_app_role function
  try {
    const { data, error } = await supabase
      .rpc("current_app_role");
    
    if (!error) {
      console.log("  ✓ current_app_role() function exists");
    }
  } catch (e) {
    console.log("  ⚠️  Could not verify current_app_role function");
  }

  // Test 2: Check data_prospect_records view
  const { error: viewError } = await supabase
    .from("data_prospect_records")
    .select("id")
    .limit(1);

  if (!viewError) {
    console.log("  ✓ data_prospect_records view exists");
  } else {
    console.warn("  ⚠️  data_prospect_records view not found");
  }

  // Test 3: Check data_import_batch_summaries view
  const { error: summaryError } = await supabase
    .from("data_import_batch_summaries")
    .select("id")
    .limit(1);

  if (!summaryError) {
    console.log("  ✓ data_import_batch_summaries view exists");
  } else {
    console.warn("  ⚠️  data_import_batch_summaries view not found");
  }

  // Test 4: Check for source_kind column
  const { error: colError } = await supabase
    .from("acquisition_prospects")
    .select("source_kind")
    .limit(1);

  if (!colError) {
    console.log("  ✓ acquisition_prospects.source_kind column exists");
  } else {
    console.warn("  ⚠️  source_kind column not found");
  }

  console.log("\n✅ Migration verification complete!");
}

main().catch(e => {
  console.error("Fatal error:", e.message);
  process.exit(1);
});
