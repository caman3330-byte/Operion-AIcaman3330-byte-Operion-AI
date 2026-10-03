const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const safety = require('../apps/dashboard/environment-safety.cjs');
const production = { VERCEL_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: `https://${safety.PRODUCTION_REF}.supabase.co` };
const staging = { VERCEL_ENV: 'preview', NEXT_PUBLIC_SUPABASE_URL: `https://${safety.STAGING_REF}.supabase.co` };
const local = { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' };
for (const env of [local, staging, production]) assert.doesNotThrow(() => safety.assertEnvironment(env));
assert.throws(() => safety.assertEnvironment(production, 'test'));
assert.throws(() => safety.assertEnvironment({ ...production, NODE_ENV: 'test' }));
assert.throws(() => safety.assertEnvironment({ ...staging, NEXT_PUBLIC_SUPABASE_URL: production.NEXT_PUBLIC_SUPABASE_URL }, 'test'));
assert.throws(() => safety.assertEnvironment({ ...production, OPERION_ENV: 'local' }));
assert.throws(() => safety.assertEnvironment({ ...staging, SUPABASE_PROJECT_REF: safety.PRODUCTION_REF }));
const prodDb = `postgresql://postgres.${safety.PRODUCTION_REF}:test-only@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;
assert.throws(() => safety.assertEnvironment({ ...staging, SUPABASE_DB_URL: prodDb }));
assert.throws(() => safety.assertMigrationTarget(production, prodDb));
assert.throws(() => safety.assertMigrationTarget(production, prodDb, ['--approved-production']));
assert.doesNotThrow(() => safety.assertMigrationTarget({ ...production, OPERION_APPROVED_PRODUCTION_MIGRATION: safety.PRODUCTION_REF }, prodDb, ['--approved-production']));
assert.doesNotThrow(() => safety.assertMigrationTarget(local, 'postgresql://postgres:test-only@127.0.0.1:54322/postgres'));
assert.throws(() => safety.assertEnvironment({ ...local, SUPABASE_DB_URL: 'postgresql://localhost.evil.invalid/db' }));
const jwt = (ref, role) => 'eyJhbGciOiJub25lIn0.' + Buffer.from(JSON.stringify({ ref, role })).toString('base64url') + '.test-only';
assert.throws(() => safety.assertEnvironment({ ...staging, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt(safety.PRODUCTION_REF, 'anon') }));
assert.throws(() => safety.assertEnvironment({ ...staging, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt(safety.STAGING_REF, 'service_role') }));
for (const key of ['SENDGRID_API_KEY', 'CRM_WEBHOOK_URL', 'N8N_WEBHOOK_BASE_URL', 'SLACK_WEBHOOK_URL', 'STRIPE_SECRET_KEY', 'ZOHO_CLIENT_SECRET']) {
  assert.throws(() => safety.assertEnvironment({ ...staging, [key]: 'test-only' }));
  assert.equal(safety.permitsExternalDelivery({ ...staging, [key]: 'test-only' }), false);
}
for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'NVIDIA_API_KEY', 'GROQ_API_KEY', 'GOOGLE_AI_API_KEY', 'OPENROUTER_API_KEY']) {
  assert.throws(() => safety.assertEnvironment({ ...staging, [key]: 'test-only' }));
  assert.doesNotThrow(() => safety.assertEnvironment({ ...staging, [key]: 'test-only', OPERION_ALLOW_NONPRODUCTION_AI: 'true' }));
}
for (const key of ['ACQUISITION_SCHEDULER_ENABLED', 'MERCHANT_INTELLIGENCE_SCHEDULER_ENABLED']) assert.throws(() => safety.assertEnvironment({ ...staging, [key]: 'true' }));
assert.equal(safety.permitsExternalDelivery(production), true);
assert.throws(() => safety.assertEnvironment({ ...staging, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_test-only' }));
const browserCheck = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(__dirname, 'e2e/environment-guard.cjs'))})`], {
  env: { ...process.env, OPERION_ENV: 'local', VERCEL_ENV: 'development', VERCEL_TARGET_ENV: 'development', NEXT_PUBLIC_SUPABASE_URL: local.NEXT_PUBLIC_SUPABASE_URL, DASHBOARD_URL: 'https://www.operioncapital.com' },
  encoding: 'utf8', timeout: 10000
});
assert.notEqual(browserCheck.status, 0);
assert.match(browserCheck.stderr, /Remote browser test targets are disabled/);

// Exercise the real integration wrapper with an isolated environment and no network.
const source = fs.readFileSync(path.join(__dirname, '../apps/dashboard/lib/runtime/integration-guards.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {}, process: { env: { ...staging, SENDGRID_API_KEY: 'test-only', SENDGRID_FROM_EMAIL: 'test@example.invalid' } }, require(name) { if (name.includes('environment-safety')) return safety; if (name === '@/lib/logger') return { logger: { warn() {}, error() {} } }; throw Error('Unexpected dependency'); } };
vm.runInNewContext(compiled, context);
(async () => {
  let calls = 0;
  for (const name of ['sendgrid', 'crm', 'n8n', 'slack', 'acquisition_scheduler', 'merchant_intelligence_scheduler']) await context.exports.safeIntegrationCall(name, () => { calls++; });
  assert.equal(calls, 0);
  console.log('PASS: environment, credential identity, migration approval, email/webhook/AI isolation and scheduler guards. External calls: 0; database writes: 0.');
})().catch(error => { console.error(error); process.exitCode = 1; });
