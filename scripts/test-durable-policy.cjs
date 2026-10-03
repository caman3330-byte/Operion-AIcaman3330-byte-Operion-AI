const fs=require('node:fs');
const {parseEnv}=require('node:util');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
(async()=>{
  const env=parseEnv(fs.readFileSync('.env.local','utf8'));
  const safety=require('../apps/dashboard/environment-safety.cjs');
  safety.assertEnvironment({...process.env,...env},'test');
  const db=new Client({connectionString:env.SUPABASE_DB_URL,ssl:safety.databaseTarget(env.SUPABASE_DB_URL)==='local'?false:{rejectUnauthorized:false}});
  await db.connect();
  const results={};
  try {
    await db.query('begin');
    await db.query("update company_operating_state set status='OPERATIONAL',emergency_stop=false,company_daily_task_limit=0 where company_key='operion'");
    const token=randomUUID();
    const cycle=(await db.query('select * from claim_company_cycle($1)',[token])).rows[0];
    if(!cycle) throw Error('Another cycle is active');
    const task=randomUUID();
    await db.query(`insert into agent_task_queue(id,company_cycle_id,cycle_task_key,assigned_agent_key,department_key,workflow_key,title,instructions,cost_estimate_usd,budget_limit_usd)
      values($1,$2,'policy-test','acquisition_monitor_agent','merchant_acquisition','merchant_acquisition_monitor','Policy validation','Read metrics',0,0)`,[task,cycle.id]);
    await db.query('savepoint budget_test');
    try{await db.query('select * from claim_company_task($1,$2)',[task,token]);results.zero_task_budget_blocks=false;}
    catch(error){results.zero_task_budget_blocks=/Budget exceeded/.test(error.message);await db.query('rollback to budget_test');}
    await db.query("update agent_task_queue set requires_approval=true where id=$1",[task]);
    await db.query('savepoint approval_test');
    try{await db.query('select * from claim_company_task($1,$2)',[task,token]);results.approval_task_denied=false;}
    catch(error){results.approval_task_denied=/policy denied/.test(error.message);await db.query('rollback to approval_test');}
  } finally {await db.query('rollback');await db.end();}
  fs.writeFileSync('artifacts/durable-autonomy/policy-results.json',JSON.stringify(results,null,2));
  console.log(results);
  if(Object.values(results).some(value=>!value)) process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1});
