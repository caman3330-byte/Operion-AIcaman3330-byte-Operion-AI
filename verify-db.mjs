#!/usr/bin/env node
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://dstqbiccseijydgsvlgj.supabase.co";

// Read key from .env.db securely
const envContent = fs.readFileSync("./.env.db", "utf8");
const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=([^\n]+)/);
const SERVICE_KEY = match ? match[1].trim() : null;

if (!SERVICE_KEY) {
  console.error("❌ Cannot find SUPABASE_SERVICE_ROLE_KEY in .env.db");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function checkDatabase() {
  console.log("🔍 Checking database migration status...\n");

  try {
    // Test 1: Check if acquisition_prospects table exists and has new columns
    console.log("✓ Testing acquisition_prospects table...");
    const { data, error } = await supabase
      .from("acquisition_prospects")
      .select("id")
      .limit(1);

    if (error && (error.code === "PGRST116" || error.message?.includes("does not exist"))) {
      console.log("  ❌ Table does not exist - migration 0041 not applied");
      return false;
    }

    if (!error) {
      console.log("  ✓ Table exists");

      // Check if new columns exist
      const { data: colData, error: colError } = await supabase
        .from("acquisition_prospects")
        .select("source_kind")
        .limit(1);

      if (!colError) {
        console.log("  ✓ source_kind column exists - migration 0041 is applied");
        return true;
      } else {
        console.log("  ⚠️  source_kind column missing - migration 0041 not applied");
        return false;
      }
    }

    // Test 2: Check data_prospect_records view
    console.log("✓ Testing data_prospect_records view...");
    const { error: viewError } = await supabase
      .from("data_prospect_records")
      .select("id")
      .limit(1);

    if (!viewError) {
      console.log("  ✓ View exists - migration 0041 is applied");
      return true;
    } else {
      console.log("  ❌ View does not exist - migration 0041 not applied");
      return false;
    }

  } catch (error) {
    console.error("❌ Error checking database:", error.message);
    return null;
  }
}

async function applyMigration() {
  console.log("\n⏳ Attempting to apply migration 0041_data_prospect_import...");

  const migrationSql = fs.readFileSync("./packages/database/migrations/0041_data_prospect_import.sql", "utf8");

  try {
    // Try using RPC
    const { error: rpcError } = await supabase
      .rpc("exec_sql", { sql: migrationSql });

    if (!rpcError) {
      console.log("✓ Migration applied successfully via RPC\n");
      return true;
    }

    console.log("⚠️  RPC not available");
    console.log("\n❌ Migration could not be applied programmatically");
    console.log("\nREQUIRED MANUAL STEP:");
    console.log("   Go to: https://app.supabase.com/project/dstqbiccseijydgsvlgj/sql");
    console.log("   Then: Copy and paste packages/database/migrations/0041_data_prospect_import.sql");
    console.log("   Then: Click Run");
    return false;

  } catch (error) {
    console.error("❌ Error:", error.message);
    return false;
  }
}

async function main() {
  const isMigrated = await checkDatabase();

  if (isMigrated === null) {
    console.error("Could not determine migration status");
    process.exit(1);
  }

  if (isMigrated === true) {
    console.log("\n✅ Migration 0041 is already applied!");
    process.exit(0);
  }

  const applied = await applyMigration();
  process.exit(applied ? 0 : 1);
}

main().catch(e => {
  console.error("Fatal error:", e.message);
  process.exit(1);
});
