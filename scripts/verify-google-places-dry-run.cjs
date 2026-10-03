const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
require('../apps/dashboard/environment-safety.cjs').assertEnvironment({ ...process.env, ...env }, 'test');
const expected = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname;
if (!env.GOOGLE_PLACES_API_KEY?.trim()) throw new Error('Local server Google Places key is missing');
Object.assign(process.env, env, { ACQUISITION_SCHEDULER_ENABLED: 'false', MERCHANT_INTELLIGENCE_SCHEDULER_ENABLED: 'false' });
const redact = (value) => String(value).split(env.GOOGLE_PLACES_API_KEY).join('[REDACTED]').replace(/AIza[0-9A-Za-z_-]{35}/g, '[REDACTED]');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, 'apps/dashboard', name.slice(2)) : name, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, filename);

let blockedWrites = 0;
let databaseReads = 0;
const googleResponses = [];
const networkFetch = global.fetch;
global.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const method = (init?.method ?? input?.method ?? 'GET').toUpperCase();
  const googleSearch = url.href === 'https://places.googleapis.com/v1/places:searchText';
  if (url.hostname.endsWith('.supabase.co')) {
    if (url.hostname !== expected) throw new Error('Non-TEST database request blocked');
    if (!['GET', 'HEAD'].includes(method)) { blockedWrites++; throw new Error('Database write blocked by dry-run verification'); }
    databaseReads++;
  } else if (!['GET', 'HEAD'].includes(method) && !googleSearch) {
    throw new Error('External mutation blocked by dry-run verification');
  }
  if (googleSearch) {
    const body = JSON.parse(init.body);
    if (method !== 'POST' || body.textQuery !== 'roofing contractors in Dallas, Texas' || body.pageSize !== 3) throw new Error('Unbounded Google request blocked');
  }
  const response = await networkFetch(input, init);
  if (googleSearch) {
    const body = await response.clone().json();
    googleResponses.push({ status: response.status, returned: body.places?.length ?? 0, error: body.error ? redact(body.error.message) : null });
  }
  return response;
};
(async () => {
  // Keep operational logs out of this report; only print allowlisted diagnostics.
  const { logger } = require('../apps/dashboard/lib/logger.ts');
  for (const level of ['info', 'warn', 'error', 'debug']) logger[level] = () => {};
  const { runFreeFirstAcquisition } = require('../apps/dashboard/lib/acquisition/free-first-runner.ts');
  const result = await runFreeFirstAcquisition({ sourceKeys: ['google_places'], query: 'roofing contractors', location: 'Dallas, Texas', limit: 3, dryRun: true, requestedBy: 'isolated-read-only-verification' });
  console.log(JSON.stringify({ environment: 'local server with TEST database reads', runtimeKeyPresent: true, googleResponses, counts: result.counts, databaseReads, databaseWrites: 0, blockedWriteAttempts: blockedWrites, jobCreated: result.job_id !== null, validation: result.preview.map(p => ({ business: p.record.business_name, status: p.validation_status, reason: p.validation_reason })) }, null, 2));
  if (blockedWrites || result.job_id !== null || !googleResponses.some(r => r.status === 200 && r.returned > 0)) process.exitCode = 1;
})().catch(error => { console.error(JSON.stringify({ error: redact(error.message ?? 'Verification failed'), googleResponses, databaseReads, databaseWrites: 0, blockedWriteAttempts: blockedWrites })); process.exitCode = 1; });
