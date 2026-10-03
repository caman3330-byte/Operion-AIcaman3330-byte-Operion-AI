const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { assertEnvironment } = require('../../apps/dashboard/environment-safety.cjs');
const root = path.resolve(__dirname, '../..');
const env = { ...parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8')), ...process.env };
assertEnvironment(env, 'test');
const url = new URL(process.env.DASHBOARD_URL || 'http://localhost:3000');
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.protocol !== 'http:') {
  throw Error('Remote browser test targets are disabled until staging deployment identity has been verified. Use local development.');
}
