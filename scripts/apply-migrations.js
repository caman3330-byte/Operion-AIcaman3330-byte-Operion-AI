#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function getDatabaseUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  if (process.env.SUPABASE_DB_PASSWORD && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const projectHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
    const dbHost = `db.${projectHost}`;
    const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
    return `postgresql://postgres:${password}@${dbHost}:5432/postgres`;
  }
  return null;
}

async function run() {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) {
    console.error('Missing SUPABASE_DB_URL or SUPABASE_DB_PASSWORD+NEXT_PUBLIC_SUPABASE_URL');
    process.exit(1);
  }

  const migrationsDir = path.resolve(__dirname, '../packages/database/migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.error('Migrations directory not found:', migrationsDir);
    process.exit(1);
  }

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  console.log('Found migrations:', files.join(', '));

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  let anyError = false;
  for (const file of files) {
    const full = path.join(migrationsDir, file);
    console.log('\n--- Applying', file);
    const sql = fs.readFileSync(full, 'utf8');
    try {
      await client.query(sql);
      console.log('OK');
    } catch (err) {
      anyError = true;
      console.error('Error applying', file, err.message || err);
      // Try to continue where sensible
    }
  }

  await client.end();
  if (anyError) {
    console.error('\nOne or more migrations failed. Inspect above logs.');
    process.exit(1);
  }

  console.log('\nAll migrations applied (or skipped if already present).');
}

run().catch((err) => {
  console.error('Fatal error applying migrations:', err.message || err);
  process.exit(1);
});
