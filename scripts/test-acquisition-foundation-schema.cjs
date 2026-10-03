const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, 'packages/database/migrations', file), 'utf8');
const batches = read('0036_manual_acquisition_import_batches.sql');
const prospects = read('0038_acquisition_prospect_foundation.sql');

for (const name of ['acquisition_import_batches', 'acquisition_import_rows']) assert.match(batches, new RegExp(`create table if not exists ${name}`));
for (const name of ['acquisition_import_batches', 'acquisition_import_rows']) assert.match(batches, new RegExp(`alter table ${name} enable row level security`));
assert.match(prospects, /create table if not exists acquisition_prospects/);
assert.match(prospects, /identity_key text not null unique/);
assert.match(prospects, /unique \(acquisition_import_batch_id, source_row_number\)/);
assert.match(prospects, /potential_duplicate_of_id uuid references acquisition_prospects/);
assert.match(prospects, /add column if not exists acquisition_prospect_id uuid references acquisition_prospects/);
assert.match(prospects, /idx_business_applications_acquisition_prospect_unique/);
assert.match(prospects, /idx_leads_acquisition_prospect_unique/);
assert.match(prospects, /alter table acquisition_prospects enable row level security/);
assert.match(prospects, /internal_manage_acquisition_prospects/);
assert.doesNotMatch(prospects, /sendgrid|zoho|openai|http/i);

console.log('acquisition foundation schema tests passed');
