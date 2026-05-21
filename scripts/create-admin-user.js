#!/usr/bin/env node

/**
 * Create a real admin user in Supabase for testing authenticated admin access
 * Usage: node scripts/create-admin-user.js
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
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

console.log('📋 Creating admin user in Supabase...');
console.log(`   URL: ${supabaseUrl}`);

// Create admin user with email/password
const adminEmail = 'admin@operion.ai';
const adminPassword = 'SecureAdminPassword123!';

const createAdminUser = async () => {
  try {
    // Use Supabase Admin API to create user
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
      },
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          role: 'founder', // Set role in metadata
        },
        app_metadata: {
          role: 'founder',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Failed to create user:', response.status);
      console.error(error);
      return null;
    }

    const user = await response.json();
    console.log('✅ Admin user created successfully');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   User ID: ${user.id}`);

    // Now verify the profile was created
    await new Promise(resolve => setTimeout(resolve, 1000));

    const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json',
      },
    });

    if (profileResponse.ok) {
      const profiles = await profileResponse.json();
      if (profiles.length > 0) {
        console.log('✅ Profile auto-created via auth trigger');
        console.log(`   Role: ${profiles[0].role}`);
      } else {
        console.warn('⚠️  Profile not auto-created. May need manual role assignment.');
      }
    }

    return user;
  } catch (err) {
    console.error('❌ Error creating user:', err.message);
    return null;
  }
};

createAdminUser().then(user => {
  if (user) {
    console.log('\n🎉 Admin setup complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Visit http://localhost:3000/supervisor/login');
    console.log(`   2. Login with: ${adminEmail} / ${adminPassword}`);
    console.log('   3. Navigate to /admin to verify access');
    process.exit(0);
  } else {
    process.exit(1);
  }
});
