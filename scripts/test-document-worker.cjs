const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
let processingStatus = 'pending';
let applicationId = 'application-one';
const taskUpdates = [];
const heartbeats = [];
let applicationUpdates = 0;
const query = { select: () => query, eq: () => query, order: () => query, limit: async () => ({ data: [{ id: 'task-one', business_application_id: 'application-one', input_payload: { document_id: 'document-one' } }], error: null }) };
const mocks = {
  '@/lib/supabase/server': { getSupabaseAdmin: () => ({ from: () => query }) },
  '@/lib/repositories/production': { productionRepository: {
    getDocument: async () => ({ business_application_id: applicationId, processing_status: processingStatus }),
    getBusinessApplication: async () => ({ status: 'underwriting_review', metadata: {}, lead_id: null }),
    updateBusinessApplication: async () => { applicationUpdates++; },
    updateAiTask: async (_id, value) => { taskUpdates.push(value); },
    createAiTaskLog: async () => {},
    createCrmActivity: async () => {}
  } },
  '@/lib/audit': { writeAuditLog: async () => {} },
  '@/lib/logger': { logger: { info() {}, error() {} } },
  '@/lib/operations/worker-observability': { recordWorkerHeartbeat: async value => { heartbeats.push(value); } }
};
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../apps/dashboard/lib/workers/document-processing.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {}, require: name => { assert.ok(name in mocks, `Unexpected dependency ${name}`); return mocks[name]; } };
vm.runInNewContext(source, context);
(async () => {
  const run = context.exports.runDocumentProcessingWorker;
  let result = await run(1);
  assert.equal(result.blocked, 1);
  assert.equal(result.processed, 0);
  assert.equal(taskUpdates.length, 0);
  assert.equal(applicationUpdates, 0);
  assert.equal(heartbeats.at(-1).queueSize, 1);
  assert.equal(heartbeats.at(-1).lastCompletedAt, undefined);
  processingStatus = 'completed';
  applicationId = 'different-application';
  result = await run(1);
  assert.equal(result.failed, 1);
  assert.equal(taskUpdates.at(-1).status, 'failed');
  assert.equal(applicationUpdates, 0);
  applicationId = 'application-one';
  result = await run(1);
  assert.equal(result.processed, 1);
  assert.equal(result.blocked, 0);
  assert.equal(taskUpdates.at(-1).status, 'completed');
  assert.equal(applicationUpdates, 0);
  console.log('PASS: pending extraction stays blocked without task/application writes; cross-application document rejected; recorded processor completion acknowledged. Mock-only; no database or email.');
})().catch(error => { console.error(error); process.exitCode = 1; });
