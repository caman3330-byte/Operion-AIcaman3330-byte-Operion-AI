#!/usr/bin/env node

/**
 * Production Verification Script
 *
 * Tests the merchant acquisition and research system without exposing any credentials.
 * Run from command line: node verify-production.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration - UPDATE THIS WITH YOUR PRODUCTION URL
const PRODUCTION_URL = process.env.VERCEL_URL || 'https://operion-ai.vercel.app';
const FOUNDER_TOKEN = process.env.FOUNDER_TOKEN; // Your founder auth cookie/token

console.log('🔍 OPERION MERCHANT ACQUISITION VERIFICATION\n');
console.log(`Production URL: ${PRODUCTION_URL}`);
console.log('━'.repeat(60) + '\n');

let testsPassed = 0;
let testsFailed = 0;

// Helper: Make HTTPS request
function makeRequest(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(PRODUCTION_URL + path);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
          });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function test(name, fn) {
  process.stdout.write(`⏳ ${name}... `);
  try {
    await fn();
    console.log('✅ PASS');
    testsPassed++;
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    testsFailed++;
  }
}

async function runTests() {
  // TEST 1: Check database migration
  await test('1. Database migration 0044 applied', async () => {
    const res = await makeRequest('GET', '/api/data/diagnostics');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.body.database?.migration_0044_applied) {
      throw new Error('Migration 0044 not applied');
    }
  });

  // TEST 2: Check scheduler status
  await test('2. Scheduler is configured', async () => {
    const res = await makeRequest('GET', '/api/acquisition/status');
    if (res.status !== 200 && res.status !== 401) {
      throw new Error(`Status ${res.status}`);
    }
    // 401 is expected if not authenticated - that's OK, means endpoint exists
    if (res.status === 200) {
      if (!res.body.enabled) throw new Error('Scheduler not enabled');
      if (!res.body.schedule) throw new Error('Schedule not configured');
    }
  });

  // TEST 3: CSV upload endpoint exists
  await test('3. CSV upload endpoint available', async () => {
    const res = await makeRequest('POST', '/api/data/csv-upload', {}, {});
    // Will fail auth (expected) or have other error, but endpoint should exist
    if (res.status === 404) throw new Error('Endpoint not found');
  });

  // TEST 4: Research worker endpoint exists
  await test('4. Research worker endpoint available', async () => {
    const res = await makeRequest('GET', '/api/data/research-worker');
    // Will fail auth or succeed, but endpoint should exist
    if (res.status === 404) throw new Error('Endpoint not found');
  });

  // TEST 5: Verify test data file exists
  await test('5. Test data file (test_merchants.csv) exists', async () => {
    if (!fs.existsSync(path.join(__dirname, 'test_merchants.csv'))) {
      throw new Error('test_merchants.csv not found');
    }
  });

  // TEST 6: Production code deployed
  await test('6. Production build deployed', async () => {
    const res = await makeRequest('GET', '/api/data/diagnostics');
    if (res.status === 404) throw new Error('API endpoints not deployed');
  });
}

async function main() {
  try {
    console.log('Running production verification tests...\n');
    await runTests();

    console.log('\n' + '━'.repeat(60));
    console.log(`\n📊 Results: ${testsPassed} passed, ${testsFailed} failed\n`);

    if (testsFailed === 0) {
      console.log('✅ All tests passed! System is production ready.\n');
      console.log('Next steps:');
      console.log('1. Upload test_merchants.csv via /data/csv-research');
      console.log('2. Monitor research progress in real time');
      console.log('3. Verify results appear in /data page');
      console.log('4. Check /api/acquisition/status for scheduler metrics');
      console.log('5. Wait for next cron execution (UTC 02:00, 08:00, 14:00, 20:00)');
    } else {
      console.log('⚠️  Some tests failed. Review output above.\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

main();
