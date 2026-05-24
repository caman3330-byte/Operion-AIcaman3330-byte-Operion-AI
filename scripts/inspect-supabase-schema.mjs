import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

function readEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  return fs.readFileSync(envPath, 'utf8').split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return acc;
    const idx = trimmed.indexOf('=');
    if (idx < 0) return acc;
    const key = trimmed.slice(0, idx);
    const value = trimmed.slice(idx + 1);
    acc[key] = value;
    return acc;
  }, {});
}

const rootEnv = readEnv(path.resolve(process.cwd(), '.env.local'));
const appEnv = readEnv(path.resolve(process.cwd(), 'apps/dashboard/.env.local'));
const env = { ...rootEnv, ...appEnv };

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  global: { headers: { 'x-application-name': 'inspect-supabase-schema' } }
});

const expectedTables = [
  'profiles',
  'users',
  'businesses',
  'applications',
  'business_applications',
  'ai_qualification_logs',
  'lead_scores',
  'lender_matches',
  'crm_activities',
  'notifications',
  'underwriting_reviews',
  'documents',
  'funding_offers',
  'approval_statuses',
  'audit_logs',
  'api_usage_logs',
  'ai_tasks',
  'ai_task_logs',
  'outreach_logs',
  'simulation_runs',
  'workflow_execution_traces',
  'worker_control_state',
  'acquisition_jobs',
  'lead_enrichment',
  'business_contacts',
  'lead_sources',
  'acquisition_providers',
  'outreach_campaigns',
  'outreach_sequences',
  'outreach_email_queue',
  'outreach_replies',
  'admin_users',
  'risk_flags',
  'funding_pipeline',
  'automation_logs',
  'email_logs',
  'merchant_upload_sessions'
];

async function checkTableExists(table) {
  const { error } = await client.from(table).select('*').limit(1);
  return { table, exists: !error, message: error?.message ?? 'ok' };
}

async function checkTables() {
  const results = [];
  for (const table of expectedTables) {
    try {
      results.push(await checkTableExists(table));
    } catch (error) {
      results.push({ table, exists: false, message: error.message ?? String(error) });
    }
  }
  return results;
}

async function main() {
  console.log('Inspecting Supabase schema using service role key...\n');

  const tableResults = await checkTables();
  console.table(tableResults.map(({ table, exists, message }) => ({ table, exists, message })));

  const missingTables = tableResults.filter((row) => !row.exists);
  if (missingTables.length > 0) {
    console.warn('\nWarning: Supabase schema is missing expected tables.');
    missingTables.forEach((row) => console.warn(`  - ${row.table}: ${row.message}`));
    process.exitCode = 1;
  } else {
    console.log('\n✅ All expected schema tables are present.');
  }

  const profileCheck = await client.from('profiles').select('id,role,email').limit(1);
  if (profileCheck.error) {
    console.warn('\nUnable to query profiles table: %s', profileCheck.error.message);
  } else {
    console.log('\nprofiles sample:', profileCheck.data?.[0] ?? 'no rows found');
  }

  if (missingTables.length > 0) {
    console.log('\nUse `npm run supabase:status` or configure SUPABASE_DB_URL/SUPABASE_DB_PASSWORD to apply migrations.');
  }
}

main().catch((err) => {
  console.error('Error inspecting Supabase schema:', err.message || err);
  process.exit(1);
});
