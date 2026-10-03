const fs = require('fs');
const path = require('path');

const migrationSQL = fs.readFileSync(
  path.join(__dirname, 'packages/database/migrations/0042_grant_data_table_permissions.sql'),
  'utf-8'
);

console.log('Migration SQL:');
console.log(migrationSQL);
console.log('\nExecuting migration...');

// Use fetch to call the API
const SUPABASE_URL = 'https://dstqbiccseijydgsvlgj.supabase.co';
const SERVICE_ROLE_KEY = 'sb_secret_FF2EyUoPonIx37ZWrvRoCQ_SZ55mZ13';

fetch(`${SUPABASE_URL}/rest/v1/rpc/query`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'apikey': SERVICE_ROLE_KEY,
  },
  body: JSON.stringify({ query: migrationSQL }),
}).then(r => r.json()).then(d => {
  console.log('Response:', JSON.stringify(d, null, 2));
}).catch(e => {
  console.error('Error:', e.message);
});
