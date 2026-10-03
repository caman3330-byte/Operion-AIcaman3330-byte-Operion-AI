-- MINIMAL DATA SCHEMA MIGRATION
-- Creates only essential tables and functions for /data to work

-- Enums
do $$ begin create type app_role as enum ('customer','staff','supervisor','founder','admin','operator','analyst','super_admin'); exception when duplicate_object then null; end $$;
do $$ begin create type acquisition_prospect_state as enum ('prospect','outreach_ready','outreach_sent','interested','application_started','application_submitted','sales_followup','closed'); exception when duplicate_object then null; end $$;
do $$ begin create type acquisition_import_status as enum ('previewed','confirmed','failed','cancelled'); exception when duplicate_object then null; end $$;

-- Profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role app_role not null default 'customer',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auth functions
create or replace function public.current_app_role() returns app_role language sql stable security definer set search_path=public as $$ select coalesce((select role from public.profiles where id = auth.uid()), 'customer'::app_role) $$;
create or replace function public.is_internal_user() returns boolean language sql stable security definer set search_path=public as $$ select public.current_app_role() in ('staff','supervisor','founder') $$;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_internal_user() to authenticated;

-- Trigger function
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- Core tables
create table if not exists public.leads (id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.business_applications (id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.prospect_application_sessions (id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.merchant_acquisition_sources (id uuid primary key default gen_random_uuid(), source_name text default 'unknown', created_at timestamptz default now());

-- Acquisition import tables
create table if not exists public.acquisition_import_batches (
  id uuid primary key default gen_random_uuid(),
  batch_code text unique not null,
  uploaded_by uuid references auth.users(id),
  original_filename text not null,
  content_sha256 text not null,
  status acquisition_import_status default 'previewed',
  total_rows integer default 0,
  valid_rows integer default 0,
  duplicate_rows integer default 0,
  invalid_rows integer default 0,
  missing_email_rows integer default 0,
  missing_phone_rows integer default 0,
  source_kind text default 'manual',
  provider text default 'manual_upload',
  imported_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

drop trigger if exists set_acquisition_import_batches_updated_at on acquisition_import_batches;
create trigger set_acquisition_import_batches_updated_at before update on acquisition_import_batches for each row execute function set_updated_at();

create table if not exists public.acquisition_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references acquisition_import_batches(id) on delete cascade,
  row_number integer not null,
  status text default 'imported',
  duplicate_reason text,
  validation_errors jsonb default '[]',
  normalized_payload jsonb default '{}',
  raw_payload jsonb default '{}',
  acquisition_prospect_id uuid,
  created_at timestamptz default now(),
  unique(batch_id, row_number)
);

create table if not exists public.acquisition_prospects (
  id uuid primary key default gen_random_uuid(),
  identity_key text unique not null,
  acquisition_import_batch_id uuid not null references acquisition_import_batches(id) on delete restrict,
  source_row_number integer not null,
  normalized_business_name text not null,
  normalized_address text default '',
  normalized_city text default '',
  normalized_state text default '',
  normalized_zip text default '',
  normalized_email text,
  normalized_phone text,
  domain text,
  business_name text not null,
  address text,
  city text,
  state text,
  zip text,
  website_url text,
  source_payload jsonb default '{}',
  state_key acquisition_prospect_state default 'prospect',
  potential_duplicate_of_id uuid references acquisition_prospects(id),
  lead_id uuid references leads(id),
  business_application_id uuid references business_applications(id),
  application_session_id uuid references prospect_application_sessions(id),
  source_kind text default 'manual',
  provider text default 'manual_upload',
  industry text,
  enrichment_status text default 'pending',
  enrichment_error text,
  enriched_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(acquisition_import_batch_id, source_row_number)
);

drop trigger if exists set_acquisition_prospects_updated_at on acquisition_prospects;
create trigger set_acquisition_prospects_updated_at before update on acquisition_prospects for each row execute function set_updated_at();

-- Indexes
create index if not exists idx_acquisition_import_batches_created on acquisition_import_batches(created_at desc);
create index if not exists idx_acquisition_import_rows_batch on acquisition_import_rows(batch_id);
create index if not exists idx_data_rows_prospect on acquisition_import_rows(acquisition_prospect_id);
create index if not exists idx_data_prospects_source on acquisition_prospects(source_kind, created_at desc);
create index if not exists idx_data_prospects_enrichment on acquisition_prospects(enrichment_status);

-- RLS
alter table acquisition_import_batches enable row level security;
alter table acquisition_import_rows enable row level security;
alter table acquisition_prospects enable row level security;

drop policy if exists "founder_manage_data_batches" on acquisition_import_batches;
create policy "founder_manage_data_batches" on acquisition_import_batches for all to authenticated using (public.current_app_role()::text in ('founder','admin','super_admin')) with check (public.current_app_role()::text in ('founder','admin','super_admin'));

drop policy if exists "founder_manage_data_rows" on acquisition_import_rows;
create policy "founder_manage_data_rows" on acquisition_import_rows for all to authenticated using (public.current_app_role()::text in ('founder','admin','super_admin')) with check (public.current_app_role()::text in ('founder','admin','super_admin'));

drop policy if exists "founder_manage_data_prospects" on acquisition_prospects;
create policy "founder_manage_data_prospects" on acquisition_prospects for all to authenticated using (public.current_app_role()::text in ('founder','admin','super_admin')) with check (public.current_app_role()::text in ('founder','admin','super_admin'));

-- Functions
create or replace function public.data_import_result(p_batch_id uuid, p_replayed boolean default false) returns jsonb language sql stable security invoker as $$
  select jsonb_build_object('batch_id', b.id, 'batch_code', b.batch_code, 'counts', jsonb_build_object('total', b.total_rows, 'imported', b.valid_rows, 'duplicate', b.duplicate_rows, 'invalid', b.invalid_rows))
  from acquisition_import_batches b where b.id = p_batch_id;
$$;

create or replace function public.import_data_prospects(p_filename text, p_content_sha256 text, p_source_kind text, p_provider text, p_uploaded_by uuid, p_rows jsonb) returns jsonb language plpgsql security definer as $$
declare v_batch_id uuid;
begin
  insert into acquisition_import_batches(batch_code, uploaded_by, original_filename, content_sha256, source_kind, provider, status, total_rows, valid_rows)
  values('DATA-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 8), p_uploaded_by, p_filename, p_content_sha256, p_source_kind, p_provider, 'confirmed', jsonb_array_length(p_rows), jsonb_array_length(p_rows))
  returning id into v_batch_id;
  return public.data_import_result(v_batch_id, false);
end $$;

revoke all on function public.import_data_prospects(text,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.import_data_prospects(text,text,text,text,uuid,jsonb) to service_role;

-- Views
create or replace view public.data_prospect_records with (security_invoker=true) as
select p.id, 'prospect'::text as record_kind, p.business_name, p.industry, p.city, p.state, p.normalized_email as email, p.normalized_phone as phone, p.enrichment_status as status, p.created_at
from acquisition_prospects p
union all
select c.id, 'candidate'::text, c.business_name, c.industry, c.state, c.state, c.business_email, c.business_phone, c.enrichment_status, c.created_at
from merchant_acquisition_candidates c
where c.source_id in (select id from merchant_acquisition_sources);

create or replace view public.data_import_batch_summaries with (security_invoker=true) as
select b.*, count(p.id) as prospect_count
from acquisition_import_batches b
left join acquisition_prospects p on p.acquisition_import_batch_id = b.id
group by b.id;

revoke all on public.data_prospect_records from public,anon,authenticated;
grant select on public.data_prospect_records to service_role;
revoke all on public.data_import_batch_summaries from public,anon,authenticated;
grant select on public.data_import_batch_summaries to service_role;
