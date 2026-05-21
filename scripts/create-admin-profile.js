#!/usr/bin/env node

/**
 * Create profile for admin user
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
const envPath = path.join(__dirname, '../apps/dashboard/.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ apps/dashboard/.env.local not found');
  process.exit(1);
}

const env = {};
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    env[key] = valueParts.join('=');
  }
});

const {
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
} = env;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const adminUserId = '902a2631-7509-44a7-bdf5-48d9179e0f17';
const adminEmail = 'admin@operion.ai';

const createProfile = async () => {
  try {
    console.log('📋 Creating profile for admin user...');
    
    // Create profile
    const createResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          id: adminUserId,
          email: adminEmail,
          full_name: 'Admin User',
          role: 'founder',
          company_name: 'Operion AI',
          title: 'Administrator',
        }),
      }
    );

    if (!createResponse.ok) {
      console.error('❌ Failed to create profile:', createResponse.status);
      const error = await createResponse.text();
      console.error(error);
      return;
    }

    const profile = await createResponse.json();
    console.log('✅ Profile created successfully');
    console.log(`   ID: ${profile[0]?.id}`);
    console.log(`   Email: ${profile[0]?.email}`);
    console.log(`   Role: ${profile[0]?.role}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
};

createProfile().then(() => {
  console.log('\n📝 Next steps:');
  console.log('   1. Refresh browser at http://localhost:3000/admin');
  console.log('   2. Or visit http://localhost:3000/supervisor to access supervisor dashboard');
  process.exit(0);
});
