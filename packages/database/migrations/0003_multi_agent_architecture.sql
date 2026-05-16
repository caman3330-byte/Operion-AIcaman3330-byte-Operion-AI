create table if not exists agent_departments (
  id uuid primary key default gen_random_uuid(),
  department_key text not null unique,
  name text not null,
  type text not null check (type in (
    'executive','operations','sales','marketing','support','success','finance','compliance','analytics'
  )),
  manager_agent_key text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists agent_departments_set_updated_at on agent_departments;
create trigger agent_departments_set_updated_at
before update on agent_departments
for each row execute function set_updated_at();

create table if not exists agent_definitions (
  id uuid primary key default gen_random_uuid(),
  department_key text references agent_departments(department_key) on delete restrict,
  agent_key text not null unique,
  name text not null,
  role text not null check (role in ('executive_manager','department_manager','specialist')),
  manager_agent_key text,
  purpose text not null,
  owns jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  tools jsonb not null default '[]'::jsonb,
  escalation_triggers jsonb not null default '[]'::jsonb,
  status text not null check (status in ('active','paused','disabled')) default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists agent_definitions_set_updated_at on agent_definitions;
create trigger agent_definitions_set_updated_at
before update on agent_definitions
for each row execute function set_updated_at();

alter table agent_departments
  drop constraint if exists agent_departments_manager_agent_key_fkey;

alter table agent_departments
  add constraint agent_departments_manager_agent_key_fkey
  foreign key (manager_agent_key) references agent_definitions(agent_key)
  deferrable initially deferred;

alter table agent_definitions
  drop constraint if exists agent_definitions_manager_agent_key_fkey;

alter table agent_definitions
  add constraint agent_definitions_manager_agent_key_fkey
  foreign key (manager_agent_key) references agent_definitions(agent_key)
  deferrable initially deferred;

create table if not exists agent_task_queue (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references manager_agent_runs(id) on delete set null,
  workflow_key text,
  parent_task_id uuid references agent_task_queue(id) on delete set null,
  assigned_agent_key text not null references agent_definitions(agent_key) on delete restrict,
  department_key text not null references agent_departments(department_key) on delete restrict,
  title text not null,
  instructions text not null,
  context jsonb,
  priority text not null check (priority in ('low','medium','high','urgent')) default 'medium',
  status text not null check (status in ('queued','assigned','running','blocked','completed','failed','cancelled')) default 'queued',
  requires_approval boolean not null default false,
  approval_id uuid,
  result_summary text,
  error_message text,
  cost_estimate_usd numeric(10,6),
  due_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

drop trigger if exists agent_task_queue_set_updated_at on agent_task_queue;
create trigger agent_task_queue_set_updated_at
before update on agent_task_queue
for each row execute function set_updated_at();

create table if not exists agent_messages (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references agent_task_queue(id) on delete set null,
  from_agent_key text not null references agent_definitions(agent_key) on delete restrict,
  to_agent_key text not null references agent_definitions(agent_key) on delete restrict,
  message_type text not null check (message_type in ('handoff','status_update','question','answer','escalation','summary')),
  subject text not null,
  body text not null,
  context jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists agent_memory (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global','department','agent','workflow','entity')),
  scope_key text not null,
  memory_key text not null,
  memory_value jsonb not null,
  source_task_id uuid references agent_task_queue(id) on delete set null,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, scope_key, memory_key)
);

drop trigger if exists agent_memory_set_updated_at on agent_memory;
create trigger agent_memory_set_updated_at
before update on agent_memory
for each row execute function set_updated_at();

create table if not exists agent_shared_context (
  id uuid primary key default gen_random_uuid(),
  context_key text not null unique,
  entity_type text,
  entity_id uuid,
  payload jsonb not null,
  created_by_agent_key text references agent_definitions(agent_key) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists agent_shared_context_set_updated_at on agent_shared_context;
create trigger agent_shared_context_set_updated_at
before update on agent_shared_context
for each row execute function set_updated_at();

create table if not exists workflow_routes (
  id uuid primary key default gen_random_uuid(),
  workflow_key text not null unique,
  name text not null,
  trigger_type text not null,
  department_key text not null references agent_departments(department_key) on delete restrict,
  primary_agent_key text not null references agent_definitions(agent_key) on delete restrict,
  fallback_agent_key text references agent_definitions(agent_key) on delete set null,
  requires_approval boolean not null default false,
  approval_policy jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists workflow_routes_set_updated_at on workflow_routes;
create trigger workflow_routes_set_updated_at
before update on workflow_routes
for each row execute function set_updated_at();

create table if not exists agent_approval_requests (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references agent_task_queue(id) on delete set null,
  approval_type text not null,
  requested_by_agent_key text not null references agent_definitions(agent_key) on delete restrict,
  assigned_to text,
  title text not null,
  details jsonb not null,
  status text not null check (status in ('pending','approved','rejected','expired')) default 'pending',
  decision_reason text,
  decided_by text,
  decided_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists agent_approval_requests_set_updated_at on agent_approval_requests;
create trigger agent_approval_requests_set_updated_at
before update on agent_approval_requests
for each row execute function set_updated_at();

alter table agent_task_queue
  drop constraint if exists agent_task_queue_approval_id_fkey;

alter table agent_task_queue
  add constraint agent_task_queue_approval_id_fkey
  foreign key (approval_id) references agent_approval_requests(id)
  on delete set null
  deferrable initially deferred;

create table if not exists agent_performance_metrics (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_definitions(agent_key) on delete cascade,
  department_key text not null references agent_departments(department_key) on delete cascade,
  metric_date date not null,
  tasks_completed int not null default 0 check (tasks_completed >= 0),
  tasks_failed int not null default 0 check (tasks_failed >= 0),
  avg_latency_ms int check (avg_latency_ms is null or avg_latency_ms >= 0),
  estimated_cost_usd numeric(10,6) not null default 0 check (estimated_cost_usd >= 0),
  success_rate numeric check (success_rate is null or (success_rate >= 0 and success_rate <= 1)),
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (agent_key, metric_date)
);

create table if not exists executive_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('daily','weekly','incident','manual')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  summary text not null,
  kpis jsonb not null default '{}'::jsonb,
  department_summaries jsonb not null default '{}'::jsonb,
  alerts jsonb not null default '[]'::jsonb,
  approvals_required jsonb not null default '[]'::jsonb,
  ai_activity_summary jsonb not null default '{}'::jsonb,
  generated_by_agent_key text references agent_definitions(agent_key) on delete set null,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index if not exists agent_definitions_department_idx on agent_definitions (department_key, status);
create index if not exists agent_task_queue_status_priority_idx on agent_task_queue (status, priority, created_at);
create index if not exists agent_task_queue_agent_idx on agent_task_queue (assigned_agent_key, status, created_at desc);
create index if not exists agent_task_queue_workflow_idx on agent_task_queue (workflow_key, created_at desc);
create index if not exists agent_messages_task_idx on agent_messages (task_id, created_at);
create index if not exists agent_messages_to_agent_idx on agent_messages (to_agent_key, read_at, created_at desc);
create index if not exists agent_memory_scope_idx on agent_memory (scope, scope_key);
create index if not exists agent_shared_context_entity_idx on agent_shared_context (entity_type, entity_id);
create index if not exists workflow_routes_active_idx on workflow_routes (workflow_key, active);
create index if not exists agent_approval_requests_status_idx on agent_approval_requests (status, created_at desc);
create index if not exists executive_reports_period_idx on executive_reports (report_type, period_start desc);

alter table agent_departments enable row level security;
alter table agent_definitions enable row level security;
alter table agent_task_queue enable row level security;
alter table agent_messages enable row level security;
alter table agent_memory enable row level security;
alter table agent_shared_context enable row level security;
alter table workflow_routes enable row level security;
alter table agent_approval_requests enable row level security;
alter table agent_performance_metrics enable row level security;
alter table executive_reports enable row level security;

insert into agent_departments (department_key, name, type, manager_agent_key, description)
values
  ('executive', 'Executive', 'executive', null, 'Supervises all departments and produces founder-facing summaries.'),
  ('operations', 'Operations', 'operations', null, 'Owns lead, outreach, underwriting, risk, analytics, and reporting operations.'),
  ('sales', 'Sales', 'sales', null, 'Owns lender relationships and revenue-facing sales workflows.'),
  ('marketing', 'Marketing', 'marketing', null, 'Owns growth campaigns, social, content, and SEO.'),
  ('support', 'Support', 'support', null, 'Owns inbound support and issue triage.'),
  ('success', 'Client Success', 'success', null, 'Owns client onboarding, retention, and satisfaction.'),
  ('finance', 'Finance', 'finance', null, 'Owns invoices, revenue metrics, and accounting controls.'),
  ('compliance', 'Compliance', 'compliance', null, 'Owns compliance review, audit posture, and policy adherence.'),
  ('analytics', 'Analytics', 'analytics', null, 'Owns conversion, performance, and operating intelligence.')
on conflict (department_key) do update set
  name = excluded.name,
  type = excluded.type,
  description = excluded.description,
  active = true;

insert into agent_definitions (
  department_key,
  agent_key,
  name,
  role,
  manager_agent_key,
  purpose,
  owns,
  constraints,
  tools,
  escalation_triggers,
  status
)
values
  ('executive','executive_manager_agent','Executive Manager Agent','executive_manager',null,'Supervises department managers and prepares founder-only summaries, KPIs, alerts, and approvals.','["department performance","executive reports","approval prioritization"]','["Never exposes raw internal chain-of-thought","Founder receives summaries, alerts, KPIs, and approvals only"]','["audit_log","executive_reports","agent_performance_metrics"]','["critical alert","approval overdue","department failure"]','active'),
  ('operations','operations_manager_agent','Operations Manager Agent','department_manager','executive_manager_agent','Supervises operational specialists across lead intake, outreach, underwriting, risk, analytics, and reporting.','["operations task queue","workflow routing","operational escalations"]','["Escalates founder approvals","Does not bypass distribution approval"]','["agent_task_queue","workflow_routes","alerts"]','["workflow failure","SLA breach","high-risk lead"]','active'),
  ('operations','lead_generation_agent','Lead Generation Agent','specialist','operations_manager_agent','Owns lead intake, enrichment readiness, source quality, and deduplication routing.','["lead intake","lead enrichment","suppression checks"]','["No paid enrichment before dedup gate","No distribution decisions"]','["leads","suppression_list","apollo"]','["duplicate risk","zero lead intake","enrichment failure"]','active'),
  ('operations','outreach_agent','Outreach Agent','specialist','operations_manager_agent','Owns outreach campaigns, SendGrid sequence health, follow-up automation, and reply monitoring.','["outreach campaigns","follow-up automation","sendgrid health"]','["Honors suppression list","No autonomous custom copy in MVP unless approved"]','["outreach_history","sendgrid","alerts"]','["bounce spike","reply requiring human review","suppression hit"]','active'),
  ('operations','underwriting_agent','Underwriting Agent','specialist','operations_manager_agent','Owns funding-readiness review, qualification rationale, and lender-fit underwriting notes.','["underwriting review","qualification notes","funding fit"]','["Does not approve distribution","Flags incomplete financial profile"]','["leads","prompt_versions","lead_distributions"]','["missing revenue","low confidence score","manual review required"]','active'),
  ('operations','risk_fraud_agent','Risk/Fraud Agent','specialist','operations_manager_agent','Owns fraud signals, blacklist recommendations, suppression expansion, and risky lead escalation.','["fraud checks","risk scoring","blacklist recommendations"]','["Requires founder approval to blacklist non-obvious cases","Preserves audit evidence"]','["suppression_list","audit_log","alerts"]','["fraud signal","domain mismatch","repeated lead"]','active'),
  ('analytics','analytics_agent','Analytics Agent','department_manager','executive_manager_agent','Owns conversion analytics, lead quality metrics, lender performance, and operating intelligence.','["lead conversion analytics","lender analytics","AI performance metrics"]','["Reports uncertainty when data is sparse","No revenue recognition without invoice data"]','["api_usage_log","lead_distributions","agent_performance_metrics"]','["conversion drop","cost spike","lender underperformance"]','active'),
  ('operations','reporting_agent','Reporting Agent','specialist','operations_manager_agent','Owns reporting automation and founder-ready operational summaries.','["daily reports","AI activity summaries","operational summaries"]','["Founder receives concise summaries","Facts must map to system records"]','["executive_reports","audit_log","alerts"]','["missing report","critical alert","approval backlog"]','active'),
  ('sales','sales_agent','Sales Agent','department_manager','executive_manager_agent','Owns lender pipeline, sales opportunities, pricing feedback, and revenue expansion tasks.','["lender pipeline","sales tasks","pricing feedback"]','["No contract commitments without founder approval","Uses approved pricing policy"]','["lenders","invoices","executive_reports"]','["lender churn risk","pricing exception","large opportunity"]','active'),
  ('marketing','marketing_agent','Marketing Agent','department_manager','executive_manager_agent','Owns growth positioning, acquisition campaigns, and marketing task routing.','["campaign planning","growth channels","brand positioning"]','["No public claims beyond approved language","No ad spend without approval"]','["executive_reports","workflow_routes"]','["campaign anomaly","spend request","brand risk"]','active'),
  ('support','customer_support_agent','Customer Support Agent','department_manager','executive_manager_agent','Owns inbound support triage, issue classification, and escalation routing.','["support issues","inbound triage","issue resolution"]','["No legal or financial advice","Escalates sensitive account issues"]','["alerts","agent_messages"]','["angry customer","legal concern","data request"]','active'),
  ('success','client_success_agent','Client Success Agent','department_manager','executive_manager_agent','Owns lender/client onboarding health, relationship follow-ups, and retention signals.','["client onboarding","success check-ins","retention risks"]','["No pricing concessions without approval","Logs client-sensitive events"]','["lenders","executive_reports","agent_messages"]','["client risk","onboarding blocker","renewal concern"]','active'),
  ('marketing','social_media_agent','Social Media Agent','specialist','marketing_agent','Owns social content queues, engagement monitoring, and founder-approved posting plans.','["social media calendar","engagement monitoring"]','["No autonomous posting in MVP","Uses approved brand voice"]','["agent_task_queue","agent_approval_requests"]','["brand risk","approval needed","negative engagement"]','active'),
  ('marketing','content_seo_agent','Content/SEO Agent','specialist','marketing_agent','Owns content briefs, SEO topics, organic acquisition assets, and publishing recommendations.','["content briefs","SEO topics","organic performance"]','["No publish without approval","Avoids unsupported financial claims"]','["executive_reports","agent_task_queue"]','["compliance-sensitive content","approval needed","ranking drop"]','active'),
  ('finance','finance_accounting_agent','Finance & Accounting Agent','department_manager','executive_manager_agent','Owns invoices, revenue metrics, cost tracking, and accounting summaries.','["invoices","revenue metrics","cost controls"]','["No payment collection changes without approval","Uses Stripe records as source of truth"]','["invoices","stripe","api_usage_log"]','["budget threshold","invoice anomaly","payment failure"]','active'),
  ('compliance','compliance_agent','Compliance Agent','department_manager','executive_manager_agent','Owns compliance checks, audit readiness, role-based access posture, and policy exceptions.','["compliance review","audit posture","policy exceptions"]','["Escalates regulated or legal questions","Maintains append-only audit posture"]','["audit_log","agent_approval_requests","alerts"]','["policy exception","data access concern","audit gap"]','active')
on conflict (agent_key) do update set
  department_key = excluded.department_key,
  name = excluded.name,
  role = excluded.role,
  manager_agent_key = excluded.manager_agent_key,
  purpose = excluded.purpose,
  owns = excluded.owns,
  constraints = excluded.constraints,
  tools = excluded.tools,
  escalation_triggers = excluded.escalation_triggers,
  status = excluded.status;

update agent_departments set manager_agent_key = manager_map.manager_agent_key
from (
  values
    ('executive', 'executive_manager_agent'),
    ('operations', 'operations_manager_agent'),
    ('sales', 'sales_agent'),
    ('marketing', 'marketing_agent'),
    ('support', 'customer_support_agent'),
    ('success', 'client_success_agent'),
    ('finance', 'finance_accounting_agent'),
    ('compliance', 'compliance_agent'),
    ('analytics', 'analytics_agent')
) as manager_map(department_key, manager_agent_key)
where agent_departments.department_key = manager_map.department_key;

insert into workflow_routes (
  workflow_key,
  name,
  trigger_type,
  department_key,
  primary_agent_key,
  fallback_agent_key,
  requires_approval,
  approval_policy,
  active
)
values
  ('lead_intake','Lead Intake','api_or_n8n','operations','lead_generation_agent','operations_manager_agent',false,'{}'::jsonb,true),
  ('lead_enrichment','Lead Enrichment','n8n','operations','lead_generation_agent','operations_manager_agent',false,'{"dedup_required":true}'::jsonb,true),
  ('lead_qualification','Lead Qualification','api_or_n8n','operations','underwriting_agent','operations_manager_agent',false,'{}'::jsonb,true),
  ('lender_matching','Lender Matching','api_or_n8n','operations','underwriting_agent','operations_manager_agent',true,'{"approval_type":"distribution_approval"}'::jsonb,true),
  ('outreach_campaign','Outreach Campaign','n8n','operations','outreach_agent','operations_manager_agent',false,'{"suppression_check_required":true}'::jsonb,true),
  ('follow_up_automation','Follow-up Automation','n8n','operations','outreach_agent','operations_manager_agent',false,'{}'::jsonb,true),
  ('underwriting_review','Underwriting Review','manual_or_api','operations','underwriting_agent','operations_manager_agent',true,'{"approval_type":"underwriting_exception"}'::jsonb,true),
  ('fraud_risk_check','Fraud/Risk Check','api_or_n8n','operations','risk_fraud_agent','operations_manager_agent',true,'{"approval_type":"blacklist_or_risk_override"}'::jsonb,true),
  ('reporting_automation','Reporting Automation','schedule','operations','reporting_agent','operations_manager_agent',false,'{}'::jsonb,true),
  ('escalation_workflow','Escalation Workflow','system','executive','executive_manager_agent','operations_manager_agent',true,'{"approval_type":"founder_escalation"}'::jsonb,true)
on conflict (workflow_key) do update set
  name = excluded.name,
  trigger_type = excluded.trigger_type,
  department_key = excluded.department_key,
  primary_agent_key = excluded.primary_agent_key,
  fallback_agent_key = excluded.fallback_agent_key,
  requires_approval = excluded.requires_approval,
  approval_policy = excluded.approval_policy,
  active = excluded.active;

-- RLS remains deny-by-default. Server-side API routes use SUPABASE_SERVICE_ROLE_KEY.
