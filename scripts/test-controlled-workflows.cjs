const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const zod = require('zod');
const safety = require('../apps/dashboard/environment-safety.cjs');

// No environment files, real repositories, provider SDKs or network are loaded.
const root = path.resolve(__dirname, '../apps/dashboard');
const staging = { VERCEL_ENV: 'preview', NEXT_PUBLIC_SUPABASE_URL: 'https://dstqbiccseijydgsvlgj.supabase.co' };
const telemetry = [];
const logger = Object.fromEntries(['info', 'warn', 'error', 'debug'].map(level => [level, (...args) => telemetry.push([level, ...args])]));
const denied = () => { throw new Error('Unexpected external effect in isolated test'); };
function load(relative, dependencies = {}, env = staging) {
  const filename = path.join(root, relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const context = {
    exports: {}, Error, URL, Buffer,
    process: { env: { ...env } }, fetch: denied,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency in ${relative}: ${name}`);
      return dependencies[name];
    }
  };
  vm.runInNewContext(source, context, { filename });
  return context.exports;
}
const next = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
const errors = load('lib/errors.ts', { 'next/server': next, zod, '@/lib/logger': { logger } });

async function emailAndDelivery() {
  const render = () => ({ subject: 'Fixture', text: 'Fixture', html: '<p>Fixture</p>' });
  const email = load('lib/email/sendgrid.ts', {
    '@/lib/api-usage': { recordApiUsage: denied }, '@/lib/env': { readServerEnv: denied },
    '@/lib/email/senders': { inferEmailPurposeFromOperation: denied, resolveOperionSender: denied },
    '@/lib/email/templates': { renderOperionEmail: render, renderOperationalTestEmail: render, renderParagraphEmail: render },
    '@/lib/logger': { logger }, '@/lib/retry': { withRetry: denied },
    '@/lib/runtime/integration-guards': { safeIntegrationCall: denied }, '../../environment-safety.cjs': safety
  });
  for (const result of await Promise.all([
    email.sendOutreachEmail({ leadId: 'fixture', to: 'nobody@example.invalid', subject: 'Fixture', html: 'Fixture', emailNumber: 1 }),
    email.sendMerchantConfirmationEmail({ leadId: 'fixture', to: 'nobody@example.invalid', businessName: 'Fixture' }),
    email.sendTestEmail({ to: 'nobody@example.invalid', subject: 'Fixture', text: 'Fixture' })
  ])) {
    assert.equal(result.ok, false);
    assert.equal(result.status, 0);
    assert.match(result.error, /disabled in this environment/);
  }
  const distribution = load('lib/distribution.ts', {
    '@/lib/errors': errors, '@/lib/logger': { logger }, '@/lib/repositories/production': {},
    '@/lib/repositories/lenders': { lendersRepository: { list: denied, getById: denied } },
    '@/lib/supabase/server': { getSupabaseAdmin: denied }, '@/lib/retry': {}, '@/lib/audit': { writeAuditLog: denied },
    '@/lib/email/sendgrid': { sendLenderPackageNotificationEmail: denied }, '../environment-safety.cjs': safety
  });
  await assert.rejects(() => distribution.distributeLead({ lead: { id: 'fixture', distribution_approved_at: '2026-01-01' }, actorId: 'fixture' }), /disabled outside production/);
  console.log('PASS: Preview outreach, confirmation, test email and lender delivery denied before any transport, credential read or database write.');
}

async function lenderMatching() {
  const rows = [{ id: 'allowed', company_name: 'Fixture', active: true, approval_status: 'approved', lender_status: 'active',
    funding_range_min: 5000, funding_range_max: 100000, min_fico: 600, min_monthly_revenue: 10000,
    minimum_time_in_business_months: 12, states_served: ['TX'], industries_served: ['roofing'] }];
  const filters = [];
  const query = { select() { return this; }, eq(...args) { filters.push(args); return this; }, order: async () => ({ data: rows, error: null }) };
  const deps = { '../supabase/server': { getSupabaseAdmin: () => ({ from: () => query }) }, '../logger': { logger }, './distribution': {} };
  const routing = load('lib/lenders/routing.ts', deps);
  const distribution = load('lib/lenders/distribution.ts', { '../supabase/server': deps['../supabase/server'], '../logger': { logger }, './routing': routing });
  const merchant = { state: 'TX', industry: 'roofing', requestedAmount: 50000, creditScore: 700, monthlyRevenue: 20000, timeInBusinessMonths: 24 };
  const { plan } = await distribution.buildLenderDistributionPlan({ merchant });
  assert.deepEqual([...plan.selectedLenderIds], ['allowed']);
  assert.equal(plan.requiresApproval, true);
  assert.ok(filters.some(([field, value]) => field === 'approval_status' && value === 'approved'));
  assert.ok(filters.some(([field, value]) => field === 'lender_status' && value === 'active'));
  for (const patch of [{ state: 'CA' }, { industry: 'retail' }, { requestedAmount: 200000 }, { creditScore: 400 }, { monthlyRevenue: 100 }, { timeInBusinessMonths: 1 }]) {
    const { plan: rejected } = await distribution.buildLenderDistributionPlan({ merchant: { ...merchant, ...patch } });
    assert.equal(rejected.selectedLenderIds.length, 0);
    assert.ok(rejected.decisions[0].restrictionFailures.length > 0);
  }
  console.log('PASS: lender plans filter approval/active state, reject six requirement failures and retain founder approval; no funding submission.');
}

async function aiGateway() {
  const gatewayErrors = load('lib/ai/gateway/errors.ts', { '@/lib/errors': errors });
  const policy = load('lib/ai/gateway/policy.ts');
  const routing = load('lib/ai/gateway/routing.ts');
  const gateway = load('lib/ai/gateway/index.ts', {
    zod, '@/lib/logger': { logger }, './errors': gatewayErrors, './policy': policy,
    './adapters': { createProviderAdapters: () => ({}) }, './routing': routing
  });
  const { aiGatewayMockTests: tests } = load('lib/ai/gateway/gateway.test.ts', { zod, './index': gateway, './errors': gatewayErrors, './policy': policy });
  assert.equal((await tests.providerNotConfigured()).provider, 'openai');
  assert.ok(tests.providerConfigured().some(item => item.provider === 'groq' && item.configured === 'configured'));
  assert.equal((await tests.successfulRequest()).provider, 'groq');
  const fallback = await tests.fallback();
  assert.equal(fallback.provider, 'openai');
  assert.equal(fallback.fallback.reason, 'temporary');
  await assert.rejects(() => tests.structuredOutputValidation());
  assert.ok(tests.providerHealth().some(item => item.health === 'healthy'));
  assert.equal(tests.timeoutCategorization(), 'temporary');
  assert.equal(tests.rateLimitCategorization(), 'rate_limited');
  assert.equal(tests.invalidCredentialCategorization(), 'auth');
  const decision = tests.policyDefaultsRequireApproval();
  assert.equal(decision.approvalRequired, true);
  assert.ok(decision.blockedTools.includes('send_email'));
  assert.ok(decision.blockedTools.includes('lender_submission'));
  assert.ok(telemetry.some(entry => entry[1] === 'ai_gateway_provider_failed'));
  console.log('PASS: ten existing AI gateway cases asserted with mock providers, output validation, failover, health, error categories and approval policy.');
}

async function orchestration() {
  const { agentRegistry } = load('lib/manager-agent/registry.ts');
  assert.equal(new Set(agentRegistry.map(agent => agent.id)).size, agentRegistry.length);
  assert.ok(agentRegistry.length > 0);
  const rows = new Map();
  const audit = [];
  let needsApproval = true;
  const route = { workflow_key: 'fixture', primary_agent_key: 'fixture_agent', department_key: 'operations', name: 'Fixture', approval_policy: {} };
  const repository = {
    getWorkflowRoute: async () => ({ ...route, requires_approval: needsApproval }),
    createTask: async payload => { const task = { id: `task-${rows.size}`, ...payload }; rows.set(task.id, task); return task; },
    updateTask: async (id, payload) => { const task = { ...rows.get(id), ...payload }; rows.set(id, task); return task; },
    createApproval: async payload => ({ id: 'approval-fixture', ...payload }),
    createMessage: async payload => payload,
    upsertSharedContext: async () => {}, upsertMemory: async () => {},
    listTasks: async ({ status }) => [...rows.values()].filter(task => task.status === status),
    claimTask: async (id, payload) => repository.updateTask(id, payload)
  };
  const common = {
    '@/lib/audit': { writeAuditLog: async entry => audit.push(entry) },
    '@/lib/repositories/orchestration': { orchestrationRepository: repository },
    '@/lib/n8n': { dispatchN8nWorkflow: async () => null }
  };
  const orchestrator = load('lib/agent-orchestration/orchestrator.ts', {
    ...common, '@/lib/repositories/api-usage': {}, '@/lib/repositories/alerts': {},
    '@/lib/manager-agent/registry': { agentRegistry }, '@/lib/runtime/ttl-cache': {}
  });
  let routed = await orchestrator.routeWorkflow({ workflowKey: 'fixture', title: 'Fixture', instructions: 'Mock only', createdBy: 'fixture' });
  assert.equal(routed.task.status, 'blocked');
  assert.equal(routed.task.approval_id, 'approval-fixture');
  needsApproval = false;
  routed = await orchestrator.routeWorkflow({ workflowKey: 'fixture', title: 'Fixture', instructions: 'Mock only', createdBy: 'fixture' });
  assert.equal(routed.task.status, 'queued');
  let executionError = null;
  let executions = 0;
  const worker = load('lib/agent-runtime/worker-runtime.ts', {
    ...common, '@/lib/agent-orchestration/orchestrator': orchestrator,
    '@/lib/agent-runtime/execution-modules': { executeAgentTask: async () => { executions++; if (executionError) throw new Error(executionError); return { summary: 'Fixture complete', output: {} }; } },
    '@/lib/notifications': { notifyFounder: async () => null }, '@/lib/logger': { logger },
    '@/lib/autonomous-company/repository': {},
    '@/lib/autonomous-company/permissions': { assertCompanyCanOperate: async () => {}, assertBudgetAvailable: denied },
    '@/lib/supabase/server': { getSupabaseAdmin: denied }, '@/lib/autonomous-company/durable-cycle': { cycleRpc: denied }
  });
  const completed = await worker.runWorkerTick({ workerId: 'mock-worker' });
  assert.equal(completed.processed.length, 1);
  assert.equal(completed.processed[0].status, 'completed');
  assert.equal(executions, 1); // The approval-blocked task never executes.
  assert.ok(audit.some(entry => entry.eventType === 'agent_task_completed'));
  executionError = 'temporary network failure';
  const retry = await orchestrator.routeWorkflow({ workflowKey: 'fixture', title: 'Retry fixture', instructions: 'Mock only', createdBy: 'fixture' });
  assert.equal((await worker.runWorkerTick({ workerId: 'mock-worker' })).processed[0].status, 'queued');
  assert.equal(rows.get(retry.task.id).context.runtime_attempts, 1);
  executionError = 'approval denied';
  assert.equal((await worker.runWorkerTick({ workerId: 'mock-worker' })).processed[0].status, 'failed');
  assert.equal(rows.get(retry.task.id).context.failure_class, 'permanent');
  assert.ok(audit.some(entry => entry.eventType === 'agent_task_retry_scheduled'));
  assert.ok(audit.some(entry => entry.eventType === 'agent_task_failed'));
  console.log('PASS: unique agent registry, approval-blocked versus queued task creation, worker success, transient retry, permanent failure and audit telemetry; repository writes are mocks only.');
}

(async () => {
  await emailAndDelivery();
  await lenderMatching();
  await aiGateway();
  await orchestration();
  console.log('All controlled workflow checks passed. No real database, network, email, funding request or AI provider was used.');
})().catch(error => { console.error(error); process.exitCode = 1; });
