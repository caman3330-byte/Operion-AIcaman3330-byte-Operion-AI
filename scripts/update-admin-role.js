#!/usr/bin/env node

/**
 * Verify admin user role and update if needed
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

const updateAdminRole = async () => {
  try {
    console.log('📋 Checking admin user role...');
    
    // Get current profile
    const getResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${adminUserId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!getResponse.ok) {
      console.error('❌ Failed to fetch profile:', getResponse.status);
      return;
    }

    const profiles = await getResponse.json();
    if (profiles.length === 0) {
      console.error('❌ Profile not found');
      return;
    }

    const profile = profiles[0];
    console.log(`   Current role: ${profile.role}`);
    console.log(`   Email: ${profile.email}`);

    if (profile.role === 'founder' || profile.role === 'admin' || profile.role === 'super_admin') {
      console.log('✅ User already has admin role');
      return;
    }

    console.log('\n📋 Updating role to founder...');
    
    // Update profile role
    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${adminUserId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          role: 'founder',
        }),
      }
    );

    if (!updateResponse.ok) {
      console.error('❌ Failed to update role:', updateResponse.status);
      const error = await updateResponse.text();
      console.error(error);
      return;
    }

    const updated = await updateResponse.json();
    console.log('✅ Role updated successfully');
    console.log(`   New role: ${updated[0].role}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
};

updateAdminRole().then(() => {
  console.log('\n📝 To verify admin access:');
  console.log('   1. Refresh browser at http://localhost:3000/admin');
  console.log('   2. Or logout and login again');
  process.exit(0);
});
