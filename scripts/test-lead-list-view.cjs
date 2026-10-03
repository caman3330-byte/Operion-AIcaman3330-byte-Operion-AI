const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../apps/dashboard/lib/leads/list-view.ts'), 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const view = context.exports.buildLeadListView;
const records = Array.from({ length: 61 }, (_, i) => ({ id: `record-${i}`, business_name: `Business ${i}`, state: i === 60 ? 'TX' : 'CA', phone: i === 60 ? '5550000060' : null, status: i === 60 ? 'qualified' : 'raw', tier: i === 60 ? 'A' : null }));
const filters = { query: '', status: 'all', tier: 'all', page: 1 };
assert.equal(view(records, filters).rows.length, 25);
assert.equal(view(records, { ...filters, page: 3 }).rows.length, 11);
assert.equal(view(records, { ...filters, page: 999 }).page, 3);
assert.equal(view(records, { ...filters, page: NaN }).page, 1);
for (const query of [' record-60 ', 'tx', '5550000060']) {
  const result = view(records, { ...filters, query, page: 3 });
  assert.equal(result.rows[0].id, 'record-60');
  assert.equal(result.total, 1);
  assert.equal(result.page, 1);
}
assert.equal(view(records, { ...filters, status: 'qualified', tier: 'A' }).total, 1);
assert.equal(view(records, { ...filters, query: 'nonexistent' }).first, 0);
assert.equal(view([], filters).pageCount, 1);
assert.equal(records.length, 61);
console.log('PASS: bounded rendering, pagination boundaries, empty results, ID/phone/state search, combined filters. No network or database access.');
