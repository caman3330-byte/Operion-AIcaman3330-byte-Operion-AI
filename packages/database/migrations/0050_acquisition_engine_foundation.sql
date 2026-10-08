-- OPERION ACQUISITION ENGINE FOUNDATION
-- Adds business status tracking, daily campaigns, test isolation, and enrichment metadata

-- 1. Add business operating status tracking to acquisition_prospects
alter table if exists public.acquisition_prospects add column if not exists business_status text default 'unknown' check(business_status in ('active', 'possibly_active', 'closed', 'not_found', 'unable_to_verify', 'unknown'));
alter table if exists public.acquisition_prospects add column if not exists business_status_source text;
alter table if exists public.acquisition_prospects add column if not exists business_status_checked_at timestamp with time zone;
alter table if exists public.acquisition_prospects add column if not exists business_status_confidence numeric(3,2);

-- 2. Add contact enrichment tracking
alter table if exists public.acquisition_prospects add column if not exists email_found_at timestamp with time zone;
alter table if exists public.acquisition_prospects add column if not exists phone_found_at timestamp with time zone;
alter table if exists public.acquisition_prospects add column if not exists website_url text;
alter table if exists public.acquisition_prospects add column if not exists owner_name text;
alter table if exists public.acquisition_prospects add column if not exists owner_email text;

-- 3. Add test fixture marker for automatic cleanup
alter table if exists public.acquisition_prospects add column if not exists test_run_id text;
alter table if exists public.acquisition_prospects add column if not exists is_fixture boolean default false;

-- 4. Add daily acquisition campaign tracking
create table if not exists public.acquisition_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,

  -- Configuration
  search_query text not null,
  city text,
  state text,
  radius_km integer,
  provider text not null, -- 'google_places', 'apollo', etc.

  -- Targets
  daily_target integer default 0,
  enabled boolean default true,

  -- Tracking
  last_executed_at timestamp with time zone,
  businesses_found_today integer default 0,
  new_unique_today integer default 0,
  duplicates_found_today integer default 0,
  errors_today integer default 0,
  error_message text,

  -- Audit
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  created_by uuid references auth.users(id),

  constraint unique_campaign_config unique(provider, search_query, city, state)
);

create index if not exists idx_acquisition_campaigns_enabled on public.acquisition_campaigns(enabled);
create index if not exists idx_acquisition_campaigns_last_executed on public.acquisition_campaigns(last_executed_at desc);

-- 5. Track daily acquisition runs
create table if not exists public.acquisition_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.acquisition_campaigns(id) on delete cascade,

  -- Execution
  run_date date not null,
  started_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,

  -- Results
  total_results integer default 0,
  duplicates_found integer default 0,
  new_unique integer default 0,
  research_pending integer default 0,
  research_complete integer default 0,
  email_found integer default 0,
  phone_found integer default 0,
  email_and_phone integer default 0,
  lead_eligible integer default 0,
  email_ready integer default 0,

  -- Errors
  errors integer default 0,
  error_log text,

  created_at timestamp with time zone default now() not null,
  constraint unique_run_per_day unique(campaign_id, run_date)
);

create index if not exists idx_acquisition_runs_date on public.acquisition_runs(run_date);
create index if not exists idx_acquisition_runs_campaign on public.acquisition_runs(campaign_id);

-- 6. Track manual upload runs
create table if not exists public.manual_upload_runs (
  id uuid primary key default gen_random_uuid(),

  -- Upload
  filename text not null,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamp with time zone default now() not null,

  -- Results
  total_rows integer default 0,
  valid_rows integer default 0,
  invalid_rows integer default 0,
  duplicates_found integer default 0,
  new_unique integer default 0,

  -- Processing
  research_pending integer default 0,
  research_complete integer default 0,
  email_found integer default 0,
  phone_found integer default 0,
  email_and_phone integer default 0,
  lead_eligible integer default 0,
  email_ready integer default 0,

  -- Errors
  errors integer default 0,
  error_log text,

  completed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create index if not exists idx_manual_upload_runs_date on public.manual_upload_runs(uploaded_at desc);

-- 7. Enhance leads table with operating status and enrichment source
alter table if exists public.leads add column if not exists business_status text default 'unknown';
alter table if exists public.leads add column if not exists business_status_source text;
alter table if exists public.leads add column if not exists website_url text;
alter table if exists public.leads add column if not exists owner_name text;

-- 8. Add cost tracking for acquisition providers
create table if not exists public.acquisition_provider_costs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  date date not null,
  api_calls integer default 0,
  results_returned integer default 0,
  cost_usd numeric(10,4) default 0,
  created_at timestamp with time zone default now() not null,
  constraint unique_provider_day unique(provider, date)
);

create index if not exists idx_provider_costs_date on public.acquisition_provider_costs(date desc);

-- Update triggers for timestamp fields
create or replace function update_acquisition_campaigns_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_acquisition_campaigns_timestamp on public.acquisition_campaigns;
create trigger update_acquisition_campaigns_timestamp
before update on public.acquisition_campaigns
for each row
execute function update_acquisition_campaigns_timestamp();
