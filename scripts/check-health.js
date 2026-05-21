#!/usr/bin/env node

const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/health',
  method: 'GET',
  timeout: 5000,
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Health Status:');
      console.log('==============');
      console.log(`Status: ${json.status}`);
      console.log(`Timestamp: ${json.timestamp}`);
      
      if (json.diagnostics && json.diagnostics.requiredMigrations) {
        const migrations = json.diagnostics.requiredMigrations;
        const count = Object.keys(migrations).length;
        console.log(`\nMissing Migrations: ${count}`);
        Object.entries(migrations).forEach(([schema, migration]) => {
          console.log(`  ✗ ${schema}`);
          console.log(`    ${migration}`);
        });
      }
      
      if (json.services) {
        console.log(`\nServices:`);
        Object.entries(json.services).forEach(([name, status]) => {
          const icon = status === 'ok' || status === 'configured' ? '✓' : '✗';
          console.log(`  ${icon} ${name}: ${status}`);
        });
      }
    } catch (err) {
      console.log('Response (first 500 chars):');
      console.log(data.substring(0, 500));
    }
  });
});

req.on('error', (err) => {
  console.error('Error:', err.message);
});

req.on('timeout', () => {
  req.destroy();
  console.error('Request timeout');
});

req.end();
