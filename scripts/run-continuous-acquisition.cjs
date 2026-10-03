const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { setTimeout: sleep } = require('node:timers/promises');
const { Client } = require('pg');
const root = path.resolve(__dirname, '..');
const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
const safety = require('../apps/dashboard/environment-safety.cjs');
safety.assertEnvironment({ ...process.env, ...env }, 'test');
const ref = safety.databaseTarget(env.SUPABASE_DB_URL);
Object.assign(process.env, env);
for (const key of Object.keys(process.env)) if (/OPENAI_API_KEY|ANTHROPIC_API_KEY|NVIDIA_API_KEY|SENDGRID_API_KEY|N8N.*URL/.test(key)) delete process.env[key];
const ts = require('typescript');
const Module = require('node:module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, 'apps/dashboard', name.slice(2)) : name, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, filename);
const report = { project: ref, started_at: new Date().toISOString(), cycles: [], errors: [] };
(async () => {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: ref === 'local' ? false : { rejectUnauthorized: false } });
  await db.connect();
  try {
    if (process.argv.includes('--apply')) {
      console.log({ modifying_hostname: target.hostname, project_ref: ref, matches_confirmed_test: true });
      await db.query('begin');
      try {
        await db.query(fs.readFileSync(path.join(root, 'packages/database/migrations/0035_company_cycle_wake.sql'), 'utf8'));
        await db.query('commit');
      } catch (error) { await db.query('rollback'); throw error; }
    }
    if (process.argv.includes('--validate')) {
      const { chromium } = require('playwright');
      const browser = await chromium.launch({ headless: true });
      await browser.newPage();
      await browser.close();
      report.test_browser_closed_at = new Date().toISOString();
      await db.query("update company_operating_state set status='OPERATIONAL',emergency_stop=false where company_key='operion'");
    }
    const { runAutonomousAcquisitionCycle } = require('../apps/dashboard/lib/autonomous-company/acquisition-loop.ts');
    const deadline = Date.now() + 12 * 60_000;
    while (Date.now() < deadline && report.cycles.length < 4) {
      const state = (await db.query("select status,emergency_stop from company_operating_state where company_key='operion'")).rows[0];
      if (state.status !== 'OPERATIONAL' || state.emergency_stop) { report.stopped_by = state; break; }
      const wake = (await db.query("select next_wake_at from company_cycles where company_key='operion' order by sequence desc limit 1")).rows[0];
      const wait = wake ? new Date(wake.next_wake_at).getTime() - Date.now() : 0;
      if (wait > 0) { await sleep(Math.min(wait, 1000)); continue; }
      try {
        const result = await runAutonomousAcquisitionCycle({ requestedBy: 'milestone-1e-headless', taskLimit: 1, workerLimit: 1 });
        if (result.status === 'completed') {
          report.cycles.push({ id: result.company_cycle_id, completed_at: new Date().toISOString(), result });
          console.log({ cycle: report.cycles.length, id: result.company_cycle_id });
        } else await sleep(1000);
      } catch (error) {
        report.errors.push({ at: new Date().toISOString(), reason: error.message });
        console.log({ stopped: error.message });
        break;
      }
    }
  } finally {
    await db.query("update company_operating_state set status='PAUSED',emergency_stop=false,reason='Milestone 1E bounded runner finished; manual review required' where company_key='operion'");
    report.final_state = (await db.query("select status,emergency_stop from company_operating_state where company_key='operion'")).rows[0];
    report.finished_at = new Date().toISOString();
    fs.mkdirSync(path.join(root, 'artifacts/milestone-1e'), { recursive: true });
    fs.writeFileSync(path.join(root, 'artifacts/milestone-1e/continuous-results.json'), JSON.stringify(report, null, 2));
    await db.end();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
