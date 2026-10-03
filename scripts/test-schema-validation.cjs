const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');
const safety = require('../apps/dashboard/environment-safety.cjs');

const validatorPath = path.join(__dirname, 'validate-production-schema.mjs');
const source = fs.readFileSync(validatorPath, 'utf8').replace(/import\.meta\.url/g, JSON.stringify(pathToFileURL(validatorPath).href));
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText;
const migrationFiles = ['0009_first.sql', '0009_second.sql'];
const migrationSql = 'select 1;';
const checksum = crypto.createHash('sha256').update(migrationSql).digest('hex');
const staging = {
  VERCEL_ENV: 'preview',
  NEXT_PUBLIC_SUPABASE_URL: `https://${safety.STAGING_REF}.supabase.co`,
  SUPABASE_DB_URL: `postgresql://postgres:test-only@db.${safety.STAGING_REF}.supabase.co/postgres`
};

async function inspect(env, scenario = {}) {
  const result = { queries: [], connections: 0, closed: 0, exitCode: 0, logs: [], errors: [] };
  let context;
  context = vm.createContext({
    exports: {},
    process: { env, exit(code) { result.exitCode = code; throw Error('Validation rejected'); } },
    console: { log(message) { result.logs.push(message); }, error(message) { result.errors.push(message); } },
    require(name) {
      if (name.includes('environment-safety')) return safety;
      if (name === 'node:fs') return {
        existsSync: () => false,
        readdirSync: () => migrationFiles,
        readFileSync: () => migrationSql
      };
      if (name === 'pg') return { Client: class {
        constructor(options) {
          assert.equal(options.options, '-c default_transaction_read_only=on');
          assert.equal(options.ssl === false, safety.databaseTarget(env.SUPABASE_DB_URL) === 'local');
          assert.ok(options.connectionTimeoutMillis > 0);
          assert.ok(options.query_timeout > 0);
        }
        async connect() { result.connections++; }
        async end() { result.closed++; }
        async query(sql, params = []) {
          result.queries.push(sql);
          if (sql === 'begin read only') {
            assert.equal(result.queries.length, 1);
            return {};
          }
          assert.equal(result.queries[0], 'begin read only');
          if (sql === 'commit') return {};
          assert.match(sql.trim(), /^select /i, 'Schema verification must never write');
          if (scenario.queryError) throw Error('Simulated metadata query failure');
          const value = expression => vm.runInContext(expression, context);
          if (sql.includes('to_regclass')) return { rows: [{ regclass: scenario.missingLedger ? null : 'operion_schema_migrations' }] };
          if (sql.includes('from public.operion_schema_migrations')) {
            return { rows: migrationFiles.filter((file, index) => !scenario.pending || index === 0)
              .map(filename => ({ filename, checksum: scenario.drift ? 'incorrect-checksum' : checksum })) };
          }
          if (sql.includes('information_schema.tables')) return { rows: value('requiredTables').map(table_name => ({ table_name })) };
          if (sql.includes('information_schema.columns')) return { rows: value('requiredColumns')[params[0]].map(column_name => ({ column_name })) };
          if (sql.includes('from pg_type')) return { rows: value('requiredEnumValues')[params[0]].map(enumlabel => ({ enumlabel })) };
          if (sql.includes('from pg_indexes')) return { rows: value('requiredIndexes').map(indexname => ({ indexname })) };
          if (sql.includes('from pg_proc')) return { rows: value('requiredFunctions').map(proname => ({ proname })) };
          if (sql.includes('from pg_policies')) return { rows: value('requiredPolicies').map(([tablename, policyname]) => ({ tablename, policyname })) };
          if (sql.includes('from storage.buckets')) return { rows: value('requiredStorageBuckets').map(id => ({ id, public: Boolean(scenario.publicBucket) })) };
          throw Error('Unexpected inspection query');
        }
      } };
      return require(name);
    }
  });
  try { await vm.runInContext(compiled, context); } catch (error) {
    if (error.message !== 'Validation rejected') throw error;
  }
  const report = result.logs.find(message => typeof message === 'string' && message.startsWith('{'));
  result.report = report ? JSON.parse(report) : null;
  return result;
}

(async () => {
  for (const env of [
    { ...staging, SUPABASE_DB_URL: `postgresql://postgres:test-only@db.${safety.PRODUCTION_REF}.supabase.co/postgres` },
    { ...staging, SUPABASE_PROJECT_REF: safety.PRODUCTION_REF },
    { ...staging, OPERION_ENV: 'production' }
  ]) {
    const rejected = await inspect(env);
    assert.equal(rejected.exitCode, 1);
    assert.equal(rejected.connections, 0, 'Mismatched targets must be rejected before connection');
  }
  for (const env of [staging,
    { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_DB_URL: 'postgresql://postgres:test-only@127.0.0.1:54322/postgres' },
    { VERCEL_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: `https://${safety.PRODUCTION_REF}.supabase.co`, SUPABASE_DB_URL: `postgresql://postgres:test-only@db.${safety.PRODUCTION_REF}.supabase.co/postgres` }
  ]) {
    const complete = await inspect(env);
    assert.equal(complete.exitCode, 0);
    assert.equal(complete.connections, 1);
    assert.equal(complete.closed, 1);
    assert.deepEqual(complete.report.migrations.applied, migrationFiles, 'Same-numbered migration filenames must remain distinct');
    assert.equal(complete.queries.at(-1), 'commit');
  }
  for (const scenario of [{ missingLedger: true }, { pending: true }, { drift: true }, { publicBucket: true }]) {
    const invalid = await inspect(staging, scenario);
    assert.equal(invalid.exitCode, 1);
    assert.equal(invalid.closed, 1);
    assert.ok(invalid.errors.some(message => message.includes('Schema validation failed')));
  }
  const failedQuery = await inspect(staging, { queryError: true });
  assert.equal(failedQuery.exitCode, 1);
  assert.equal(failedQuery.closed, 1, 'Failed queries must release the connection and transaction');
  assert.equal(failedQuery.queries.includes('commit'), false);
  console.log('PASS: schema target guard, read-only connections/transactions, complete migration ledger/checksums, private buckets, cleanup on failure. Mock database only; real connections/writes: 0.');
})().catch(error => { console.error(error); process.exitCode = 1; });
