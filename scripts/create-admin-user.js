#!/usr/bin/env node

/**
 * Create or verify a founder admin user in Supabase.
 * Usage: node scripts/create-admin-user.js [email] [password]
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
const adminPassword = process.argv[3] || 'SecureAdminPassword123!';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/dashboard/.env.local');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${serviceRoleKey}`,
  apikey: serviceRoleKey,
};

console.log('📋 Creating or verifying admin user in Supabase...');
console.log(`   URL: ${supabaseUrl}`);
console.log(`   Admin email: ${adminEmail}`);

async function findUserByEmail(email) {
  const url = new URL(`${supabaseUrl}/auth/v1/admin/users`);
  url.searchParams.set('email', email);

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    throw new Error(`Failed to query auth users: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (Array.isArray(data)) {
    return data.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
  }

  return data;
}

async function createUser() {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { role: 'founder' },
      app_metadata: { role: 'founder' }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 409) {
      console.warn('⚠️  User already exists. Verifying existing account.');
      return null;
    }
    throw new Error(`Failed to create user: ${response.status} ${body}`);
  }

  return response.json();
}

async function verifyProfile(userId) {
  const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'GET',
    headers,
  });

  if (!profileResponse.ok) {
    console.warn('⚠️  Unable to query profiles table. Ensure migration 0008 has been applied.');
    return null;
  }

  const profiles = await profileResponse.json();
  return profiles[0] ?? null;
}

async function main() {
  let user = null;

  try {
    user = await createUser();
  } catch (error) {
    console.error('❌', error.message);
    process.exit(1);
  }

  if (!user) {
    user = await findUserByEmail(adminEmail);
    if (!user) {
      console.error('❌ Could not locate existing user after create attempt.');
      process.exit(1);
    }
  }

  console.log('✅ Admin user ready');
  console.log(`   Email: ${adminEmail}`);
  console.log(`   Password: ${adminPassword}`);
  console.log(`   User ID: ${user.id}`);

  const profile = await verifyProfile(user.id);
  if (profile) {
    console.log('✅ Profile found in `profiles` table');
    console.log(`   Role: ${profile.role}`);
  } else {
    console.warn('⚠️  No profile row found. Run `npm run supabase:create-admin-profile` after migration 0008.');
  }

  console.log('\n🎉 Admin setup complete!');
  console.log('📝 Next steps:');
  console.log('   1. Start the app and open http://localhost:3000/supervisor/login');
  console.log(`   2. Login with ${adminEmail} / ${adminPassword}`);
  console.log('   3. If login fails, ensure migration 0008 is applied and `profiles` table exists.');
}

main().catch((error) => {
  console.error('❌ Error creating admin user:', error.message || error);
  process.exit(1);
});