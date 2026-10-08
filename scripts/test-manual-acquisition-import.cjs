const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const XLSX = require('xlsx');

function compile(file, dependencies = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const sandboxModule = { exports: {} };
  vm.runInNewContext(output, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    require: (id) => dependencies[id] ?? require(id),
    Uint8Array, Error, Map, Set, Boolean, String, Number, Object, RegExp, Array, JSON, URL
  }, { filename: file });
  return sandboxModule.exports;
}
const filename = path.resolve(__dirname, '../apps/dashboard/lib/acquisition/manual-import.ts');
const normalization = compile(path.resolve(__dirname, '../apps/dashboard/lib/acquisition/normalization.ts'));
const { previewManualImport, ManualImportError } = compile(filename, {
  xlsx: XLSX,
  '@/lib/acquisition/normalization': normalization
});

const sourceRows = [
  { 'Business Name': 'Acme Roofing LLC', Address: '1 Main St', City: 'Austin', State: 'tx', ZIP: '78701', Website: 'acme.test', Phone: '(512) 555-0100', Email: 'Sales@Acme.test' },
  { 'Business Name': 'Acme Roofing', Address: '1 Main St', City: 'Austin', State: 'TX', ZIP: '78701', Website: 'https://acme.test' },
  { 'Business Name': 'No Contact LLC', City: 'Dallas', State: 'TX' },
  { 'Business Name': '', Email: 'bad email' }
];
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sourceRows), 'Prospects');
const workbookBytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
const preview = previewManualImport('prospects.xlsx', workbookBytes);
assert.deepEqual(JSON.parse(JSON.stringify(preview.counts)), { total: 4, valid: 2, duplicate: 1, invalid: 1, missing_email: 3, missing_phone: 3, ready_for_outreach: 1 });
assert.equal(preview.rows[1].status, 'duplicate');
assert.equal(preview.rows[2].status, 'valid');
assert.equal(preview.rows[3].status, 'invalid');
assert.equal(preview.rows[0].state, 'TX');

// Registry exports can be headerless and place owner name before the business.
// Keep this fixture synthetic so the private user workbook never enters Git.
const registryRows = [
  ['BRAIN', 'BIVONA', 'BIVCO BEGINNINGS LLC', '186 S DELAWARE AVENUE', 'LINDENHURST', 'NY', '11757-5127', '186 S DELAWARE AVENUE', 'LINDENHURST', 'NY', '11757-5127']
];
const registryBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(registryBook, XLSX.utils.aoa_to_sheet(registryRows), 'Sheet1');
const registryBytes = XLSX.write(registryBook, { bookType: 'xlsx', type: 'array' });
const registryPreview = previewManualImport('registry.xlsx', registryBytes);
assert.equal(registryPreview.counts.total, 1);
assert.equal(registryPreview.rows[0].business_name, 'BIVCO BEGINNINGS LLC');
assert.equal(registryPreview.rows[0].owner_name, 'BRAIN BIVONA');
assert.equal(registryPreview.rows[0].address, '186 S DELAWARE AVENUE');
assert.equal(registryPreview.rows[0].zip, '11757-5127');
assert.equal(registryPreview.rows[0].status, 'valid');

// Some exports start with business name and physical address, then repeat the
// mailing address. Ensure this headerless shape does not get mistaken for the
// first-name/last-name registry layout.
const businessFirstRows = [
  ['CARDINAL SELLING SERVICES LLC', '308 E 11th St', 'Huntingburg', 'IN', '47542', '308 E 11th St', 'Huntingburg', 'IN', '47542', '', '']
];
const businessFirstBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(businessFirstBook, XLSX.utils.aoa_to_sheet(businessFirstRows), 'Sheet1');
const businessFirstBytes = XLSX.write(businessFirstBook, { bookType: 'xlsx', type: 'array' });
const businessFirstPreview = previewManualImport('business-first.xlsx', businessFirstBytes);
assert.equal(businessFirstPreview.rows[0].business_name, 'CARDINAL SELLING SERVICES LLC');
assert.equal(businessFirstPreview.rows[0].address, '308 E 11th St');
assert.equal(businessFirstPreview.rows[0].city, 'Huntingburg');
assert.equal(businessFirstPreview.rows[0].state, 'IN');
assert.equal(businessFirstPreview.rows[0].zip, '47542');

assert.throws(() => previewManualImport('prospects.pdf', new Uint8Array([1])), ManualImportError);
assert.throws(() => previewManualImport('empty.csv', new Uint8Array()), ManualImportError);

const migration = fs.readFileSync(path.resolve(__dirname, '../packages/database/migrations/0036_manual_acquisition_import_batches.sql'), 'utf8');
assert.match(migration, /alter table acquisition_import_batches enable row level security/i);
assert.match(migration, /alter table acquisition_import_rows enable row level security/i);
assert.match(migration, /internal_manage_acquisition_import_batches/);
assert.match(migration, /internal_manage_acquisition_import_rows/);
console.log('manual acquisition import tests passed');
