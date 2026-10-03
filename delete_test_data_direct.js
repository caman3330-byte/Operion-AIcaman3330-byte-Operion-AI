const { Client } = require('pg');

// Note: This requires the database password which should be provided
// For now, we'll use the Supabase connection details

const connectionString = process.env.SUPABASE_DB_URL ||
  'postgresql://postgres:[PASSWORD]@db.dstqbiccseijydgsvlgj.supabase.co:5432/postgres';

if (!connectionString || connectionString.includes('[PASSWORD]')) {
  console.log('To run this script, set SUPABASE_DB_URL environment variable with the full connection string.');
  console.log('You can find this in the Supabase dashboard under Project Settings > Database > Connection string');
  console.log('');
  console.log('Alternatively, execute these SQL statements in the Supabase SQL Editor:');
  console.log('');
  console.log('-- Grant DELETE permission');
  console.log('GRANT DELETE ON public.acquisition_prospects TO service_role;');
  console.log('GRANT DELETE ON public.acquisition_import_batches TO service_role;');
  console.log('');
  console.log('-- Then delete test data');
  console.log('DELETE FROM public.acquisition_prospects WHERE provider = \'test_discovery\';');
  console.log('');
  process.exit(1);
}

const client = new Client(connectionString);

async function deleteTestData() {
  try {
    await client.connect();
    console.log('Connected to Supabase database');

    // Grant permissions
    console.log('\n1. Granting DELETE permissions to service_role...');
    await client.query('GRANT DELETE ON public.acquisition_prospects TO service_role');
    await client.query('GRANT DELETE ON public.acquisition_import_batches TO service_role');
    console.log('✓ Permissions granted');

    // Fetch test records
    console.log('\n2. Finding test businesses...');
    const result = await client.query(
      'SELECT id, business_name FROM public.acquisition_prospects WHERE provider = $1',
      ['test_discovery']
    );

    if (result.rows.length === 0) {
      console.log('✓ No test businesses found');
      await client.end();
      process.exit(0);
    }

    console.log(`Found ${result.rows.length} test businesses:`);
    result.rows.forEach(row => {
      console.log(`  - ${row.business_name} (${row.id})`);
    });

    // Delete test records
    console.log('\n3. Deleting test records...');
    const deleteResult = await client.query(
      'DELETE FROM public.acquisition_prospects WHERE provider = $1',
      ['test_discovery']
    );
    console.log(`✓ Deleted ${deleteResult.rowCount} records`);

    // Verify
    console.log('\n4. Verifying...');
    const verify = await client.query(
      'SELECT COUNT(*) FROM public.acquisition_prospects WHERE provider = $1',
      ['test_discovery']
    );

    if (verify.rows[0].count === '0') {
      console.log('✓ All test records removed. Database is clean.');
    } else {
      console.error('✗ Verification failed - test records still exist');
    }

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

deleteTestData();
