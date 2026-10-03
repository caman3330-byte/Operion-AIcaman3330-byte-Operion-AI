const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const root = path.resolve(__dirname, '..');
const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
const safety = require('../apps/dashboard/environment-safety.cjs');
safety.assertEnvironment({ ...process.env, ...env }, 'test');
const expected = safety.databaseTarget(env.SUPABASE_DB_URL);
Object.assign(process.env, env);
for (const key of Object.keys(process.env)) if (/OPENAI_API_KEY|ANTHROPIC_API_KEY|NVIDIA_API_KEY|SENDGRID_API_KEY|N8N.*URL/.test(key)) delete process.env[key];
const ts = require('typescript');
const Module = require('node:module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, 'apps/dashboard', name.slice(2)) : name, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, filename);
const report = process.argv.includes('--recovery-only') ? JSON.parse(fs.readFileSync(path.join(root,'artifacts/durable-autonomy/test-results.json'),'utf8')) : { project: expected, checks: {}, cycles: [] };
(async () => {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: expected === 'local' ? false : {rejectUnauthorized:false} });
  await db.connect();
  try {
    if (process.argv.includes('--apply')) {
      console.log({ modifying_hostname: target.hostname, project_ref: expected, matches_confirmed_test: true });
      const exists = (await db.query("select to_regclass('public.company_cycles') as name")).rows[0].name;
      if (!exists) {
        await db.query('begin');
        try { await db.query(fs.readFileSync(path.join(root,'packages/database/migrations/0034_durable_company_cycles.sql'),'utf8')); await db.query('commit'); }
        catch(error) { await db.query('rollback'); throw error; }
      }
    }
    const { runAutonomousAcquisitionCycle } = require('../apps/dashboard/lib/autonomous-company/acquisition-loop.ts');
    for (const status of ['PAUSED','EMERGENCY_STOP']) {
      await db.query("update company_operating_state set status=$1, emergency_stop=$2 where company_key='operion'", [status,status==='EMERGENCY_STOP']);
      const before = (await db.query('select count(*)::int n from agent_tool_runs')).rows[0].n;
      let blocked = false;
      try { await runAutonomousAcquisitionCycle({requestedBy:'durable-test',taskLimit:1,workerLimit:1}); } catch { blocked = true; }
      const after = (await db.query('select count(*)::int n from agent_tool_runs')).rows[0].n;
      report.checks[status] = blocked && before===after;
    }
    await db.query("update company_operating_state set status='OPERATIONAL', emergency_stop=false where company_key='operion'");
    for (let index=0; index<(process.argv.includes('--recovery-only') ? 0 : 3); index++) {
      const result = await runAutonomousAcquisitionCycle({requestedBy:'durable-test',taskLimit:1,workerLimit:1});
      report.cycles.push({status:result.status,id:result.company_cycle_id ?? null, tasks:result.tasks_created?.length ?? 0,
        processed:result.worker_result?.processed ?? [], evaluations:result.learning_result?.source_evaluations?.length ?? 0});
      console.log({cycle:index+1,...report.cycles.at(-1)});
      if (result.status!=='completed') break;
    }
    const token=randomUUID();
    const cycle=(await db.query('select * from claim_company_cycle($1)',[token])).rows[0];
    if (cycle) {
      const other=(await db.query('select * from claim_company_cycle($1)',[randomUUID()])).rows;
      report.checks.concurrent_cycle_blocked=other.length===0;
      const taskId=randomUUID();
      await db.query(`insert into agent_task_queue(id,company_cycle_id,cycle_task_key,assigned_agent_key,department_key,workflow_key,title,instructions,cost_estimate_usd,budget_limit_usd,context)
        values($1,$2,'recovery-test','acquisition_monitor_agent','merchant_acquisition','merchant_acquisition_monitor','TEST process recovery','Read real TEST acquisition metrics',0,0,'{}')`,[taskId,cycle.id]);
      const child = require('node:child_process').spawnSync(process.execPath,['-e',`const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}});await c.connect();await c.query('select * from claim_company_task($1,$2)',[process.env.RECOVERY_TASK_ID,process.env.RECOVERY_TOKEN]);process.exit(77)})().catch(()=>process.exit(1))`],
        {cwd:root,env:{...process.env,RECOVERY_TASK_ID:taskId,RECOVERY_TOKEN:token},timeout:30000});
      report.checks.process_interrupted_after_claim=child.status===77;
      await db.query("update company_cycles set lease_until=now()-interval '1 second' where id=$1",[cycle.id]);
      await db.query("update agent_task_queue set execution_lease_until=now()-interval '1 second' where id=$1",[taskId]);
      const replacement=randomUUID();
      const resumed=(await db.query('select * from claim_company_cycle($1)',[replacement])).rows[0];
      report.checks.durable_cycle_reclaimed=resumed?.id===cycle.id;
      const {runWorkerTick}=require('../apps/dashboard/lib/agent-runtime/worker-runtime.ts');
      await runWorkerTick({workerId:'restarted-test-process',companyCycleId:cycle.id,cycleToken:replacement,limit:1});
      const recovered=(await db.query('select status,execution_attempts from agent_task_queue where id=$1',[taskId])).rows[0];
      report.checks.process_recovery_completed=recovered.status==='completed' && recovered.execution_attempts===2;
      report.checks.recovery_tool_runs=Number((await db.query('select count(*) n from agent_tool_runs where task_id=$1',[taskId])).rows[0].n);
      try { await db.query("select * from checkpoint_company_cycle($1,$2,'PLAN','{}')",[cycle.id,token]); report.checks.stale_cycle_fenced=false; }
      catch { report.checks.stale_cycle_fenced=true; }
      await db.query("select * from checkpoint_company_cycle($1,$2,'TEST_LEASE_VALIDATION','{}','completed')",[cycle.id,replacement]);
    }
    const {buildAutonomousCommandCenterSnapshot}=require('../apps/dashboard/lib/autonomous-company/command-center.ts');
    const snapshot=await buildAutonomousCommandCenterSnapshot();
    report.checks.command_center_reads_cycles=snapshot.durable_runtime.recent_cycles.length>0;
    report.evidence=(await db.query("select id,sequence,status,phase,attempts from company_cycles order by sequence desc limit 8")).rows;
  } finally {
    await db.query("update company_operating_state set status='PAUSED',emergency_stop=false,reason='Durable autonomy TEST validation finished; awaiting review' where company_key='operion'");
    report.final_state='PAUSED';
    fs.mkdirSync(path.join(root,'artifacts/durable-autonomy'),{recursive:true});
    fs.writeFileSync(path.join(root,'artifacts/durable-autonomy/test-results.json'),JSON.stringify(report,null,2));
    await db.end();
  }
  console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1});
