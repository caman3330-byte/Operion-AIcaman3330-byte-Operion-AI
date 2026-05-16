create extension if not exists pgcrypto;

do $$ begin
  create type lead_tier as enum ('A', 'B', 'C', 'D');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_status as enum (
    'raw',
    'enriched',
    'scored',
    'qualified',
    'nurture',
    'archived',
    'distributed',
    'pending_approval',
    'rejected_distribution',
    'blacklisted',
    'qualification_error'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type delivery_status as enum ('pending', 'delivered', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invoice_status as enum ('draft', 'sent', 'paid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type actor_type as enum ('system', 'founder', 'n8n_workflow');
exception when duplicate_object then null; end $$;

do $$ begin
  create type entity_type as enum ('lead', 'lender', 'distribution', 'prompt', 'outreach');
exception when duplicate_object then null; end $$;

do $$ begin
  create type alert_severity as enum ('INFO', 'WARN', 'CRITICAL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type api_service as enum ('anthropic', 'apollo', 'sendgrid', 'stripe');
exception when duplicate_object then null; end $$;

do $$ begin
  create type suppression_type as enum ('email', 'domain', 'business_name', 'apollo_id', 'phone');
exception when duplicate_object then null; end $$;

do $$ begin
  create type added_by as enum ('system', 'founder');
exception when duplicate_object then null; end $$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text,
  email text,
  phone text,
  industry text,
  state text,
  annual_revenue_est numeric,
  time_in_business_years numeric,
  apollo_id text unique,
  qualification_score int check (qualification_score between 0 and 100),
  tier lead_tier,
  status lead_status not null default 'raw',
  outreach_started boolean not null default false,
  outreach_paused boolean not null default false,
  blacklisted boolean not null default false,
  distribution_approved_at timestamptz,
  processing_error boolean not null default false,
  processing_error_detail text,
  distributed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists leads_set_updated_at on leads;
create trigger leads_set_updated_at
before update on leads
for each row execute function set_updated_at();

create table if not exists outreach_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  email_number int not null check (email_number in (1, 2, 3)),
  sent_at timestamptz,
  opened boolean not null default false,
  replied boolean not null default false,
  reply_snippet text,
  created_at timestamptz not null default now()
);

create table if not exists lenders (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_email text,
  webhook_url text,
  criteria_industries text[],
  criteria_min_revenue numeric,
  criteria_max_revenue numeric,
  price_per_lead numeric check (price_per_lead is null or price_per_lead >= 0),
  active boolean not null default true,
  whitelisted boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists lead_distributions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete restrict,
  distributed_at timestamptz,
  delivery_status delivery_status not null default 'pending',
  price numeric check (price is null or price >= 0),
  retry_count int not null default 0 check (retry_count >= 0),
  last_retry_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lead_id, lender_id)
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references lenders(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  lead_count int not null default 0 check (lead_count >= 0),
  total_amount numeric not null default 0 check (total_amount >= 0),
  stripe_invoice_id text,
  status invoice_status not null default 'draft',
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_type actor_type not null,
  actor_id text,
  entity_type entity_type not null,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create or replace function prevent_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

drop trigger if exists audit_log_no_update on audit_log;
create trigger audit_log_no_update
before update on audit_log
for each row execute function prevent_audit_log_mutation();

drop trigger if exists audit_log_no_delete on audit_log;
create trigger audit_log_no_delete
before delete on audit_log
for each row execute function prevent_audit_log_mutation();

create table if not exists prompt_versions (
  id uuid primary key default gen_random_uuid(),
  version_number int generated by default as identity unique,
  label text,
  system_prompt text not null,
  user_prompt_template text not null,
  scoring_weights jsonb,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text,
  notes text
);

create unique index if not exists prompt_versions_one_active_idx
on prompt_versions ((active))
where active;

create table if not exists prompt_test_results (
  id uuid primary key default gen_random_uuid(),
  prompt_version_id uuid not null references prompt_versions(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  score_produced int check (score_produced between 0 and 100),
  tier_produced lead_tier,
  reason_produced text,
  latency_ms int check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now()
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  severity alert_severity not null,
  alert_type text not null,
  message text not null,
  context jsonb,
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists api_usage_log (
  id uuid primary key default gen_random_uuid(),
  service api_service not null,
  operation text,
  lead_id uuid references leads(id) on delete set null,
  input_tokens int check (input_tokens is null or input_tokens >= 0),
  output_tokens int check (output_tokens is null or output_tokens >= 0),
  estimated_cost_usd decimal(10, 6) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  success boolean,
  latency_ms int check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now()
);

create table if not exists suppression_list (
  id uuid primary key default gen_random_uuid(),
  type suppression_type not null,
  value text not null,
  reason text,
  added_by added_by not null,
  created_at timestamptz not null default now()
);

create unique index if not exists suppression_list_type_value_idx
on suppression_list (type, lower(value));

create unique index if not exists suppression_list_type_value_raw_idx
on suppression_list (type, value);

create index if not exists leads_status_created_at_idx on leads (status, created_at desc);
create index if not exists leads_tier_idx on leads (tier) where tier is not null;
create index if not exists leads_email_lower_idx on leads (lower(email)) where email is not null;
create index if not exists leads_pending_approval_idx on leads (created_at desc) where status = 'pending_approval';
create index if not exists outreach_history_lead_created_idx on outreach_history (lead_id, created_at desc);
create index if not exists lenders_active_idx on lenders (active, whitelisted);
create index if not exists lead_distributions_status_idx on lead_distributions (delivery_status, created_at desc);
create index if not exists invoices_lender_period_idx on invoices (lender_id, period_start, period_end);
create index if not exists audit_log_created_idx on audit_log (created_at desc);
create index if not exists audit_log_entity_idx on audit_log (entity_type, entity_id, created_at desc);
create index if not exists audit_log_event_idx on audit_log (event_type, created_at desc);
create index if not exists prompt_test_results_prompt_idx on prompt_test_results (prompt_version_id, created_at desc);
create index if not exists alerts_unresolved_idx on alerts (severity, created_at desc) where resolved = false and deleted_at is null;
create index if not exists api_usage_service_created_idx on api_usage_log (service, created_at desc);
create index if not exists api_usage_lead_idx on api_usage_log (lead_id) where lead_id is not null;

create or replace view lead_cost_summary as
select lead_id, sum(estimated_cost_usd) as total_cost
from api_usage_log
where lead_id is not null
group by lead_id;

create or replace function activate_prompt_version(target_prompt_version_id uuid, actor text default null)
returns prompt_versions
language plpgsql
security definer
as $$
declare
  activated prompt_versions;
  previous_active jsonb;
begin
  select to_jsonb(p.*)
  into previous_active
  from prompt_versions p
  where p.active = true
  limit 1;

  update prompt_versions
  set active = false
  where active = true;

  update prompt_versions
  set active = true
  where id = target_prompt_version_id
  returning * into activated;

  if activated.id is null then
    raise exception 'Prompt version not found: %', target_prompt_version_id;
  end if;

  insert into audit_log (
    event_type,
    actor_type,
    actor_id,
    entity_type,
    entity_id,
    before_state,
    after_state,
    metadata
  )
  values (
    'prompt_version_activated',
    'founder',
    actor,
    'prompt',
    activated.id,
    previous_active,
    to_jsonb(activated.*),
    jsonb_build_object('source', 'activate_prompt_version')
  );

  return activated;
end;
$$;

alter table leads enable row level security;
alter table outreach_history enable row level security;
alter table lenders enable row level security;
alter table lead_distributions enable row level security;
alter table invoices enable row level security;
alter table audit_log enable row level security;
alter table prompt_versions enable row level security;
alter table prompt_test_results enable row level security;
alter table alerts enable row level security;
alter table api_usage_log enable row level security;
alter table suppression_list enable row level security;

-- RLS is intentionally deny-by-default. Server-side Next.js API routes use
-- SUPABASE_SERVICE_ROLE_KEY. Add direct client policies only when multi-user
-- access is introduced.
