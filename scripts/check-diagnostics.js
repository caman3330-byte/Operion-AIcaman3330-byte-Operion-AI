#!/usr/bin/env node

/**
 * Fetch diagnostics to check database schema status
 */

const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/diagnostics/readiness',
  method: 'GET',
  headers: {
    'x-operion-internal-key': 'operion_internal_test_key',
  },
  timeout: 10000,
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Database Status:');
      console.log('===============');
      
      if (json.diagnostics) {
        const { requiredMigrations, appliedMigrations, schemaVersion } = json.diagnostics;
        
        console.log(`Schema Version: ${schemaVersion}`);
        console.log(`Applied Migrations: ${appliedMigrations ? appliedMigrations.length : 0}`);
        console.log(`Required Migrations: ${requiredMigrations ? Object.keys(requiredMigrations).length : 0}`);
        
        if (requiredMigrations && Object.keys(requiredMigrations).length > 0) {
          console.log('\n⚠️  Missing migrations:');
          Object.entries(requiredMigrations).slice(0, 5).forEach(([schema, migration]) => {
            console.log(`   - ${migration}`);
          });
          if (Object.keys(requiredMigrations).length > 5) {
            console.log(`   ... and ${Object.keys(requiredMigrations).length - 5} more`);
          }
        } else {
          console.log('\n✅ All migrations applied');
        }
        
        if (json.status) {
          console.log(`\nStatus: ${json.status}`);
        }
      }
    } catch (err) {
      console.log('Raw response (first 1000 chars):');
      console.log(data.substring(0, 1000));
    }
  });
});

req.on('error', (err) => {
  console.error('❌ Error:', err.message);
});

req.on('timeout', () => {
  req.destroy();
  console.error('❌ Request timeout');
});

req.end();
