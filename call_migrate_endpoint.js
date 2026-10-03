const fs = require('fs');
const path = require('path');

const migrationSQL = fs.readFileSync(
  path.join(__dirname, 'packages/database/migrations/0042_grant_data_table_permissions.sql'),
  'utf-8'
);

console.log('Calling migrate endpoint...');

// Use fetch to call the local migrate endpoint
fetch('http://localhost:3000/api/admin/migrate-database', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ sql: migrationSQL }),
}).then(r => r.json()).then(d => {
  console.log('Response:', JSON.stringify(d, null, 2));
}).catch(e => {
  console.error('Error:', e.message);
});
