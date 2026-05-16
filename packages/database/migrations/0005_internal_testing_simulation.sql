-- Operion AI MVP v1 - Autonomous internal testing, simulation, diagnostics, and production readiness

create type simulation_run_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
create type simulation_mode as enum ('standard', 'stress', 'replay');
create type simulation_lead_status as enum ('generated', 'ingested', 'enriched', 'qualified', 'approval_routed', 'matched', 'outreach_prepared', 'failed');
create type acquisition_provider_status as enum ('enabled', 'disabled', 'degraded', 'not_configured');
create type workflow_trace_status as enum ('started', 'completed', 'failed', 'skipped', 'retried');
create type diagnostic_health_status as enum ('healthy', 'degraded', 'critical', 'unknown');

alter type entity_type add value if not exists 'simulation';
alter type entity_type add value if not exists 'diagnostics';

alter table leads add column if not exists is_test_data boolean not null default false;
alter table leads add column if not exists simulation_run_id uuid null;
create index if not exists idx_leads_test_data on leads(is_test_data, created_at desc);
create index if not exists idx_leads_simulation_run_id on leads(simulation_run_id) where simulation_run_id is not null;

alter table lead_enrichment add column if not exists is_test_data boolean not null default false;
alter table business_contacts add column if not exists is_test_data boolean not null default false;
alter table acquisition_jobs add column if not exists is_test_data boolean not null default false;
alter table outreach_campaigns add column if not exists is_test_data boolean not null default false;
alter table outreach_email_queue add column if not exists is_test_data boolean not null default false;
alter table outreach_replies add column if not exists is_test_data boolean not null default false;

create table if not exists simulation_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  name text not null,
  mode simulation_mode not null default 'standard',
  status simulation_run_status not null default 'queued',
  batch_size integer not null check (batch_size in (10, 100, 1000, 10000)),
  industries text[] not null default '{}',
  config jsonb not null default '{}'::jsonb,
  counts jsonb not null default '{}'::jsonb,
  requested_by text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists simulation_leads (
  id uuid primary key default gen_random_uuid(),
  simulation_run_id uuid not null references simulation_runs(id) on delete cascade,
  lead_id uuid null references leads(id) on delete set null,
  generated_index integer not null,
  business_name text not null,
  owner_name text not null,
  email text not null,
  phone text not null,
  industry text not null,
  revenue_estimate numeric(14, 2) not null,
  funding_need numeric(14, 2) not null,
  risk_profile text not null check (risk_profile in ('low', 'medium', 'high', 'watchlist')),
  source_payload jsonb not null default '{}'::jsonb,
  pipeline_stage text not null default 'generated',
  status simulation_lead_status not null default 'generated',
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (simulation_run_id, generated_index)
);

create table if not exists acquisition_providers (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null unique,
  display_name text not null,
  source_type lead_source_type not null,
  enabled boolean not null default false,
  status acquisition_provider_status not null default 'not_configured',
  capabilities text[] not null default '{}',
  config jsonb not null default '{}'::jsonb,
  failure_count integer not null default 0,
  last_latency_ms integer null,
  last_error text null,
  last_checked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workflow_execution_traces (
  id uuid primary key default gen_random_uuid(),
  simulation_run_id uuid null references simulation_runs(id) on delete cascade,
  workflow_key text not null,
  step_key text not null,
  entity_type text null,
  entity_id uuid null,
  status workflow_trace_status not null,
  attempt integer not null default 1,
  latency_ms integer null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error_message text null,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists worker_control_state (
  control_key text primary key,
  workers_paused boolean not null default false,
  stress_mode_enabled boolean not null default false,
  reason text null,
  updated_by text null,
  updated_at timestamptz not null default now()
);

create table if not exists diagnostic_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_type text not null,
  health_status diagnostic_health_status not null default 'unknown',
  metrics jsonb not null default '{}'::jsonb,
  bottlenecks jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists production_readiness_reports (
  id uuid primary key default gen_random_uuid(),
  simulation_run_id uuid null references simulation_runs(id) on delete set null,
  status diagnostic_health_status not null default 'unknown',
  stable_systems jsonb not null default '[]'::jsonb,
  unstable_systems jsonb not null default '[]'::jsonb,
  scaling_bottlenecks jsonb not null default '[]'::jsonb,
  required_integrations jsonb not null default '[]'::jsonb,
  next_recommended_phase text not null,
  report_body text not null,
  created_by text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_simulation_runs_status on simulation_runs(status, created_at desc);
create index if not exists idx_simulation_leads_run_status on simulation_leads(simulation_run_id, status);
create index if not exists idx_simulation_leads_lead_id on simulation_leads(lead_id) where lead_id is not null;
create index if not exists idx_acquisition_providers_enabled on acquisition_providers(enabled, status);
create index if not exists idx_workflow_traces_run on workflow_execution_traces(simulation_run_id, created_at desc);
create index if not exists idx_workflow_traces_step_status on workflow_execution_traces(workflow_key, step_key, status);
create index if not exists idx_diagnostic_snapshots_created on diagnostic_snapshots(created_at desc);
create index if not exists idx_readiness_reports_created on production_readiness_reports(created_at desc);

drop trigger if exists simulation_runs_set_updated_at on simulation_runs;
create trigger simulation_runs_set_updated_at
before update on simulation_runs
for each row execute function set_updated_at();

drop trigger if exists simulation_leads_set_updated_at on simulation_leads;
create trigger simulation_leads_set_updated_at
before update on simulation_leads
for each row execute function set_updated_at();

drop trigger if exists acquisition_providers_set_updated_at on acquisition_providers;
create trigger acquisition_providers_set_updated_at
before update on acquisition_providers
for each row execute function set_updated_at();

insert into worker_control_state (control_key, workers_paused, stress_mode_enabled, reason)
values ('global', false, false, 'Default internal testing control state')
on conflict (control_key) do nothing;

insert into acquisition_providers (provider_key, display_name, source_type, enabled, status, capabilities, config)
values
  ('simulation', 'Internal Simulation Provider', 'api', true, 'enabled', array['lead_generation', 'stress_testing', 'replay'], '{"mode":"internal"}'::jsonb),
  ('apollo', 'Apollo Provider', 'apollo', false, 'not_configured', array['business_discovery', 'contact_enrichment'], '{}'::jsonb),
  ('google_maps', 'Google Maps Provider', 'google_maps', false, 'not_configured', array['business_discovery', 'local_business_search'], '{}'::jsonb),
  ('website_scraper', 'Website Scraper Provider', 'website', false, 'not_configured', array['contact_extraction', 'website_metadata'], '{}'::jsonb),
  ('business_directory', 'Business Directory Provider', 'directory', false, 'not_configured', array['business_discovery', 'directory_ingestion'], '{}'::jsonb),
  ('csv_ingestion', 'CSV Ingestion Provider', 'manual_upload', true, 'enabled', array['batch_ingestion', 'normalization'], '{}'::jsonb),
  ('api_ingestion', 'API Ingestion Provider', 'api', true, 'enabled', array['batch_ingestion', 'webhook_ingestion'], '{}'::jsonb)
on conflict (provider_key) do update set
  display_name = excluded.display_name,
  source_type = excluded.source_type,
  capabilities = excluded.capabilities,
  updated_at = now();

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
  (
    'operations',
    'simulation_agent',
    'Simulation Agent',
    'specialist',
    'operations_manager_agent',
    'Generates internal test leads, runs simulated workflows, validates outputs, and records execution traces.',
    '["simulation_runs","simulation_leads","workflow_execution_traces"]'::jsonb,
    '["Never mix simulation traffic with production traffic","Mark all generated records as test data"]'::jsonb,
    '["lead_generator","pipeline_simulator","trace_writer","diagnostics"]'::jsonb,
    '["simulation_failure","pipeline_validation_failed","stress_test_bottleneck"]'::jsonb,
    'active'
  ),
  (
    'operations',
    'diagnostics_agent',
    'Diagnostics Agent',
    'specialist',
    'operations_manager_agent',
    'Monitors worker health, queue health, provider status, latency, failures, bottlenecks, and readiness reports.',
    '["diagnostic_snapshots","production_readiness_reports","worker_control_state"]'::jsonb,
    '["Report unstable systems without suppressing launch blockers","Do not mutate production workflow data"]'::jsonb,
    '["diagnostics","readiness_reporting","audit_log"]'::jsonb,
    '["critical_health_status","provider_degraded","retry_backlog_growth"]'::jsonb,
    'active'
  )
on conflict (agent_key) do update set
  purpose = excluded.purpose,
  owns = excluded.owns,
  constraints = excluded.constraints,
  tools = excluded.tools,
  escalation_triggers = excluded.escalation_triggers,
  status = excluded.status,
  updated_at = now();

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
  ('internal_simulation_run', 'Internal Simulation Run', 'manual', 'operations', 'simulation_agent', 'operations_manager_agent', false, '{"test_only":true}'::jsonb, true),
  ('diagnostics_snapshot', 'Diagnostics Snapshot', 'scheduled', 'operations', 'diagnostics_agent', 'operations_manager_agent', false, '{"test_only":true}'::jsonb, true),
  ('production_readiness_report', 'Production Readiness Report', 'manual', 'operations', 'diagnostics_agent', 'operations_manager_agent', true, '{"founder_review":true}'::jsonb, true)
on conflict (workflow_key) do update set
  name = excluded.name,
  primary_agent_key = excluded.primary_agent_key,
  fallback_agent_key = excluded.fallback_agent_key,
  approval_policy = excluded.approval_policy,
  active = excluded.active,
  updated_at = now();

alter table simulation_runs enable row level security;
alter table simulation_leads enable row level security;
alter table acquisition_providers enable row level security;
alter table workflow_execution_traces enable row level security;
alter table worker_control_state enable row level security;
alter table diagnostic_snapshots enable row level security;
alter table production_readiness_reports enable row level security;
