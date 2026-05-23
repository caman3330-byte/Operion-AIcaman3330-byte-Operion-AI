import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(rootDir, "packages/database/migrations");

loadEnvFile(path.join(rootDir, ".env.local"));
loadEnvFile(path.join(rootDir, "apps/dashboard/.env.local"));

async function main() {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("Missing SUPABASE_DB_URL or SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL");
  }

  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(`
    create table if not exists public.operion_schema_migrations (
      filename text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    await client.query(
      `insert into public.operion_schema_migrations (filename, checksum)
       values ($1, $2)
       on conflict (filename) do update set checksum = excluded.checksum`,
      [file, checksum]
    );
  }

  await client.end();
  console.log(`Reconciled ${files.length} migration ledger row(s). No migration SQL was executed.`);
}

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

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
