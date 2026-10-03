const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const sentinel = 'test-only-secret-sentinel';
let key = sentinel;
let mode = 'success';
let requests = 0;
const logs = [];
const logger = { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) };
const mocks = {
  '@/lib/env': { readServerEnv: () => ({ GOOGLE_PLACES_API_KEY: key }) },
  '@/lib/logger': { logger },
  '@/lib/acquisition/adapters/public-pages': { createPublicPageAdapter: () => ({}) }
};
function load(relative, dependencies) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../apps/dashboard/lib', relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: name => { assert.ok(name in dependencies, `Unexpected import ${name}`); return dependencies[name]; }, AbortSignal, Error, setTimeout: fn => setTimeout(fn, 0), fetch: async (url, options) => {
    requests++;
    assert.equal(url, 'https://places.googleapis.com/v1/places:searchText');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['x-goog-api-key'], sentinel);
    assert.ok(options.headers['x-goog-fieldmask'].includes('places.id'));
    assert.equal(JSON.parse(options.body).pageSize, 3);
    assert.ok(options.signal);
    if (mode === 'network') throw new Error(`Network error ${sentinel}`);
    if (mode === 'error') return { ok: false, status: 403, json: async () => ({ error: { message: `Denied ${sentinel}` } }) };
    return { ok: true, status: 200, json: async () => ({ places: [
      { id: 'fixture-1', displayName: { text: 'Fixture Roofing' }, formattedAddress: '123 Example St, Dallas, TX 75201, USA', nationalPhoneNumber: '(214) 555-0100', types: ['roofing_contractor'], websiteUri: 'https://fixture.invalid' },
      { id: 'fixture-2', displayName: { text: 'Optional Fields Omitted' } },
      { displayName: { text: 'Missing ID' } }, null
    ] }) };
  } };
  vm.runInNewContext(source, context);
  return context.exports;
}
mocks['@/lib/retry'] = load('retry.ts', mocks);
const adapter = load('acquisition/adapters/registry.ts', mocks).getAcquisitionAdapter('google_places');
(async () => {
  const input = { query: 'roofing contractors', location: 'Dallas, Texas', limit: 3 };
  let result = await adapter.discover(input);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].source_record_id, 'fixture-1');
  assert.equal(result.records[0].city, 'Dallas');
  assert.equal(result.records[0].state, 'TX');
  assert.equal(result.records[0].address, '123 Example St');
  assert.equal(result.records[0].zip, '75201');
  assert.equal(result.records[1].phone, null);
  assert.equal(result.records[1].website_url, null);
  assert.equal(result.metadata.validation_failures, 2);
  mode = 'error';
  result = await adapter.discover(input);
  assert.equal(result.metadata.http_status, 403);
  assert.ok(!JSON.stringify(result).includes(sentinel));
  mode = 'network';
  result = await adapter.discover(input);
  assert.equal(result.metadata.status, 'failed');
  assert.ok(!JSON.stringify(result).includes(sentinel));
  assert.ok(!JSON.stringify(logs, (_key, value) => value instanceof Error ? value.message : value).includes(sentinel));
  key = '   ';
  const count = requests;
  result = await adapter.discover(input);
  assert.equal(result.metadata.status, 'disabled');
  assert.equal(requests, count);
  console.log('PASS: request contract, normalization, optional fields, malformed records, HTTP failure, retry-log redaction, whitespace key disabled. Mock responses only; no network or database.');
})().catch(error => { console.error(error); process.exitCode = 1; });
