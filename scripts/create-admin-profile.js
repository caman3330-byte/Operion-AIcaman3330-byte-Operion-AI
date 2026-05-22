#!/usr/bin/env node

/**
 * Create or update an admin profile row in Supabase.`
 * Usage: node scripts/create-admin-profile.js [email] [role]
 */

const fs = require('fs');
const path = require('path');

function readEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  return fs.readFileSync(envPath, 'utf8').split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return acc;
    const [key, ...valueParts] = trimmed.split('=');
    if (!key || valueParts.length === 0) return acc;
    acc[key] = valueParts.join('=');
    return acc;
  }, {});
}

const envPath = path.join(__dirname, '../apps/dashboard/.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ apps/dashboard/.env.local not found');
  process.exit(1);
}

const env = readEnv(envPath);
const { NEXT_PUBLIC_SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey, ADMIN_EMAIL } = env;
const adminEmail = process.argv[2] || ADMIN_EMAIL || 'founder@operion.ai';
const adminRole = process.argv[3] || 'founder';
const adminFullName = env.ADMIN_FULL_NAME || 'Founder Admin';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/dashboard/.env.local');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${serviceRoleKey}`,
  apikey: serviceRoleKey,
  Prefer: 'resolution=merge-duplicates'
};

console.log('📋 Creating or updating founder profile in Supabase...');
console.log(`   URL: ${supabaseUrl}`);
console.log(`   Founder email: ${adminEmail}`);
console.log(`   Role: ${adminRole}`);

async function findUserByEmail(email) {
  const url = new URL(`${supabaseUrl}/auth/v1/admin/users`);
  url.searchParams.set('email', email);

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    throw new Error(`Failed to query auth users: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  // Supabase admin users endpoint may return either an array or an object
  // with a `users` array depending on CLI/version. Normalize accordingly.
  const users = Array.isArray(data) ? data : (data && Array.isArray(data.users) ? data.users : null);
  if (!users) return null;
  return users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function upsertProfile(user) {
  const body = JSON.stringify({
    id: user.id,
    email: user.email,
    full_name: adminFullName,
    role: adminRole
  });

  const response = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
    method: 'POST',
    headers,
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to upsert profile: ${response.status} ${text}`);
  }

  // Try to parse JSON, but if empty body, return success
  try {
    return await response.json();
  } catch (e) {
    return { success: true };
  }
}

async function main() {
  const user = await findUserByEmail(adminEmail);
  if (!user) {
    console.error('❌ No Supabase auth user found for email:', adminEmail);
    console.error('Create the user first with `npm run supabase:create-admin-user` or via Supabase Auth admin.');
    process.exit(1);
  }

  const result = await upsertProfile(user);
  console.log('✅ Profile created or updated successfully.');
  console.log('Result:', result);
  console.log('\n🎉 Founder profile is now reconciled for admin auth.');
}

main().catch((error) => {
  console.error('❌ Error creating admin profile:', error.message || error);
  process.exit(1);
});
