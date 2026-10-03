const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.resolve(__dirname,'../packages/database/migrations/0040_transactional_acquisition_submission.sql'),'utf8');
for(const value of ['for update','if s.application_id is not null and s.lead_id is not null','insert into business_applications','insert into leads','update acquisition_application_sessions','update acquisition_prospects','revoke all','grant execute']) assert.match(sql,new RegExp(value,'i'));
assert.match(sql,/language plpgsql security definer/i); assert.match(sql,/return query select s\.application_id,s\.lead_id,true/i);
console.log('transactional acquisition submission migration tests passed');
