import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(rootDir, "packages/database/migrations");

loadEnvFile(path.join(rootDir, ".env.local"));
loadEnvFile(path.join(rootDir, "apps/dashboard/.env.local"));

const requiredTables = [
  "users",
  "businesses",
  "applications",
  "leads",
  "lenders",
  "outreach_history",
  "lead_distributions",
  "invoices",
  "audit_log",
  "prompt_versions",
  "prompt_test_results",
  "alerts",
  "api_usage_log",
  "suppression_list",
  "manager_agent_runs",
  "agent_definitions",
  "agent_departments",
  "agent_task_queue",
  "agent_messages",
  "agent_memory",
  "workflow_routes",
  "workflow_execution_traces",
  "lead_sources",
  "lead_enrichment",
  "outreach_campaigns",
  "outreach_sequences",
  "outreach_email_queue",
  "outreach_replies",
  "business_contacts",
  "acquisition_jobs",
  "simulation_runs",
  "worker_control_state",
  "profiles",
  "business_applications",
  "lead_scores",
  "lender_matches",
  "outreach_logs",
  "ai_tasks",
  "ai_task_logs",
  "documents",
  "funding_offers",
  "approval_statuses",
  "audit_logs",
  "api_usage_logs",
  "crm_activities",
  "notifications",
  "admin_users",
  "risk_flags",
  "funding_pipeline",
  "automation_logs",
  "email_logs",
  "merchant_upload_sessions"
];

const requiredColumns = {
  business_applications: [
    "id",
    "user_id",
    "profile_id",
    "business_id",
    "lead_id",
    "status",
    "business_name",
    "industry",
    "monthly_deposits",
    "requested_amount",
    "product_type",
    "credit_score_range",
    "owner_name",
    "contact_email",
    "contact_phone",
    "metadata",
    "submitted_at",
    "created_at",
    "updated_at"
  ],
  leads: ["business_application_id", "requested_amount", "monthly_deposits", "funding_purpose", "ai_summary", "internal_notes"],
  ai_tasks: [
    "id",
    "task_type",
    "status",
    "priority",
    "lead_id",
    "business_application_id",
    "assigned_agent",
    "input_payload",
    "result_payload",
    "attempts",
    "max_attempts"
  ],
  ai_task_logs: ["ai_task_id", "status", "message", "provider", "model", "metadata"],
  underwriting_reviews: [
    "lead_id",
    "business_application_id",
    "ai_task_id",
    "qualification_score",
    "industry_risk",
    "lender_recommendations"
  ],
  lender_matches: ["lead_id", "lender_id", "business_application_id", "match_score", "status", "criteria_snapshot"],
  outreach_logs: ["campaign_id", "lead_id", "business_application_id", "channel", "status", "provider_message_id", "metadata"],
  crm_activities: ["application_id", "business_application_id", "activity_type", "subject", "body", "metadata"],
  documents: [
    "business_application_id",
    "lead_id",
    "document_type",
    "status",
    "storage_bucket",
    "storage_path",
    "metadata",
    "uploaded_by_role",
    "processing_status",
    "processing_requested_at"
  ],
  merchant_upload_sessions: ["business_application_id", "email", "token_hash", "expires_at", "last_used_at", "revoked_at", "metadata"],
  api_usage_logs: ["service", "operation", "lead_id", "business_application_id", "ai_task_id", "estimated_cost_usd", "success"],
  funding_pipeline: ["business_application_id", "stage", "status", "priority", "metadata"],
  email_logs: ["outreach_log_id", "provider", "provider_message_id", "to_email", "status", "metadata"]
};

const requiredEnumValues = {
  app_role: ["customer", "staff", "supervisor", "founder", "admin", "operator", "analyst", "super_admin"],
  business_application_status: [
    "raw",
    "new_lead",
    "onboarding",
    "draft",
    "submitted",
    "documents_pending",
    "ai_review",
    "qualified",
    "needs_review",
    "underwriting_review",
    "reviewing",
    "reviewed",
    "submitted_to_lender",
    "routed",
    "approved",
    "funded",
    "rejected",
    "inactive",
    "withdrawn"
  ],
  ai_task_type: [
    "lead_qualification",
    "lead_extraction",
    "underwriting_summary",
    "lender_recommendation",
    "outreach_preparation",
    "reporting",
    "customer_support",
    "crm_activity",
    "executive_summary",
    "document_processing"
  ],
  lead_status: [
    "raw",
    "enriched",
    "scored",
    "qualified",
    "nurture",
    "archived",
    "distributed",
    "pending_approval",
    "rejected_distribution",
    "blacklisted",
    "qualification_error",
    "reviewing",
    "submitted",
    "approved",
    "funded",
    "rejected",
    "reviewed",
    "routed"
  ],
  lender_match_status: ["recommended", "approved", "submitted", "accepted", "rejected", "funded"],
  funding_pipeline_stage: ["intake", "triage", "underwriting", "offer", "funding", "closed"],
  funding_pipeline_status: ["open", "in_progress", "on_hold", "closed", "cancelled"]
};

const requiredIndexes = [
  "idx_business_applications_user_status",
  "idx_business_applications_lead_id",
  "idx_business_applications_status_updated",
  "idx_ai_tasks_status_created",
  "idx_ai_tasks_assigned_status",
  "idx_ai_tasks_type_status",
  "idx_lender_matches_lead_status",
  "idx_outreach_logs_lead_created",
  "idx_api_usage_logs_service_created",
  "idx_crm_activities_business_application_id",
  "idx_funding_pipeline_app_stage_status",
  "idx_email_logs_outreach_status",
  "idx_documents_storage_bucket_path",
  "idx_documents_processing_status",
  "idx_merchant_upload_sessions_application",
  "idx_merchant_upload_sessions_token_hash"
];

const requiredFunctions = [
  "set_updated_at",
  "current_app_role",
  "is_internal_user",
  "handle_new_auth_user_profile"
];

const requiredPolicies = [
  ["profiles", "profiles_self_or_internal_select"],
  ["business_applications", "business_applications_owner_or_internal_select"],
  ["business_applications", "business_applications_owner_or_internal_update"],
  ["documents", "documents_owner_or_internal_select"],
  ["funding_offers", "funding_offers_owner_or_internal_select"],
  ["ai_tasks", "internal_read_ai_tasks"],
  ["ai_task_logs", "internal_read_ai_task_logs"],
  ["api_usage_logs", "internal_read_api_usage_logs"],
  ["funding_pipeline", "internal_manage_funding_pipeline"],
  ["email_logs", "internal_read_email_logs"],
  ["merchant_upload_sessions", "internal_read_merchant_upload_sessions"]
];

const requiredStorageBuckets = ["merchant-documents", "underwriting-documents"];

async function main() {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("Missing SUPABASE_DB_URL or SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL");
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const report = {
    generatedAt: new Date().toISOString(),
    migrations: await inspectMigrations(client),
    tables: await inspectTables(client),
    columns: await inspectColumns(client),
    enums: await inspectEnums(client),
    indexes: await inspectIndexes(client),
    functions: await inspectFunctions(client),
    policies: await inspectPolicies(client),
    storageBuckets: await inspectStorageBuckets(client)
  };

  await client.end();

  const failures = countFailures(report);
  console.log(JSON.stringify(report, null, 2));
  if (failures > 0) {
    console.error(`\nProduction schema validation failed with ${failures} missing required item(s).`);
    process.exit(1);
  }
  console.log("\nProduction schema validation passed.");
}

async function inspectMigrations(client) {
  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
  const ledgerExists = await regclassExists(client, "public.operion_schema_migrations");
  if (!ledgerExists) {
    return {
      ledgerExists: false,
      files,
      applied: [],
      pendingByLedger: files,
      note: "Migration ledger is absent. Use object-level validation to assess manually applied migrations."
    };
  }

  const result = await client.query("select filename, checksum, applied_at from public.operion_schema_migrations order by filename");
  const applied = result.rows.map((row) => row.filename);
  return {
    ledgerExists: true,
    files,
    applied,
    pendingByLedger: files.filter((file) => !applied.includes(file))
  };
}

async function inspectTables(client) {
  const existing = await querySet(
    client,
    `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
    "table_name"
  );
  return requiredTables.map((table) => ({ table, exists: existing.has(table) }));
}

async function inspectColumns(client) {
  const result = {};
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const existing = await querySet(
      client,
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
      "column_name",
      [table]
    );
    result[table] = columns.map((column) => ({ column, exists: existing.has(column) }));
  }
  return result;
}

async function inspectEnums(client) {
  const result = {};
  for (const [enumName, values] of Object.entries(requiredEnumValues)) {
    const existing = await querySet(
      client,
      `select e.enumlabel
       from pg_type t
       join pg_enum e on e.enumtypid = t.oid
       join pg_namespace n on n.oid = t.typnamespace
       where n.nspname = 'public' and t.typname = $1`,
      "enumlabel",
      [enumName]
    );
    result[enumName] = values.map((value) => ({ value, exists: existing.has(value) }));
  }
  return result;
}

async function inspectIndexes(client) {
  const existing = await querySet(
    client,
    `select indexname from pg_indexes where schemaname = 'public'`,
    "indexname"
  );
  return requiredIndexes.map((index) => ({ index, exists: existing.has(index) }));
}

async function inspectFunctions(client) {
  const existing = await querySet(
    client,
    `select p.proname
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'`,
    "proname"
  );
  return requiredFunctions.map((fn) => ({ function: fn, exists: existing.has(fn) }));
}

async function inspectPolicies(client) {
  const result = await client.query(
    `select tablename, policyname from pg_policies where schemaname = 'public'`
  );
  const existing = new Set(result.rows.map((row) => `${row.tablename}:${row.policyname}`));
  return requiredPolicies.map(([table, policy]) => ({ table, policy, exists: existing.has(`${table}:${policy}`) }));
}

async function inspectStorageBuckets(client) {
  const existing = await querySet(
    client,
    `select id from storage.buckets`,
    "id"
  );
  return requiredStorageBuckets.map((bucket) => ({ bucket, exists: existing.has(bucket) }));
}

async function querySet(client, sql, key, params = []) {
  const result = await client.query(sql, params);
  return new Set(result.rows.map((row) => row[key]));
}

async function regclassExists(client, name) {
  const result = await client.query("select to_regclass($1) as regclass", [name]);
  return Boolean(result.rows[0]?.regclass);
}

function countFailures(report) {
  let count = 0;
  count += report.tables.filter((item) => !item.exists).length;
  for (const columns of Object.values(report.columns)) {
    count += columns.filter((item) => !item.exists).length;
  }
  for (const values of Object.values(report.enums)) {
    count += values.filter((item) => !item.exists).length;
  }
  count += report.indexes.filter((item) => !item.exists).length;
  count += report.functions.filter((item) => !item.exists).length;
  count += report.policies.filter((item) => !item.exists).length;
  count += report.storageBuckets.filter((item) => !item.exists).length;
  return count;
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
