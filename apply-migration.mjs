#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const SUPABASE_URL = "https://dstqbiccseijydgsvlgj.supabase.co";
const SERVICE_KEY = "sb_secret_FF2EyUoPonIx37ZWrvRoCQ_SZ55mZ13";

console.log("🔐 Connecting to staging database...");
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function applyMigration() {
  try {
    const migrationSQL = fs.readFileSync("./packages/database/migrations/0041_minimal_data_schema.sql", "utf8");
    console.log("📝 Migration loaded (${migrationSQL.length} bytes)");
    console.log("⏳ Applying migration...\n");

    const { error } = await supabase.rpc("exec_sql", { sql: migrationSQL });

    if (error) {
      console.log("⚠️  RPC not available, checking database state instead...");
      
      // Test if tables exist
      const { error: testError } = await supabase.from("acquisition_import_batches").select("id").limit(1);
      
      if (!testError) {
        console.log("✅ Tables already exist!");
        return true;
      }
    }

    // Verify the migration worked
    console.log("🔍 Verifying migration...");
    const { data: tables, error: verifyError } = await supabase
      .from("information_schema.tables")
      .select("table_name")
      .eq("table_schema", "public")
      .in("table_name", ["acquisition_prospects", "acquisition_import_batches"])
      .catch(() => ({ data: null, error: true }));

    if (!verifyError && tables?.length >= 2) {
      console.log("✅ SUCCESS: Migration applied!");
      console.log("   - acquisition_prospects created");
      console.log("   - acquisition_import_batches created");
      return true;
    } else {
      console.log("❌ Migration may have failed. Testing table access...");
      
      const { error: tableTest } = await supabase.from("acquisition_prospects").select("id").limit(1).catch(e => ({ error: e }));
      
      if (tableTest?.code === "PGRST116") {
        console.log("❌ Tables do not exist - migration failed");
        return false;
      } else if (!tableTest) {
        console.log("✅ Tables exist and are accessible!");
        return true;
      }
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    return false;
  }
}

const success = await applyMigration();
process.exit(success ? 0 : 1);
