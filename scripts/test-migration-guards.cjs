const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const safety = require('../apps/dashboard/environment-safety.cjs');
const source = fs.readFileSync(path.join(__dirname, 'apply-migrations.js'), 'utf8');
async function inspect(env) {
  const queries = [];
  let connections = 0;
  const context = {
    __dirname, console: { log() {}, error() {} },
    process: { env, argv: ['node', 'apply-migrations.js', '--dry-run'], exit() { throw Error('Process rejected invocation'); } },
    require(name) {
      if (name.includes('environment-safety')) return safety;
      if (name === 'fs') return { existsSync: p => !p.endsWith('.env.local'), readdirSync: () => ['0001_example.sql'] };
      if (name === 'pg') return { Client: class {
        constructor(options) { assert.equal(options.options, '-c default_transaction_read_only=on'); }
        async connect() { connections++; }
        async query(sql) { queries.push(sql); assert.match(sql, /^select /i); return { rows: [{ ledger: null }] }; }
        async end() {}
      } };
      return require(name);
    }
  };
  let rejected = false;
  try { await vm.runInNewContext(source, context); } catch { rejected = true; }
  return { queries, connections, rejected };
}
(async () => {
  const prod = { VERCEL_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: `https://${safety.PRODUCTION_REF}.supabase.co`, SUPABASE_DB_URL: `postgresql://postgres:test-only@db.${safety.PRODUCTION_REF}.supabase.co/postgres` };
  const denied = await inspect(prod);
  assert.equal(denied.rejected, true);
  assert.equal(denied.connections, 0);
  const local = await inspect({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_DB_URL: 'postgresql://postgres:test-only@127.0.0.1:54322/postgres' });
  assert.equal(local.rejected, false);
  assert.equal(local.connections, 1);
  assert.equal(local.queries.length, 1);
  console.log('PASS: production rejected before connection; missing-ledger dry-run performs SELECT only. Mock connections only; real database writes: 0.');
})().catch(error => { console.error(error); process.exitCode = 1; });
