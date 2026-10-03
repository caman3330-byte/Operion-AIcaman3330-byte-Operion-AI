const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'packages/database/migrations/0037_secure_profile_roles.sql'), 'utf8');
const session = fs.readFileSync(path.join(root, 'apps/dashboard/lib/supabase/session.ts'), 'utf8');

assert.match(migration, /'customer'::app_role/);
assert.doesNotMatch(migration, /new\.raw_user_meta_data\s*->>\s*'role'/);
assert.match(migration, /profiles_self_update_without_role_change/);
assert.match(migration, /role = public\.current_app_role\(\)/);
assert.match(migration, /drop policy if exists "admin_manage_self_or_internal"/);
assert.match(migration, /internal_manage_admin_users/);
assert.doesNotMatch(migration, /auth\.uid\(\)\s*=\s*auth\.uid\(\)/);
assert.match(session, /process\.env\.NODE_ENV === "production" \|\| process\.env\.OPERION_ENABLE_TEST_AUTH_OVERRIDE !== "true"/);

console.log('role escalation schema regression tests passed');
