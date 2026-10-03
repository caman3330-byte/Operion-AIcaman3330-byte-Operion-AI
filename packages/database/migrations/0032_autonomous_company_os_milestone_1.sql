create table if not exists company_operating_state (
  company_key text primary key default 'operion',
  status text not null check (status in ('OPERATIONAL','PAUSED','DEGRADED','EMERGENCY_STOP')) default 'PAUSED',
  autonomy_level text not null default 'controlled_acquisition',
  reason text,
  updated_by text,
  updated_at timestamptz not null default now(),
  emergency_stop boolean not null default false,
  max_concurrent_tasks int not null default 3 check (max_concurrent_tasks >= 0),
  company_daily_ai_budget numeric(10,4) not null default 25 check (company_daily_ai_budget >= 0),
  company_daily_task_limit int not null default 50 check (company_daily_task_limit >= 0)
);

drop trigger if exists company_operating_state_set_updated_at on company_operating_state;
create trigger company_operating_state_set_updated_at
before update on company_operating_state
for each row execute function set_updated_at();

create table if not exists company_goals (
  id uuid primary key default gen_random_uuid(),
  goal_key text not null unique,
  title text not null,
  department_key text references agent_departments(department_key) on delete set null,
  target numeric not null check (target >= 0),
  current numeric not null default 0 check (current >= 0),
  remaining numeric generated always as (greatest(target - current, 0)) stored,
  progress_percentage numeric generated always as (
    case when target <= 0 then 0 else round(least(current / target, 1) * 100, 2) end
  ) stored,
  metric_source text not null,
  status text not null check (status in ('active','paused','complete','cancelled')) default 'active',
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

drop trigger if exists company_goals_set_updated_at on company_goals;
create trigger company_goals_set_updated_at
before update on company_goals
for each row execute function set_updated_at();

create table if not exists department_goals (
  id uuid primary key default gen_random_uuid(),
  goal_key text not null unique,
  department_key text not null references agent_departments(department_key) on delete cascade,
  title text not null,
  metrics jsonb not null default '{}'::jsonb,
  status text not null check (status in ('active','paused','complete','cancelled')) default 'active',
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists department_goals_set_updated_at on department_goals;
create trigger department_goals_set_updated_at
before update on department_goals
for each row execute function set_updated_at();

create table if not exists agent_runtime_state (
  agent_key text primary key references agent_definitions(agent_key) on delete cascade,
  status text not null check (status in ('OFFLINE','IDLE','WORKING','WAITING','BLOCKED','ERROR','PAUSED','REQUIRES_APPROVAL')) default 'OFFLINE',
  current_task_id uuid references agent_task_queue(id) on delete set null,
  last_task_id uuid references agent_task_queue(id) on delete set null,
  heartbeat_at timestamptz,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  tasks_completed int not null default 0 check (tasks_completed >= 0),
  tasks_failed int not null default 0 check (tasks_failed >= 0),
  success_rate numeric not null default 0 check (success_rate >= 0 and success_rate <= 1),
  average_latency_ms int not null default 0 check (average_latency_ms >= 0),
  tokens_used int not null default 0 check (tokens_used >= 0),
  estimated_cost numeric(10,6) not null default 0 check (estimated_cost >= 0),
  last_error text,
  current_provider text,
  current_model text,
  updated_at timestamptz not null default now()
);

drop trigger if exists agent_runtime_state_set_updated_at on agent_runtime_state;
create trigger agent_runtime_state_set_updated_at
before update on agent_runtime_state
for each row execute function set_updated_at();

create table if not exists agent_tool_registry (
  tool_key text primary key,
  name text not null,
  description text not null,
  input_schema jsonb not null default '{}'::jsonb,
  output_schema jsonb not null default '{}'::jsonb,
  risk_level text not null check (risk_level in ('LOW','MEDIUM','HIGH','CRITICAL')) default 'LOW',
  permission text not null check (permission in ('READ','PROPOSE','EXECUTE','APPROVAL_REQUIRED','DENIED')) default 'READ',
  enabled boolean not null default true,
  handler_ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists agent_tool_registry_set_updated_at on agent_tool_registry;
create trigger agent_tool_registry_set_updated_at
before update on agent_tool_registry
for each row execute function set_updated_at();

create table if not exists agent_tool_runs (
  id uuid primary key default gen_random_uuid(),
  tool_key text not null references agent_tool_registry(tool_key) on delete restrict,
  task_id uuid references agent_task_queue(id) on delete set null,
  agent_key text references agent_definitions(agent_key) on delete set null,
  permission_decision text not null check (permission_decision in ('READ','PROPOSE','EXECUTE','APPROVAL_REQUIRED','DENIED')),
  status text not null check (status in ('started','completed','failed','blocked')) default 'started',
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error_message text,
  latency_ms int,
  estimated_cost numeric(10,6) not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists agent_budget_windows (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('company','department','agent','task')),
  scope_key text not null,
  window_date date not null default current_date,
  budget_usd numeric(10,4) not null default 0 check (budget_usd >= 0),
  spent_usd numeric(10,6) not null default 0 check (spent_usd >= 0),
  tokens_used int not null default 0 check (tokens_used >= 0),
  tasks_started int not null default 0 check (tasks_started >= 0),
  tasks_completed int not null default 0 check (tasks_completed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, scope_key, window_date)
);

drop trigger if exists agent_budget_windows_set_updated_at on agent_budget_windows;
create trigger agent_budget_windows_set_updated_at
before update on agent_budget_windows
for each row execute function set_updated_at();

create table if not exists agent_events (
  event_id uuid primary key default gen_random_uuid(),
  event_type text not null,
  timestamp timestamptz not null default now(),
  actor_agent_id text references agent_definitions(agent_key) on delete set null,
  department text,
  task_id uuid references agent_task_queue(id) on delete set null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  severity text not null check (severity in ('INFO','WARN','ERROR','CRITICAL')) default 'INFO'
);

create table if not exists agent_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_type text not null,
  status text not null check (status in ('OPEN','ACKNOWLEDGED','RESOLVING','RESOLVED','ESCALATED')) default 'OPEN',
  severity text not null check (severity in ('INFO','WARN','ERROR','CRITICAL')) default 'WARN',
  title text not null,
  description text,
  actor_agent_id text references agent_definitions(agent_key) on delete set null,
  department text,
  task_id uuid references agent_task_queue(id) on delete set null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

drop trigger if exists agent_incidents_set_updated_at on agent_incidents;
create trigger agent_incidents_set_updated_at
before update on agent_incidents
for each row execute function set_updated_at();

create table if not exists agent_decision_logs (
  id uuid primary key default gen_random_uuid(),
  agent_key text references agent_definitions(agent_key) on delete set null,
  decision_type text not null,
  task_id uuid references agent_task_queue(id) on delete set null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  rationale text,
  created_at timestamptz not null default now()
);

alter table agent_task_queue
  add column if not exists max_runtime_ms int not null default 55000 check (max_runtime_ms > 0),
  add column if not exists max_retries int not null default 3 check (max_retries >= 0),
  add column if not exists retry_delay_seconds int not null default 300 check (retry_delay_seconds >= 0),
  add column if not exists budget_limit_usd numeric(10,6) not null default 0 check (budget_limit_usd >= 0),
  add column if not exists tool_permissions jsonb not null default '{}'::jsonb;

create index if not exists company_goals_status_idx on company_goals (status, goal_key);
create index if not exists department_goals_department_idx on department_goals (department_key, status);
create index if not exists agent_runtime_state_status_idx on agent_runtime_state (status, heartbeat_at desc);
create index if not exists agent_tool_runs_task_idx on agent_tool_runs (task_id, started_at desc);
create index if not exists agent_events_type_time_idx on agent_events (event_type, timestamp desc);
create index if not exists agent_events_task_idx on agent_events (task_id, timestamp desc);
create index if not exists agent_incidents_status_idx on agent_incidents (status, created_at desc);
create index if not exists agent_decision_logs_agent_idx on agent_decision_logs (agent_key, created_at desc);

alter table company_operating_state enable row level security;
alter table company_goals enable row level security;
alter table department_goals enable row level security;
alter table agent_runtime_state enable row level security;
alter table agent_tool_registry enable row level security;
alter table agent_tool_runs enable row level security;
alter table agent_budget_windows enable row level security;
alter table agent_events enable row level security;
alter table agent_incidents enable row level security;
alter table agent_decision_logs enable row level security;

insert into agent_departments (department_key, name, type, manager_agent_key, description, active)
values (
  'merchant_acquisition',
  'Merchant Acquisition',
  'operations',
  null,
  'Autonomously discovers, verifies, enriches, qualifies, and prepares merchant candidates for founder review.',
  true
)
on conflict (department_key) do update set
  name = excluded.name,
  description = excluded.description,
  active = true;

insert into agent_definitions (
  department_key, agent_key, name, role, manager_agent_key, purpose, owns, constraints, tools, escalation_triggers, status
)
values
  ('merchant_acquisition','acquisition_manager_agent','Acquisition Manager Agent','department_manager','operations_manager_agent','Plans and supervises merchant acquisition work toward the 500 verified merchant goal.','["source health","acquisition task planning","worker supervision","goal progress"]','["CRM import requires approval","No outreach","No lender actions","No underwriting"]','["READ_ACQUISITION_METRICS","READ_SOURCE_HEALTH","CREATE_TASK","SEND_MANAGER_MESSAGE"]','["source failure streak","goal progress stalled","worker stuck","approval needed"]','active'),
  ('merchant_acquisition','source_discovery_agent','Source Discovery Agent','specialist','acquisition_manager_agent','Finds potentially useful public merchant directories and stores candidates for approval.','["source candidates","source discovery runs"]','["Do not auto-approve random sources","No paid data sources in milestone 1"]','["WEB_SEARCH","READ_SOURCE_HEALTH","CREATE_TASK"]','["no candidate sources found","blocked discovery"]','active'),
  ('merchant_acquisition','source_scanner_agent','Source Scanner Agent','specialist','acquisition_manager_agent','Scans approved merchant acquisition sources using the existing scanner.','["approved source scans","source shards","source health"]','["Respect cooldowns, locks, limits, robots and time budgets","Do not import CRM leads"]','["SCAN_SOURCE","FETCH_SOURCE","EXTRACT_BUSINESS","CREATE_MERCHANT_CANDIDATE","UPDATE_CANDIDATE"]','["source blocked","scan timeout","repeated source failure"]','active'),
  ('merchant_acquisition','merchant_research_agent','Merchant Research Agent','specialist','acquisition_manager_agent','Verifies whether extracted businesses are real independent merchants.','["website enrichment","identity verification"]','["Use public website data only","No outreach"]','["VERIFY_WEBSITE","VERIFY_IDENTITY","UPDATE_CANDIDATE"]','["identity mismatch","website timeout"]','active'),
  ('merchant_acquisition','contact_verification_agent','Contact Verification Agent','specialist','acquisition_manager_agent','Verifies public business phone, email, and contact-page signals.','["phone verification","email extraction","contact pages"]','["No email sending","No private enrichment purchase"]','["VERIFY_PHONE","EXTRACT_EMAIL","UPDATE_CANDIDATE"]','["no usable contact path","contact verification failures"]','active'),
  ('merchant_acquisition','merchant_qualification_agent','Qualification Agent','specialist','acquisition_manager_agent','Scores merchant fit using existing validation and scoring rules.','["merchant scoring","qualification status"]','["No underwriting decisions","No lender matching"]','["SCORE_MERCHANT","UPDATE_CANDIDATE"]','["low score volume","scoring anomalies"]','active'),
  ('merchant_acquisition','deduplication_agent','Deduplication Agent','specialist','acquisition_manager_agent','Detects duplicates before candidate creation or import.','["candidate duplicate checks","lead duplicate checks"]','["Do not delete records automatically"]','["CHECK_DUPLICATE","UPDATE_CANDIDATE"]','["duplicate-heavy source","duplicate conflict"]','active'),
  ('merchant_acquisition','acquisition_monitor_agent','Acquisition Monitor Agent','specialist','acquisition_manager_agent','Monitors acquisition source and worker health.','["source health","incidents","worker state"]','["Escalate critical incidents","No mutating non-acquisition systems"]','["READ_SOURCE_HEALTH","READ_ACQUISITION_METRICS","SEND_MANAGER_MESSAGE"]','["worker stuck","budget exceeded","source degraded"]','active')
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

update agent_departments
set manager_agent_key = 'acquisition_manager_agent'
where department_key = 'merchant_acquisition';

insert into company_operating_state (
  company_key, status, autonomy_level, reason, updated_by, emergency_stop, max_concurrent_tasks, company_daily_ai_budget, company_daily_task_limit
)
values (
  'operion',
  'PAUSED',
  'controlled_acquisition',
  'Milestone 1 installed in safe local mode. Explicit founder/scheduler action required to operate.',
  'migration_0032',
  false,
  3,
  25,
  50
)
on conflict (company_key) do nothing;

insert into company_goals (goal_key, title, department_key, target, current, metric_source, status, metadata)
values (
  'verified_merchants_500',
  'Reach 500 verified merchant candidates.',
  'merchant_acquisition',
  500,
  0,
  'merchant_acquisition_candidates',
  'active',
  '{"review_policy":"founder_review_before_crm_import"}'::jsonb
)
on conflict (goal_key) do nothing;

insert into department_goals (goal_key, department_key, title, metrics, status)
values (
  'merchant_acquisition_efficiency',
  'merchant_acquisition',
  'Generate qualified verified merchant candidates efficiently while maintaining source quality.',
  '{}'::jsonb,
  'active'
)
on conflict (goal_key) do nothing;

insert into agent_runtime_state (agent_key, status)
select agent_key, 'IDLE'
from agent_definitions
where department_key = 'merchant_acquisition'
on conflict (agent_key) do nothing;

insert into agent_tool_registry (tool_key, name, description, input_schema, output_schema, risk_level, permission, enabled, handler_ref)
values
  ('WEB_SEARCH','Web Search','Find public merchant source candidates for founder review.','{}','{}','LOW','EXECUTE',true,'acquisition.source_discovery'),
  ('FETCH_SOURCE','Fetch Source','Fetch an approved public acquisition source.','{}','{}','LOW','EXECUTE',true,'acquisition.fetch_source'),
  ('SCAN_SOURCE','Scan Source','Scan approved acquisition sources using the existing source scanner.','{}','{}','MEDIUM','EXECUTE',true,'acquisition.scan_source'),
  ('EXTRACT_BUSINESS','Extract Business','Extract merchant records from approved source content.','{}','{}','MEDIUM','EXECUTE',true,'acquisition.extract_business'),
  ('VERIFY_WEBSITE','Verify Website','Verify business website and homepage signals.','{}','{}','LOW','EXECUTE',true,'acquisition.verify_website'),
  ('VERIFY_PHONE','Verify Phone','Verify public business phone signal.','{}','{}','LOW','EXECUTE',true,'acquisition.verify_phone'),
  ('EXTRACT_EMAIL','Extract Email','Extract public business email/contact signal.','{}','{}','LOW','EXECUTE',true,'acquisition.extract_email'),
  ('VERIFY_IDENTITY','Verify Identity','Check identity match between source and business website.','{}','{}','LOW','EXECUTE',true,'acquisition.verify_identity'),
  ('CHECK_DUPLICATE','Check Duplicate','Check candidate and CRM duplicate signals.','{}','{}','LOW','EXECUTE',true,'acquisition.check_duplicate'),
  ('SCORE_MERCHANT','Score Merchant','Score merchant fit with existing scoring rules.','{}','{}','LOW','EXECUTE',true,'acquisition.score_merchant'),
  ('CREATE_MERCHANT_CANDIDATE','Create Merchant Candidate','Create or upsert merchant candidate records.','{}','{}','MEDIUM','EXECUTE',true,'acquisition.create_candidate'),
  ('UPDATE_CANDIDATE','Update Candidate','Update merchant candidate enrichment or review-prep fields.','{}','{}','MEDIUM','EXECUTE',true,'acquisition.update_candidate'),
  ('CREATE_TASK','Create Task','Create bounded tasks in the existing agent task queue.','{}','{}','MEDIUM','EXECUTE',true,'orchestration.create_task'),
  ('SEND_MANAGER_MESSAGE','Send Manager Message','Persist manager/worker status messages.','{}','{}','LOW','EXECUTE',true,'orchestration.create_message'),
  ('READ_SOURCE_HEALTH','Read Source Health','Read acquisition source performance and health.','{}','{}','LOW','READ',true,'acquisition.read_source_health'),
  ('READ_ACQUISITION_METRICS','Read Acquisition Metrics','Read acquisition department metrics.','{}','{}','LOW','READ',true,'acquisition.read_metrics'),
  ('FOUNDER_REVIEW','Founder Review','Request founder review/approval.','{}','{}','HIGH','APPROVAL_REQUIRED',true,'approval.founder_review'),
  ('CRM_IMPORT','CRM Import','Import approved merchant candidate into CRM.','{}','{}','CRITICAL','APPROVAL_REQUIRED',true,'acquisition.crm_import'),
  ('SEND_EMAIL','Send Email','External sales or merchant outreach email.','{}','{}','CRITICAL','DENIED',false,'email.send'),
  ('LENDER_ACTION','Lender Action','Lender matching/submission/distribution action.','{}','{}','CRITICAL','DENIED',false,'lenders.action'),
  ('UNDERWRITING_DECISION','Underwriting Decision','Underwriting, credit, or funding decision.','{}','{}','CRITICAL','DENIED',false,'underwriting.decision')
on conflict (tool_key) do update set
  name = excluded.name,
  description = excluded.description,
  input_schema = excluded.input_schema,
  output_schema = excluded.output_schema,
  risk_level = excluded.risk_level,
  permission = excluded.permission,
  enabled = excluded.enabled,
  handler_ref = excluded.handler_ref;

insert into workflow_routes (
  workflow_key, name, trigger_type, department_key, primary_agent_key, fallback_agent_key, requires_approval, approval_policy, active
)
values (
  'merchant_acquisition_autonomous_loop',
  'Merchant Acquisition Autonomous Loop',
  'schedule_or_founder',
  'merchant_acquisition',
  'acquisition_manager_agent',
  'operations_manager_agent',
  false,
  '{"crm_import":"approval_required","email":"denied","lender_actions":"denied"}'::jsonb,
  true
)
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
