#!/usr/bin/env node

/**
 * Apply pending database migrations to Supabase
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

// Migrations to apply (in order)
const migrationFiles = [
  '0004_lead_acquisition_outreach.sql',
  '0005_internal_testing_simulation.sql',
  '0006_phase1_public_mvp.sql',
  '0007_platform_separation_fintech_schema.sql',
  '0008_production_mca_platform.sql',
  '0009_phase2_ai_operations.sql',
];

const migrationsDir = path.join(__dirname, '../packages/database/migrations');

const applyMigrations = async () => {
  console.log('📋 Applying pending database migrations...\n');
  
  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  Skipping ${file} - file not found`);
      continue;
    }

    try {
      console.log(`📝 Applying ${file}...`);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      // Execute SQL via Supabase REST API (for direct SQL execution)
      // Note: Supabase doesn't have a direct SQL execution API in REST
      // We need to use the PostgreSQL connection directly
      // For now, we'll provide instructions for manual application
      
      console.log(`   ✓ Ready to execute (${sql.length} bytes)`);
    } catch (err) {
      console.error(`   ❌ Error reading migration: ${err.message}`);
    }
  }

  console.log('\n⚠️  Note: Direct SQL execution via REST API is not available.');
  console.log('   You need to apply migrations manually using one of these methods:\n');
  console.log('   Option 1: Supabase SQL Editor');
  console.log('   1. Go to https://app.supabase.com');
  console.log('   2. Select your project');
  console.log('   3. Go to SQL Editor');
  console.log('   4. Copy and paste each migration file in order\n');
  
  console.log('   Option 2: psql (PostgreSQL CLI)');
  console.log('   1. Connect: psql "postgresql://postgres:password@db.qvzmdrghnfjqbezneqqc.supabase.co:5432/postgres"');
  migrationFiles.forEach(file => {
    console.log(`   2. Execute: \\i ${file}`);
  });
  console.log('\n   Option 3: Use Supabase CLI');
  console.log('   1. Install: npm install -g supabase');
  console.log('   2. Link project: supabase link --project-ref qvzmdrghnfjqbezneqqc');
  console.log('   3. Push migrations: supabase migration up');
};

applyMigrations().then(() => {
  console.log('\n💡 After applying migrations:');
  console.log('   1. Verify: npm run check:health');
  console.log('   2. Create admin profile via script');
  console.log('   3. Test admin login');
  process.exit(0);
});
