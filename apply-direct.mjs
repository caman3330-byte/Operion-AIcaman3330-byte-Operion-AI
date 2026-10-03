#!/usr/bin/env node
import fs from "fs";
import pkg from "pg";
const { Client } = pkg;

const client = new Client({
  host: "dstqbiccseijydgsvlgj.postgres.supabase.co",
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: "sb_secret_FF2EyUoPonIx37ZWrvRoCQ_SZ55mZ13"
});

async function applyMigration() {
  try {
    console.log("🔐 Connecting to database...");
    await client.connect();
    console.log("✅ Connected\n");

    const migrationSQL = fs.readFileSync("./packages/database/migrations/0041_minimal_data_schema.sql", "utf8");
    console.log("⏳ Applying migration...");

    await client.query(migrationSQL);
    console.log("✅ Migration applied successfully!\n");

    console.log("🔍 Verifying tables exist...");
    const result = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'acquisition%'
      ORDER BY table_name;
    `);

    console.log(`Found ${result.rows.length} acquisition tables:`);
    result.rows.forEach(r => console.log(`  ✓ ${r.table_name}`));

    await client.end();
    return true;
  } catch (error) {
    console.error("❌ Error:", error.message);
    try { await client.end(); } catch (e) {}
    return false;
  }
}

const success = await applyMigration();
process.exit(success ? 0 : 1);
