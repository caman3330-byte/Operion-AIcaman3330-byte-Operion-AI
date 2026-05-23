-- Operational tables for admin users, risk flags, funding pipeline, automation and email logs
-- Production-safe and re-runnable. This file must preserve existing records.

do $$
begin
  create type funding_pipeline_stage as enum ('intake','triage','underwriting','offer','funding','closed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type funding_pipeline_status as enum ('open','in_progress','on_hold','closed','cancelled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type risk_flag_severity as enum ('low','medium','high','critical');
exception
  when duplicate_object then null;
end $$;

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid null references auth.users(id) on delete set null,
  email text not null unique,
  full_name text null,
  role app_role not null default 'admin',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists risk_flags (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid null references leads(id) on delete cascade,
  business_application_id uuid null references business_applications(id) on delete cascade,
  flag_type text not null,
  severity risk_flag_severity not null default 'medium',
  details text null,
  source text null,
  created_by text null,
  created_at timestamptz not null default now()
);

create table if not exists funding_pipeline (
  id uuid primary key default gen_random_uuid(),
  business_application_id uuid not null references business_applications(id) on delete cascade,
  stage funding_pipeline_stage not null default 'intake',
  status funding_pipeline_status not null default 'open',
  assigned_to uuid null references auth.users(id) on delete set null,
  priority integer not null default 0,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists automation_logs (
  id uuid primary key default gen_random_uuid(),
  workflow_key text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'processed',
  error_message text null,
  attempts integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists email_logs (
  id uuid primary key default gen_random_uuid(),
  outreach_log_id uuid null references outreach_logs(id) on delete set null,
  provider text null,
  provider_message_id text null,
  from_email text null,
  to_email text null,
  subject text null,
  status text not null default 'queued',
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_users_email on admin_users(email);
create index if not exists idx_risk_flags_lead on risk_flags(lead_id, business_application_id, severity, created_at desc);
create index if not exists idx_funding_pipeline_app_stage_status on funding_pipeline(business_application_id, stage, status, priority, updated_at desc);
create index if not exists idx_automation_logs_workflow_created on automation_logs(workflow_key, created_at desc);
create index if not exists idx_email_logs_outreach_status on email_logs(outreach_log_id, status, created_at desc);

-- Triggers to maintain updated_at for funding_pipeline and admin_users

drop trigger if exists admin_users_set_updated_at on admin_users;
create trigger admin_users_set_updated_at
before update on admin_users
for each row execute function set_updated_at();

drop trigger if exists funding_pipeline_set_updated_at on funding_pipeline;
create trigger funding_pipeline_set_updated_at
before update on funding_pipeline
for each row execute function set_updated_at();

-- Enable RLS where appropriate
alter table admin_users enable row level security;
alter table risk_flags enable row level security;
alter table funding_pipeline enable row level security;
alter table automation_logs enable row level security;
alter table email_logs enable row level security;

-- Basic RLS: internal read, admins can manage admin_users

drop policy if exists "internal_read_operational" on admin_users;
create policy "internal_read_operational" on admin_users
for select to authenticated
using (public.is_internal_user());

drop policy if exists "admin_manage_self_or_internal" on admin_users;
create policy "admin_manage_self_or_internal" on admin_users
for all to authenticated
using (auth.uid() = auth.uid() or public.is_internal_user())
with check (auth.uid() = auth.uid() or public.is_internal_user());

drop policy if exists "internal_read_operational_flags" on risk_flags;
create policy "internal_read_operational_flags" on risk_flags
for select to authenticated
using (public.is_internal_user());

drop policy if exists "internal_manage_funding_pipeline" on funding_pipeline;
create policy "internal_manage_funding_pipeline" on funding_pipeline
for all to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "internal_read_automation_logs" on automation_logs;
create policy "internal_read_automation_logs" on automation_logs
for select to authenticated
using (public.is_internal_user());

drop policy if exists "internal_read_email_logs" on email_logs;
create policy "internal_read_email_logs" on email_logs
for select to authenticated
using (public.is_internal_user());

-- Done
