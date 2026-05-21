#!/usr/bin/env node
const { spawnSync } = require("child_process");
const { URL } = require("url");

const action = process.argv[2] || "help";
const env = process.env;

function usage() {
  console.log("Usage: node ./scripts/supabase-migrate.js <action> [--dry-run]");
  console.log("");
  console.log("Actions:");
  console.log("  push       Push pending Supabase migrations to the remote database");
  console.log("  status     Show the current Supabase database state");
  console.log("  help       Show this help message");
  console.log("");
  console.log("Environment variables:");
  console.log("  SUPABASE_DB_URL        Full Postgres connection string for the Supabase database");
  console.log("  SUPABASE_DB_PASSWORD   Postgres password for the Supabase database (optional if SUPABASE_DB_URL is provided)");
  console.log("  NEXT_PUBLIC_SUPABASE_URL  Supabase project URL used to derive the database hostname when SUPABASE_DB_PASSWORD is provided");
  console.log("");
  console.log("Example:");
  console.log("  SUPABASE_DB_PASSWORD=xxx npm run supabase:push");
  process.exit(action === "help" ? 0 : 1);
}

function getDatabaseUrl() {
  if (env.SUPABASE_DB_URL) {
    return env.SUPABASE_DB_URL;
  }

  if (!env.SUPABASE_DB_PASSWORD || !env.NEXT_PUBLIC_SUPABASE_URL) {
    return null;
  }

  try {
    const projectUrl = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
    const projectHost = projectUrl.hostname;
    if (!projectHost.endsWith(".supabase.co")) {
      return null;
    }

    const dbHost = `db.${projectHost}`;
    const password = encodeURIComponent(env.SUPABASE_DB_PASSWORD);
    return `postgres://postgres:${password}@${dbHost}:5432/postgres`;
  } catch {
    return null;
  }
}

function runSupabaseCli(args) {
  const result = spawnSync("npx", ["supabase", ...args], {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

const dbUrl = getDatabaseUrl();
const dryRun = process.argv.includes("--dry-run");

if (action === "push") {
  if (!dbUrl) {
    console.error("Missing SUPABASE_DB_URL or SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL.");
    console.error("Set one of these in your environment before running this command.");
    process.exit(1);
  }

  const args = ["db", "push", "--include-all", "--db-url", dbUrl, "--yes"];
  if (dryRun) {
    args.splice(args.indexOf("--yes"), 1);
    args.push("--dry-run");
  }
  runSupabaseCli(args);
} else if (action === "status") {
  if (!dbUrl) {
    console.error("Missing SUPABASE_DB_URL or SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL.");
    console.error("Set one of these in your environment before running this command.");
    process.exit(1);
  }

  runSupabaseCli(["db", "status", "--db-url", dbUrl]);
} else {
  usage();
}
