#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function readEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};
  return fs.readFileSync(envPath, 'utf8').split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return acc;
    const [k, ...v] = trimmed.split('=');
    if (!k) return acc;
    acc[k] = v.join('=');
    return acc;
  }, {});
}

const env = readEnv(path.join(__dirname, '../apps/dashboard/.env.local'));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE credentials in apps/dashboard/.env.local');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${serviceKey}`,
  apikey: serviceKey,
  Prefer: 'return=representation'
};

async function insert(table, payload) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Insert ${table} failed: ${res.status} ${txt}`);
  return JSON.parse(txt);
}

async function run() {
  console.log('Seeding sample lenders...');
  const lenders = await insert('lenders', [
    { company_name: 'Acme Funding', contact_email: 'sales@acmefunding.com' },
    { company_name: 'Blue Capital', contact_email: 'ops@bluecap.com' }
  ]);

  console.log('Seeding sample leads...');
  const leadsPayload = [];
  for (let i = 1; i <= 6; i++) {
    leadsPayload.push({
      business_name: `Test Business ${i}`,
      contact_name: `Owner ${i}`,
      email: `owner${i}@example.com`,
      phone: `+1555000${100 + i}`,
      industry: 'retail',
      state: 'CA'
    });
  }
  const leads = await insert('leads', leadsPayload);

  console.log('Seeding AI tasks, CRM activities and notifications...');
  for (const lead of leads) {
    await insert('ai_tasks', [{ task_type: 'lead_qualification', lead_id: lead.id, input_payload: {}, result_payload: {} }]);
    await insert('crm_activities', [{ lead_id: lead.id, activity_type: 'note', subject: 'Imported lead', body: 'Seeded for testing' }]);
    await insert('notifications', [{ title: 'Welcome', message: `Lead ${lead.business_name} created`, channel: 'in_app' }]);
  }

  console.log('Seeding done.');
}

run().catch((err) => {
  console.error('Seeding failed:', err.message || err);
  process.exit(1);
});
