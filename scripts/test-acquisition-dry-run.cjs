const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

let writes = 0;
let providerThrows = false;
let validationThrows = false;
let databaseDuplicate = false;
let validationStatus = 'verified';
const write = async () => { writes++; return { id: 'isolated-job', created: [{}], failed: [] }; };
const fixtures = [
  { business_name: 'Fixture Roofing', source: 'google_places', source_record_id: 'place-one', phone: '(214) 555-0100' },
  { business_name: 'Completely Renamed Business', source: 'google_places', source_record_id: 'place-one' }
];
const mocks = {
  '@/lib/acquisition/adapters/registry': { getAcquisitionAdapter: () => ({ discover: async () => {
    if (providerThrows) throw new Error('Provider unavailable');
    return { sourceKey: 'google_places', records: fixtures, errors: [], metadata: {} };
  } }) },
  '@/lib/acquisition/validation': {
    validateAcquisitionLead: async () => { if (validationThrows) throw new Error('Validation unavailable'); return { status: validationStatus, validation_reason: 'fixture', validation_score: 90 }; },
    applyValidationToQuality: (quality) => quality
  },
  '@/lib/acquisition/scoring': { scoreLeadQuality: () => ({ score: 90, tier: 'A' }) },
  '@/lib/acquisition/pipeline': { ingestLeadBatch: write },
  '@/lib/logger': { logger: { info() {} } },
  '@/lib/repositories/acquisition': { acquisitionRepository: {
    createJob: write, updateJob: write,
    findLeadByEmailOrName: async () => databaseDuplicate ? [{ id: 'existing-fixture' }] : []
  } }
};
const cache = new Map();
function load(name) {
  if (mocks[name]) return mocks[name];
  assert.ok(name.startsWith('@/lib/acquisition/'), `Unexpected dependency: ${name}`);
  if (cache.has(name)) return cache.get(name);
  const filename = path.join(__dirname, '../apps/dashboard', `${name.slice(2)}.ts`);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: load, URL };
  vm.runInNewContext(source, context, { filename });
  cache.set(name, context.exports);
  return context.exports;
}
(async () => {
  const { runFreeFirstAcquisition } = load('@/lib/acquisition/free-first-runner');
  const input = { sourceKeys: ['google_places'], query: 'fixture only', limit: 3, dryRun: true, requestedBy: 'unit-test' };
  let result = await runFreeFirstAcquisition(input);
  assert.equal(result.job_id, null);
  assert.equal(result.counts.duplicates, 1);
  assert.equal(result.counts.verified, 1);
  assert.equal(result.counts.imported, 0);
  assert.equal(writes, 0);
  databaseDuplicate = true;
  result = await runFreeFirstAcquisition(input);
  assert.equal(result.counts.duplicates, 2);
  assert.equal(result.preview.length, 0);
  databaseDuplicate = false;
  providerThrows = true;
  await assert.rejects(() => runFreeFirstAcquisition(input), /Provider unavailable/);
  providerThrows = false;
  validationThrows = true;
  await assert.rejects(() => runFreeFirstAcquisition(input), /Validation unavailable/);
  validationThrows = false;
  assert.equal(writes, 0);
  validationStatus = 'invalid';
  result = await runFreeFirstAcquisition({ ...input, dryRun: false });
  assert.equal(result.counts.imported, 0);
  assert.equal(writes, 2); // Non-dry-run job creation and completion only.
  validationStatus = 'verified';
  result = await runFreeFirstAcquisition({ ...input, dryRun: false });
  assert.equal(result.counts.imported, 1);
  assert.equal(writes, 5);
  console.log('PASS: dry-run success and failure make zero writes; source-ID and database duplicate handling; invalid records excluded; explicit import path preserved. All data mocked; no network or database used.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
