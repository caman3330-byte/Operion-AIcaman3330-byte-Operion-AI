const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real API and middleware authorization paths with only mocked
// dependencies. No environment files, Supabase client, network or writes.
class AuthenticationError extends Error {}
class AuthorizationError extends Error {}
class ConfigurationError extends Error {}

class MockResponse {
  constructor(body = null, options = {}) {
    this.body = body;
    this.status = options.status ?? 200;
    this.headers = new Headers(options.headers);
    this.cookies = { set() {} };
  }
  static next() { return new MockResponse(); }
  static redirect(url) {
    return new MockResponse(null, { status: 307, headers: { location: url.toString() } });
  }
}

let user;
let profileRole;
let profileError;
const query = {
  select() { return query; },
  or() { return query; },
  async maybeSingle() {
    return { data: profileRole ? { role: profileRole } : null, error: profileError };
  }
};
const supabase = {
  auth: { getUser: async () => ({ data: { user }, error: user ? null : new AuthenticationError() }) },
  from(table) { assert.equal(table, 'profiles'); return query; }
};
const dependencies = {
  'next/server': { NextResponse: MockResponse },
  '@supabase/ssr': { createServerClient: () => supabase },
  '@supabase/supabase-js': { createClient: () => supabase },
  '@/lib/supabase/server': { getSupabaseAdmin: () => supabase },
  '@/lib/env': { getConfigurationStatus: () => ({ auth: true }) },
  '@/lib/errors': { AuthenticationError, AuthorizationError, ConfigurationError },
  'node:fs': { existsSync: () => false },
  'node:path': path
};

function load(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const context = {
    exports: {},
    process: { env: { NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock' }, cwd: () => '/nonexistent' },
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    }
  };
  vm.runInNewContext(compiled, context);
  return context.exports;
}

const auth = load('apps/dashboard/lib/auth.ts');
const { middleware } = load('apps/dashboard/middleware.ts');
function request(pathname) {
  const nextUrl = new URL(`https://example.invalid${pathname}`);
  nextUrl.clone = () => new URL(nextUrl);
  return { nextUrl, headers: new Headers({ authorization: 'Bearer mock-session' }), cookies: { getAll: () => [] } };
}
function setUser(claims = {}, role = 'customer') {
  user = { id: 'test-customer', email: 'customer@example.invalid', ...claims };
  profileRole = role;
  profileError = null;
}

(async () => {
  const elevatedRoles = ['staff', 'supervisor', 'founder', 'admin', 'operator', 'analyst', 'super_admin'];
  for (const claim of ['role', 'app_role']) {
    for (const role of elevatedRoles) {
      setUser({ user_metadata: { [claim]: role } });
      assert.equal(await auth.resolveUserRole(user.id, user.email, user), 'customer', `${claim}=${role} must not grant a role`);
      await assert.rejects(() => auth.requireInternalUser(request('/api/leads')), AuthorizationError);
      await assert.rejects(() => auth.requireFounder(request('/api/admin')), AuthorizationError);
      assert.equal((await middleware(request('/api/leads'))).status, 403);
      const page = await middleware(request('/supervisor'));
      assert.equal(page.status, 307);
      assert.equal(new URL(page.headers.get('location')).pathname, '/unauthorized');
    }
  }

  for (const claim of ['role', 'app_role']) {
    for (const role of elevatedRoles) {
      setUser({ app_metadata: { [claim]: role }, user_metadata: { role: 'customer' } });
      assert.equal((await auth.requireInternalUser(request('/api/leads'))).role, role);
      assert.equal((await middleware(request('/api/leads'))).status, 200);
      assert.equal((await middleware(request('/supervisor'))).status, 200);
      const isAdmin = ['founder', 'admin', 'super_admin'].includes(role);
      assert.equal((await middleware(request('/api/admin'))).status, isAdmin ? 200 : 403);
      if (isAdmin) assert.equal((await auth.requireFounder(request('/api/admin'))).role, role);
      else await assert.rejects(() => auth.requireFounder(request('/api/admin')), AuthorizationError);
    }
  }

  for (const role of elevatedRoles) {
    setUser({ user_metadata: { role: 'customer' } }, role);
    assert.equal((await auth.requireInternalUser(request('/api/leads'))).role, role);
    assert.equal((await middleware(request('/supervisor'))).status, 200);
  }

  setUser({ user_metadata: { role: 'founder' } }, null);
  profileError = new Error('Mock profile unavailable');
  await assert.rejects(() => auth.requireInternalUser(request('/api/leads')), AuthorizationError);
  assert.equal((await middleware(request('/api/leads'))).status, 403);

  setUser();
  assert.equal((await auth.requireCustomer(request('/api/documents'))).role, 'customer');
  user = null;
  await assert.rejects(() => auth.requireInternalUser(request('/api/leads')), AuthenticationError);
  assert.equal((await middleware(request('/api/leads'))).status, 401);
  const signedOut = await middleware(request('/supervisor'));
  assert.equal(signedOut.status, 307);
  assert.equal(new URL(signedOut.headers.get('location')).pathname, '/supervisor/login');
  console.log('PASS: self-editable role claims cannot grant API/page access; trusted app metadata and profile roles preserved; anonymous and unavailable-profile access denied. Mock-only, no network or database writes.');
})().catch(error => { console.error(error); process.exitCode = 1; });
