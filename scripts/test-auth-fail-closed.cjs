const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../apps/dashboard/lib/auth.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
class Denied extends Error {}
let network = 0;
const context = { exports: {}, process: { env: { NODE_ENV: 'development' }, cwd: () => '/nonexistent' }, require(name) {
  if (name === '@/lib/errors') return { ConfigurationError: Denied, AuthorizationError: Denied, AuthenticationError: Denied };
  if (name === '@/lib/env') return { getConfigurationStatus: () => ({ auth: false }) };
  if (name === '@/lib/supabase/server') return { getSupabaseAdmin: () => { network++; throw Error('Unexpected database call'); } };
  if (name === '@supabase/supabase-js') return { createClient: () => { network++; throw Error('Unexpected database call'); } };
  if (name === 'node:fs') return { existsSync: () => false };
  if (name === 'node:path') return path;
  throw Error('Unexpected dependency');
} };
vm.runInNewContext(compiled, context);
(async () => {
  await assert.rejects(() => context.exports.requireRole({ headers: new Headers() }, ['founder']), Denied);
  assert.equal(network, 0);
  console.log('PASS: missing Auth configuration denies access; no synthetic founder; no network.');
})().catch(error => { console.error(error); process.exitCode = 1; });
