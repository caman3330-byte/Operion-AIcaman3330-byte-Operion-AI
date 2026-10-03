const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const zod = require('zod');
const root = path.resolve(__dirname, '../../apps/dashboard');
const deny = () => { throw Error('Unexpected external effect'); };
const logs = [];
const logger = Object.fromEntries(['info', 'warn', 'error', 'debug'].map(level => [level, (...args) => logs.push([level, ...args])]));
function load(relative, mocks = {}) {
  const filename = path.join(root, relative);
  const context = { exports: {}, Error, URL, fetch: deny, require(name) { assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency ${name}`); return mocks[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context, { filename });
  return context.exports;
}
const validation = load('lib/validation.ts', { zod });
const next = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
const errors = load('lib/errors.ts', { 'next/server': next, zod, '@/lib/logger': { logger } });
const leads = [];
const applications = [];
const documents = [];
const tasks = [];
const leadRepository = {
  create: async payload => { const row = { id: `lead-${leads.length}`, ...payload }; leads.push(row); return row; },
  update: async (id, patch) => { const row = leads.find(lead => lead.id === id); Object.assign(row, patch); return row; }
};
const fixture = {
  id: 'approved-fixture', source_id: 'fixture-source', business_name: 'Fixture Roofing', website_url: 'https://fixture.invalid',
  domain: 'fixture.invalid', industry: 'roofing', state: 'TX', business_phone: '2145550100', business_email: 'fixture@example.invalid',
  quality_score: 95, website_verified: true, phone_verified: true, identity_match: true,
  enrichment_status: 'completed', import_review_status: 'approved', created_at: '2026-01-01', reviewed_by: 'fixture-founder', raw_payload: {}
};
const filters = [];
const query = {
  select() { return this; }, eq(...args) { filters.push(args); return this; },
  gte(...args) { filters.push(args); return this; }, order() { return this; }, limit() { return this; },
  then(resolve, reject) { return Promise.resolve({ data: fixture.import_review_status === 'approved' ? [fixture] : [], error: null }).then(resolve, reject); }
};
const acquisitionRepository = {
  findLeadByEmailOrName: async input => leads.filter(lead => lead.email === input.email),
  updateMerchantCandidate: async (_id, patch) => Object.assign(fixture, patch),
  createEnrichment: async () => {}, upsertContact: async () => {}
};
const importer = load('lib/acquisition/merchant-candidate-import.ts', {
  '@/lib/audit': { writeAuditLog: async () => {} },
  '@/lib/acquisition/normalization': load('lib/acquisition/normalization.ts'),
  '@/lib/acquisition/scoring': load('lib/acquisition/scoring.ts', { '@/lib/acquisition/industry-profiles': load('lib/acquisition/industry-profiles.ts') }),
  '@/lib/repositories/acquisition': { acquisitionRepository }, '@/lib/repositories/leads': { leadsRepository: leadRepository },
  '@/lib/supabase/server': { getSupabaseAdmin: () => ({ from: () => query }) }
});
const productionRepository = {
  ensureProductionSchema: async () => {},
  createBusinessApplication: async payload => { const row = { id: `app-${applications.length}`, ...payload }; applications.push(row); return row; },
  createDocument: async payload => documents.push(payload),
  createAiTask: async payload => { const row = { id: `task-${tasks.length}`, ...payload }; tasks.push(row); return row; },
  createAiTaskLog: async () => {}, createAuditLog: async () => {}
};
const applicationRoute = load('app/api/applications/route.ts', {
  'next/server': next, '@/lib/auth': { getRequestUser: async () => null }, '@/lib/audit': { writeAuditLog: async () => {} },
  '@/lib/errors': errors, '@/lib/rate-limit': { enforceRateLimit() {}, rateLimitKey: () => 'fixture' },
  '@/lib/repositories/leads': { leadsRepository: leadRepository }, '@/lib/repositories/production': { productionRepository },
  '@/lib/validation': validation, '@/lib/services/onboarding': { recordMerchantOnboarding: async () => {} },
  '@/lib/email/sendgrid': { sendMerchantConfirmationEmail: async () => ({ ok: false, status: 0 }) },
  '@/lib/portal/merchant-upload-auth': { createMerchantUploadMagicLink: async () => ({ created: false }) }
});
(async () => {
  const imported = await importer.importApprovedMerchantCandidates({ requestedBy: 'fixture-founder' });
  assert.equal(imported.imported, 1);
  assert.ok(filters.some(([key, value]) => key === 'import_review_status' && value === 'approved'));
  fixture.import_review_status = 'approved'; // Repeat an import against an already existing CRM identity.
  assert.equal((await importer.importApprovedMerchantCandidates({ requestedBy: 'fixture-founder' })).duplicates, 1);
  assert.equal(leads.length, 1);
  const payload = {
    business_name: fixture.business_name, industry: fixture.industry, state: fixture.state,
    owner_name: 'Fixture Owner', contact_email: fixture.business_email, contact_phone: fixture.business_phone,
    monthly_deposits: 20000, requested_amount: 40000, credit_score_range: '700_plus', consent_to_contact: true
  };
  const request = { json: async () => payload, nextUrl: new URL('https://preview.example.invalid/api/applications') };
  const submitted = await applicationRoute.POST(request);
  assert.equal(submitted.status, 201);
  assert.equal(submitted.body.data.application.status, 'awaiting_documents');
  assert.equal(documents[0].lead_id, submitted.body.data.lead.id);
  assert.equal(tasks[0].status, 'queued');
  const originalLinked = leads[0].business_application_id === applications[0].id;
  const repeat = await applicationRoute.POST(request);
  assert.equal(repeat.status, 201);
  const result = {
    execution: 'fully isolated VM mocks; no network, credentials, real database or external delivery',
    approved_import: 'PASS', repeated_import_duplicate_prevention: 'PASS',
    application_creation_document_request_and_qualification_queue: 'PASS (mocks only)',
    imported_lead_to_application_linkage: originalLinked ? 'PASS' : 'FAIL',
    application_resubmission_idempotency: applications.length === 1 ? 'PASS' : 'FAIL',
    observed: { crm_leads_after_one_import_and_two_identical_submissions: leads.length, applications: applications.length, ai_tasks_queued: tasks.length, original_imported_lead_has_application: Boolean(leads[0].business_application_id) }
  };
  fs.writeFileSync(path.join(__dirname, 'merchant-conversion-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (!originalLinked || applications.length !== 1) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
