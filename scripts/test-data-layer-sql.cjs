#!/usr/bin/env node
// Disposable, in-memory PostgreSQL verification. No .env files or network clients are loaded.
// Install @electric-sql/pglite in a separate temporary prefix, then provide its absolute
// package path with OPERION_PGLITE_PATH. Application dependencies remain unchanged.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const packagePath = process.env.OPERION_PGLITE_PATH;
if (!packagePath || !path.isAbsolute(packagePath)) {
  throw new Error('OPERION_PGLITE_PATH must point to a separately installed PGlite package.');
}
const { PGlite } = require(packagePath);
// Older PGlite bundles exposed pgcrypto as a contrib module; newer bundles
// provide gen_random_uuid() without that separate file. Support both layouts.
const pgcryptoPath = path.join(packagePath, 'dist/contrib/pgcrypto.cjs');
const extensions = fs.existsSync(pgcryptoPath) ? { pgcrypto: require(pgcryptoPath).pgcrypto } : {};
const hasPgcryptoExtension = Boolean(extensions.pgcrypto);
const root = path.resolve(__dirname, '..');
const migrations = path.join(root, 'packages/database/migrations');
const results = [];
const ids = {
  founder: '00000000-0000-4000-8000-000000000001',
  customer: '00000000-0000-4000-8000-000000000002',
  admin: '00000000-0000-4000-8000-000000000003',
  operator: '00000000-0000-4000-8000-000000000004',
  legacyLead: '00000000-0000-4000-8000-000000000005',
  legacyBatch: '00000000-0000-4000-8000-000000000006',
  legacyProspect: '00000000-0000-4000-8000-000000000007',
  aiCandidate: '00000000-0000-4000-8000-000000000008',
  aiSource: '00000000-0000-4000-8000-000000000009',
};

const bootstrap = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema storage;
create table auth.users (
  id uuid primary key default gen_random_uuid(), email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text
);
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

async function seedHistoricalFixtures(db) {
  for (const role of ['founder', 'customer', 'admin', 'operator']) {
    await db.query('insert into auth.users(id,email) values ($1,$2)', [ids[role], `${role}@sql-fixture.invalid`]);
    await db.query('update public.profiles set role=$1::app_role where id=$2', [role, ids[role]]);
  }
  await db.query('insert into leads(id,business_name,email) values ($1,$2,$3)', [ids.legacyLead, 'Historical SQL business', 'history@sql-fixture.invalid']);
  await db.query(`insert into acquisition_import_batches(id,batch_code,original_filename,content_sha256,total_rows,valid_rows)
    values ($1,'sql-historical-batch','historical.csv','historical-checksum',1,1)`, [ids.legacyBatch]);
  await db.query(`insert into acquisition_prospects(id,identity_key,acquisition_import_batch_id,source_row_number,
    normalized_business_name,normalized_address,business_name,address,source_payload)
    values($1,'sql-historical-identity',$2,17,'historical prospect','17 archive street','Historical Prospect','17 Archive Street','{"industry":"roofing","original_row":17}'::jsonb)`, [ids.legacyProspect, ids.legacyBatch]);
  await db.query(`insert into acquisition_import_rows(batch_id,row_number,status,normalized_payload)
    values($1,17,'imported','{"business_name":"Historical Prospect","address":"17 Archive Street"}'::jsonb)`, [ids.legacyBatch]);
  await db.query(`insert into merchant_acquisition_sources(id,source_url,source_name,source_type,industry,state)
    values($1,'https://sql-fixture.invalid/directory','SQL Fixture Directory','directory','roofing','TX')`, [ids.aiSource]);
  await db.query(`insert into merchant_acquisition_candidates(id,source_id,business_name,website_url,domain,industry,state,
    business_phone,business_email,enrichment_status,website_verified,phone_verified,email_found,identity_match,raw_payload)
    values($1,$2,'AI Fixture Business','https://ai.sql-fixture.invalid','ai.sql-fixture.invalid','roofing','TX',
      '5125550123','info@ai.sql-fixture.invalid','completed',true,true,true,true,
      '{"address":"100 Test Road","city":"Austin","zip":"78701","provider":"google"}'::jsonb)`, [ids.aiCandidate, ids.aiSource]);
  return historicalSnapshot(db);
}

async function historicalSnapshot(db) {
  const snapshots = {};
  const queries = {
    lead: ['select id,business_name,email,status,outreach_started from leads where id=$1', ids.legacyLead],
    batch: ['select id,batch_code,original_filename,content_sha256,total_rows,valid_rows from acquisition_import_batches where id=$1', ids.legacyBatch],
    prospect: ['select id,identity_key,acquisition_import_batch_id,source_row_number,business_name,address,source_payload,lead_id,business_application_id from acquisition_prospects where id=$1', ids.legacyProspect],
    row: ['select batch_id,row_number,status,normalized_payload from acquisition_import_rows where batch_id=$1', ids.legacyBatch],
    candidate: ['select id,source_id,business_name,business_phone,business_email,enrichment_status,raw_payload from merchant_acquisition_candidates where id=$1', ids.aiCandidate],
  };
  for (const [name, [sql, id]] of Object.entries(queries)) snapshots[name] = (await db.query(sql, [id])).rows;
  return snapshots;
}

async function check(name, operation) {
  await operation();
  results.push({ check: name, passed: true });
}

async function asRole(db, role, userId, operation) {
  assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId || '']);
  await db.exec(`set role ${role}`);
  try { return await operation(); } finally { await db.exec('reset role'); }
}

function row(number, overrides = {}) {
  return {
    row_number: number, status: 'valid', errors: [], business_name: 'Fixture Roofing',
    normalized_business_name: 'fixture roofing', address: '12 Test Avenue', normalized_address: '12 test avenue',
    city: 'Austin', normalized_city: 'austin', state: 'TX', normalized_state: 'tx', zip: '78701', normalized_zip: '78701',
    identity_key: 'fixture roofing|12 test avenue|austin|tx|78701',
    email: 'shared@sql-fixture.invalid', phone: '5125550100', industry: 'roofing',
    website_url: 'https://sql-fixture.invalid', domain: 'sql-fixture.invalid',
    raw_payload: { 'Business Name': 'Fixture Roofing', Address: '12 Test Avenue', 'Original row': number },
    ...overrides,
  };
}

async function importRows(db, rows, hash = 'a'.repeat(64), source = 'manual', provider = 'manual_upload') {
  return asRole(db, 'service_role', null, async () => (await db.query(
    'select public.import_data_prospects($1,$2,$3,$4,$5,$6::jsonb) as result',
    ['synthetic-sql-fixture.csv', hash, source, provider, ids.founder, JSON.stringify(rows)],
  )).rows[0].result);
}

async function counters(db) {
  return (await db.query(`select
    (select count(*)::integer from acquisition_import_batches) as batches,
    (select count(*)::integer from acquisition_import_rows) as rows,
    (select count(*)::integer from acquisition_prospects) as prospects,
    (select count(*)::integer from leads) as leads,
    (select count(*)::integer from business_applications) as applications,
    (select count(*)::integer from outreach_history) as outreach_history,
    (select count(*)::integer from outreach_email_queue) as outreach_email_queue`)).rows[0];
}

async function verifyDataLayer(db) {
  const initial = await counters(db);
  let imported;
  const rows = [
    row(1), row(2, { duplicate_reason: 'business_location: duplicate within upload', raw_payload: { original: 'duplicate retained' } }),
    row(3, { status: 'invalid', business_name: '', normalized_business_name: '', identity_key: null,
      email: null, phone: null, errors: ['Missing business name'], raw_payload: { Address: 'Unknown business address' } }),
    row(4, { address: '99 Different Street', normalized_address: '99 different street', identity_key: 'fixture roofing|99 different street|austin|tx|78701' }),
    row(5, { business_name: 'Unresolved Fixture', normalized_business_name: 'unresolved fixture', address: null,
      normalized_address: '', identity_key: null, email: null, phone: null }),
    row(6, { business_name: 'Unresolved Fixture', normalized_business_name: 'unresolved fixture', address: null,
      normalized_address: '', identity_key: null, email: null, phone: null }),
  ];

  await check('atomic import preserves every valid, duplicate and invalid source row', async () => {
    imported = await importRows(db, rows);
    assert.deepEqual(imported.counts, { total: 6, imported: 4, duplicate: 1, invalid: 1, missing_email: 3, missing_phone: 3 });
    assert.equal(imported.counts.total, imported.counts.imported + imported.counts.duplicate + imported.counts.invalid);
    assert.deepEqual(imported.rows.map(value => value.status), ['imported', 'duplicate', 'invalid', 'imported', 'imported', 'imported']);
    const stored = (await db.query('select row_number,raw_payload,acquisition_prospect_id,validation_errors from acquisition_import_rows where batch_id=$1 order by row_number', [imported.batch_id])).rows;
    assert.equal(stored.length, rows.length);
    stored.forEach((value, index) => assert.deepEqual(value.raw_payload, rows[index].raw_payload));
    assert.equal(stored[0].acquisition_prospect_id, stored[1].acquisition_prospect_id);
    assert.equal(stored[2].acquisition_prospect_id, null);
    assert.deepEqual(stored[2].validation_errors, ['Missing business name']);
  });
  await check('shared contact details do not merge distinct locations or unresolved rows', async () => {
    assert.notEqual(imported.rows[0].acquisition_prospect_id, imported.rows[3].acquisition_prospect_id);
    assert.notEqual(imported.rows[4].acquisition_prospect_id, imported.rows[5].acquisition_prospect_id);
  });
  await check('repeat upload is idempotent and returns original row outcomes', async () => {
    const before = await counters(db);
    const replay = await importRows(db, rows);
    assert.equal(replay.replayed, true);
    assert.equal(replay.batch_id, imported.batch_id);
    assert.deepEqual(replay.rows, imported.rows);
    assert.deepEqual(await counters(db), before);
  });
  await check('cross-source duplicate retains AI and manual provenance on one prospect', async () => {
    const linked = await importRows(db, [row(19)], 'b'.repeat(64), 'ai', 'google_places');
    assert.equal(linked.counts.duplicate, 1);
    assert.equal(linked.rows[0].acquisition_prospect_id, imported.rows[0].acquisition_prospect_id);
    const record = (await db.query('select * from data_prospect_records where id=$1', [imported.rows[0].acquisition_prospect_id])).rows[0];
    assert.deepEqual(record.sources.sort(), ['ai', 'manual']);
    const origins = (await db.query(`select b.source_kind,b.provider,r.row_number,r.raw_payload from acquisition_import_rows r
      join acquisition_import_batches b on b.id=r.batch_id where r.acquisition_prospect_id=$1 order by r.row_number`, [record.id])).rows;
    assert.equal(origins.length, 3);
    assert.ok(origins.some(value => value.provider === 'google_places' && value.row_number === 19));
  });
  await check('missing contact data stays null and is shown as missing contact', async () => {
    const record = (await db.query('select status,email,phone from data_prospect_records where id=$1', [imported.rows[4].acquisition_prospect_id])).rows[0];
    assert.deepEqual(record, { status: 'missing_contact', email: null, phone: null });
  });
  await check('existing AI candidates appear with business, location, contact and source details', async () => {
    const record = (await db.query('select * from data_prospect_records where id=$1', [ids.aiCandidate])).rows[0];
    assert.equal(record.record_kind, 'candidate');
    assert.equal(record.source, 'ai');
    assert.equal(record.provider, 'SQL Fixture Directory');
    assert.equal(record.address, '100 Test Road');
    assert.equal(record.city, 'Austin');
    assert.equal(record.phone, '5125550123');
    assert.equal(record.email, 'info@ai.sql-fixture.invalid');
    assert.equal(record.status, 'verified');
    assert.equal(record.verified, true);
  });
  await check('view supports real business, address, phone and email searches', async () => {
    for (const [column, term] of [['business_name', 'Fixture Roofing'], ['address', '12 Test'], ['phone', '5125550100'], ['email', 'shared@sql-fixture']]) {
      const found = (await db.query(`select id from data_prospect_records where ${column} ilike $1`, [`%${term}%`])).rows;
      assert.ok(found.some(value => value.id === imported.rows[0].acquisition_prospect_id), `${column} search`);
    }
  });
  await check('source, state, industry, status, verified and contact filters match stored data', async () => {
    const filtered = (await db.query(`select id from data_prospect_records where sources @> array['ai']::text[]
      and state='TX' and industry='roofing' and verified=true and status='verified' and email is not null and phone is not null`)).rows;
    assert.ok(filtered.some(value => value.id === ids.aiCandidate));
    const ready = (await db.query('select count(*)::integer as count from data_prospect_records where ready_for_outreach=true')).rows[0].count;
    assert.equal(ready, 0);
  });
  await check('ordered pagination conserves the full count without repeated records', async () => {
    const all = (await db.query('select id from data_prospect_records order by created_at desc,id')).rows;
    const pages = [];
    for (let offset = 0; offset < all.length; offset += 2) pages.push(...(await db.query('select id from data_prospect_records order by created_at desc,id limit 2 offset $1', [offset])).rows);
    assert.deepEqual(pages, all);
    assert.equal(new Set(pages.map(value => value.id)).size, all.length);
  });
  await check('malformed late row rolls back batch, rows and newly inserted prospects', async () => {
    const before = await counters(db);
    const valid = row(20, { identity_key: 'rollback-fixture-identity' });
    await assert.rejects(importRows(db, [valid, row('bad-row')], 'c'.repeat(64)), /invalid input syntax for type integer/);
    assert.deepEqual(await counters(db), before);
  });
  await check('duplicate row number rolls back the entire import', async () => {
    const before = await counters(db);
    await assert.rejects(importRows(db, [row(30, { identity_key: 'rollback-row-a' }), row(30, { identity_key: 'rollback-row-b' })], 'd'.repeat(64)), /duplicate key/);
    assert.deepEqual(await counters(db), before);
  });
  await check('empty and invalid import requests do not create batches', async () => {
    const before = await counters(db);
    await assert.rejects(importRows(db, [], 'e'.repeat(64)), /between 1 and 5000/);
    await assert.rejects(importRows(db, [row(31)], 'not-a-sha256'), /invalid DATA import request/);
    await assert.rejects(importRows(db, [row(31)], 'e'.repeat(64), 'unsupported'), /invalid DATA import request/);
    assert.deepEqual(await counters(db), before);
  });
  await check('anonymous and all authenticated roles cannot execute server-only import RPC or read view', async () => {
    for (const [role, user] of [['anon', null], ['authenticated', ids.customer], ['authenticated', ids.founder], ['authenticated', ids.admin]]) {
      await asRole(db, role, user, async () => {
        await assert.rejects(db.query('select public.import_data_prospects($1,$2,$3,$4,$5,$6::jsonb)', ['forbidden.csv', 'f'.repeat(64), 'manual', 'manual_upload', user, JSON.stringify([row(40)])]), /permission denied/);
        await assert.rejects(db.query('select * from public.data_prospect_records'), /permission denied/);
      });
    }
  });
  await check('RLS hides data from customers/operators and rejects their writes', async () => {
    for (const user of [ids.customer, ids.operator]) {
      await asRole(db, 'authenticated', user, async () => {
        for (const table of ['acquisition_prospects', 'acquisition_import_rows', 'acquisition_import_batches']) {
          assert.equal((await db.query(`select count(*)::integer as count from ${table}`)).rows[0].count, 0);
        }
        await assert.rejects(db.query(`insert into acquisition_import_batches(batch_code,original_filename,content_sha256)
          values('forbidden','forbidden.csv','forbidden')`), /row-level security/);
        const changed = await db.query('update acquisition_prospects set business_name=$1 where id=$2 returning id', ['Forbidden edit', ids.legacyProspect]);
        assert.equal(changed.rows.length, 0);
      });
    }
  });
  await check('RLS lets founder/admin view existing DATA and service role read the combined view', async () => {
    for (const user of [ids.founder, ids.admin]) await asRole(db, 'authenticated', user, async () => {
      assert.ok((await db.query('select count(*)::integer as count from acquisition_prospects')).rows[0].count > 0);
      assert.ok((await db.query('select count(*)::integer as count from acquisition_import_rows')).rows[0].count > 0);
    });
    await asRole(db, 'service_role', null, async () => {
      assert.ok((await db.query('select count(*)::integer as count from data_prospect_records')).rows[0].count > 0);
    });
  });
  await check('customer profile cannot self-escalate to a founder role', async () => {
    await asRole(db, 'authenticated', ids.customer, async () => {
      await assert.rejects(db.query("update profiles set role='founder' where id=$1", [ids.customer]), /row-level security/);
    });
    assert.equal((await db.query('select role from profiles where id=$1', [ids.customer])).rows[0].role, 'customer');
  });
  await check('DATA imports create no leads, applications, or outreach messages', async () => {
    const final = await counters(db);
    for (const key of ['leads', 'applications', 'outreach_history', 'outreach_email_queue']) assert.equal(final[key], initial[key]);
    assert.equal((await db.query('select count(*)::integer as count from acquisition_prospects where lead_id is not null or business_application_id is not null')).rows[0].count, 0);
  });
}

async function run() {
  const db = new PGlite({ extensions });
  try {
    await db.exec(bootstrap);
    const files = fs.readdirSync(migrations).filter(name => /^\d+.*\.sql$/.test(name)).sort();
    let historical;
    for (const filename of files) {
      if (process.argv.includes('--baseline-only') && filename.startsWith('0041_')) continue;
      if (filename.startsWith('0041_')) historical = await seedHistoricalFixtures(db);
      try {
        let sql = fs.readFileSync(path.join(migrations, filename), 'utf8');
        // Modern PGlite bundles expose gen_random_uuid() as a built-in but do
        // not ship the separately loadable pgcrypto extension.
        if (!hasPgcryptoExtension) sql = sql.replace(/create extension if not exists pgcrypto;\s*/gi, '');
        await db.exec(sql);
        results.push({ check: `migration ${filename}`, passed: true });
      } catch (error) {
        throw new Error(`${filename}: ${error.message}`, { cause: error });
      }
    }
    assert.ok(files.length >= 41, 'Expected the existing migration baseline');
    if (historical) {
      await check('historical leads, prospects, batch rows, candidates and provenance preserved', async () => {
        assert.deepEqual(await historicalSnapshot(db), historical);
      });
      await verifyDataLayer(db);
      await check('0041 can be reapplied without removing records or changing row outcomes', async () => {
        const before = await counters(db);
        await db.exec(fs.readFileSync(path.join(migrations, files.find(name => name.startsWith('0041_'))), 'utf8'));
        assert.deepEqual(await counters(db), before);
      });
    }
    console.log(JSON.stringify({ engine: 'PGlite PostgreSQL, in memory', checks: results.length, results }, null, 2));
  } finally {
    await db.close();
  }
}

run().catch(error => {
  console.error(JSON.stringify({ error: error.message, code: error.cause?.code || error.code || null, passedChecks: results.length }));
  process.exitCode = 1;
});
