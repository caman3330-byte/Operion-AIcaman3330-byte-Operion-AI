#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");

const rootDir = path.resolve(__dirname, "..");
const migrationsDir = path.resolve(rootDir, "packages/database/migrations");
const dryRun = process.argv.includes("--dry-run");
const targetArg = process.argv.find((arg) => arg.startsWith("--only="));
const only = targetArg ? new Set(targetArg.slice("--only=".length).split(",").map((item) => item.trim()).filter(Boolean)) : null;

loadEnvFile(path.resolve(rootDir, ".env.local"));
loadEnvFile(path.resolve(rootDir, "apps/dashboard/.env.local"));

function getDatabaseUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  if (process.env.SUPABASE_DB_PASSWORD && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const projectHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
    const dbHost = `db.${projectHost}`;
    const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
    return `postgresql://postgres:${password}@${dbHost}:5432/postgres?sslmode=require`;
  }
  return null;
}

async function run() {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) {
    console.error("Missing SUPABASE_DB_URL or SUPABASE_DB_PASSWORD+NEXT_PUBLIC_SUPABASE_URL");
    process.exit(1);
  }

  if (!fs.existsSync(migrationsDir)) {
    console.error("Migrations directory not found:", migrationsDir);
    process.exit(1);
  }

  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .filter((file) => !only || only.has(file) || only.has(file.replace(/\.sql$/, "")))
    .sort();

  if (files.length === 0) {
    console.log("No migrations matched.");
    return;
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  await ensureMigrationLedger(client);
  const applied = await loadAppliedMigrations(client);
  const pending = files.filter((file) => !applied.has(file));

  console.log("Migration files:", files.join(", "));
  console.log("Pending migrations:", pending.length === 0 ? "none" : pending.join(", "));

  if (dryRun) {
    await client.end();
    return;
  }

  for (const file of pending) {
    const full = path.join(migrationsDir, file);
    const sql = fs.readFileSync(full, "utf8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    console.log(`\n--- Applying ${file}`);

    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(
        `insert into public.operion_schema_migrations (filename, checksum)
         values ($1, $2)
         on conflict (filename) do update set checksum = excluded.checksum, applied_at = now()`,
        [file, checksum]
      );
      await client.query("commit");
      console.log("OK");
    } catch (error) {
      await client.query("rollback");
      console.error(`Error applying ${file}: ${error.message}`);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log("\nMigration sync complete.");
}

async function ensureMigrationLedger(client) {
  await client.query(`
    create table if not exists public.operion_schema_migrations (
      filename text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function loadAppliedMigrations(client) {
  const result = await client.query("select filename from public.operion_schema_migrations");
  return new Set(result.rows.map((row) => row.filename));
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

run().catch((error) => {
  console.error("Fatal error applying migrations:", error.message || error);
  process.exit(1);
});
