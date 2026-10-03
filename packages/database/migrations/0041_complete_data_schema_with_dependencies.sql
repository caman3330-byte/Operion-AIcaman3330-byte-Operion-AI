-- ============================================================================
-- COMPLETE DATA SCHEMA WITH ALL DEPENDENCIES
-- Self-contained migration for blank staging database
-- Includes: 0008 auth infrastructure + 0036-0040 acquisition + 0041 data schema
-- ============================================================================

-- ============================================================================
-- PART 1: FOUNDATIONAL TYPES AND ENUMS (from 0008)
-- ============================================================================

do $$ begin
  create type app_role as enum ('customer', 'staff', 'supervisor', 'founder', 'admin', 'operator', 'analyst', 'super_admin');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type business_application_status as enum (
    'draft', 'submitted', 'ai_review', 'qualified', 'reviewing', 'submitted_to_lender',
    'approved', 'funded', 'rejected', 'withdrawn'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type entity_type as enum ('lead', 'business_application', 'merchant_acquisition_source', 'merchant_acquisition_candidate');
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- PART 2: FOUNDATIONAL TABLES (from 0008, 0004, 0020, etc.)
-- ============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  phone text,
  role app_role not null default 'customer',
  company_name text,
  title text,
  avatar_url text,
  company_visibility text default 'self_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles(role);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.business_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prospect_application_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.merchant_acquisition_sources (
  id uuid primary key default gen_random_uuid(),
  source_name text not null default 'unknown',
  created_at timestamptz not null default now()
);

create table if not exists public.merchant_acquisition_candidates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.merchant_acquisition_sources(id) on delete cascade,
  business_name text not null,
  industry text,
  state text,
  business_phone text,
  source_phone text,
  business_email text,
  website_url text,
  raw_payload jsonb default '{}',
  enrichment_status text default 'completed',
  rejection_reason text,
  identity_match boolean default false,
  website_verified boolean default false,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- PART 3: TRIGGER FUNCTION (from 0008)
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================================
-- PART 4: AUTH FUNCTIONS (from 0008)
-- ============================================================================

create or replace function public.current_app_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'customer'::app_role)
$$;

create or replace function public.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('staff', 'supervisor', 'founder')
$$;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_internal_user() to authenticated;

-- ============================================================================
-- PART 5: ACQUISITION INFRASTRUCTURE (from 0036-0040)
-- ============================================================================

do $$ begin
  create type acquisition_import_status as enum ('previewed', 'confirmed', 'failed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.acquisition_import_batches (
  id uuid primary key default gen_random_uuid(),
  batch_code text not null unique,
  source_id uuid references lead_sources(id) on delete set null,
  uploaded_by uuid references auth.users(id) on delete set null,
  original_filename text not null,
  content_sha256 text not null,
  status acquisition_import_status not null default 'previewed',
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  missing_email_rows integer not null default 0 check (missing_email_rows >= 0),
  missing_phone_rows integer not null default 0 check (missing_phone_rows >= 0),
  source_kind text not null default 'manual' check (source_kind in ('manual','ai')),
  provider text not null default 'manual_upload',
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_acquisition_import_batches_updated_at on acquisition_import_batches;
create trigger set_acquisition_import_batches_updated_at
before update on acquisition_import_batches for each row execute function set_updated_at();

create table if not exists public.acquisition_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references acquisition_import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  status text not null check (status in ('valid', 'duplicate', 'invalid', 'imported')),
  duplicate_reason text,
  validation_errors jsonb not null default '[]'::jsonb,
  normalized_payload jsonb not null,
  lead_id uuid references leads(id) on delete set null,
  acquisition_prospect_id uuid,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(batch_id, row_number)
);

do $$ begin
  create type acquisition_prospect_state as enum (
    'prospect', 'outreach_ready', 'outreach_sent', 'interested',
    'application_started', 'application_submitted', 'sales_followup', 'closed'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.acquisition_prospects (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null unique,
  acquisition_import_batch_id uuid not null references acquisition_import_batches(id) on delete restrict,
  source_row_number integer not null check (source_row_number > 0),
  normalized_business_name text not null,
  normalized_address text not null default '',
  normalized_city text not null default '',
  normalized_state text not null default '',
  normalized_zip text not null default '',
  normalized_email text,
  normalized_phone text,
  domain text,
  business_name text not null,
  address text,
  city text,
  state text,
  zip text,
  website_url text,
  source_payload jsonb not null default '{}'::jsonb,
  state_key acquisition_prospect_state not null default 'prospect',
  potential_duplicate_of_id uuid references acquisition_prospects(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  business_application_id uuid references business_applications(id) on delete set null,
  application_session_id uuid references prospect_application_sessions(id) on delete set null,
  source_kind text not null default 'manual' check (source_kind in ('manual','ai')),
  provider text not null default 'manual_upload',
  industry text,
  enrichment_status text not null default 'pending' check (enrichment_status in ('pending','enriching','enriched','no_match','failed')),
  enrichment_error text,
  enriched_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (acquisition_import_batch_id, source_row_number)
);

drop trigger if exists set_acquisition_prospects_updated_at on acquisition_prospects;
create trigger set_acquisition_prospects_updated_at
before update on acquisition_prospects for each row execute function set_updated_at();

-- ============================================================================
-- PART 6: INDEXES
-- ============================================================================

create index if not exists idx_acquisition_import_batches_status_created on acquisition_import_batches(status, created_at desc);
create index if not exists idx_acquisition_import_batches_created on acquisition_import_batches(created_at desc);
create index if not exists idx_acquisition_import_batches_uploaded on acquisition_import_batches(uploaded_by, created_at desc);
create index if not exists idx_data_batches_content on acquisition_import_batches(source_kind,provider,content_sha256);

create index if not exists idx_acquisition_import_rows_batch_status on acquisition_import_rows(batch_id, status, row_number);
create index if not exists idx_acquisition_import_rows_batch on acquisition_import_rows(batch_id, created_at);
create index if not exists idx_acquisition_import_rows_status on acquisition_import_rows(batch_id, status);
create index if not exists idx_data_rows_prospect on acquisition_import_rows(acquisition_prospect_id,created_at);

create index if not exists idx_leads_acquisition_import_batch on leads(acquisition_import_batch_id);
alter table leads add column if not exists acquisition_import_batch_id uuid references acquisition_import_batches(id) on delete set null;

create unique index if not exists idx_acquisition_prospects_lead_unique on acquisition_prospects(lead_id) where lead_id is not null;
create unique index if not exists idx_acquisition_prospects_application_unique on acquisition_prospects(business_application_id) where business_application_id is not null;
create index if not exists idx_acquisition_prospects_state_created on acquisition_prospects(state_key, created_at desc);
create index if not exists idx_acquisition_prospects_contact_signals on acquisition_prospects(normalized_email, normalized_phone);
create index if not exists idx_data_prospects_source_created on acquisition_prospects(source_kind, created_at desc, id);
create index if not exists idx_data_prospects_enrichment on acquisition_prospects(enrichment_status, created_at);

-- ============================================================================
-- PART 7: ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.business_applications enable row level security;
alter table public.prospect_application_sessions enable row level security;
alter table public.merchant_acquisition_sources enable row level security;
alter table public.merchant_acquisition_candidates enable row level security;
alter table public.acquisition_import_batches enable row level security;
alter table public.acquisition_import_rows enable row level security;
alter table public.acquisition_prospects enable row level security;

-- RLS Policies for founder/admin access to DATA tables
drop policy if exists "founder_manage_data_batches" on public.acquisition_import_batches;
create policy "founder_manage_data_batches" on public.acquisition_import_batches for all to authenticated
  using (public.current_app_role()::text in ('founder','admin','super_admin'))
  with check (public.current_app_role()::text in ('founder','admin','super_admin'));

drop policy if exists "founder_manage_data_rows" on public.acquisition_import_rows;
create policy "founder_manage_data_rows" on public.acquisition_import_rows for all to authenticated
  using (public.current_app_role()::text in ('founder','admin','super_admin'))
  with check (public.current_app_role()::text in ('founder','admin','super_admin'));

drop policy if exists "founder_manage_data_prospects" on public.acquisition_prospects;
create policy "founder_manage_data_prospects" on public.acquisition_prospects for all to authenticated
  using (public.current_app_role()::text in ('founder','admin','super_admin'))
  with check (public.current_app_role()::text in ('founder','admin','super_admin'));

-- Legacy policies for internal user access
drop policy if exists "internal_manage_acquisition_import_batches" on public.acquisition_import_batches;
create policy "internal_manage_acquisition_import_batches" on public.acquisition_import_batches for all to authenticated
  using (public.is_internal_user())
  with check (public.is_internal_user());

drop policy if exists "internal_manage_acquisition_import_rows" on public.acquisition_import_rows;
create policy "internal_manage_acquisition_import_rows" on public.acquisition_import_rows for all to authenticated
  using (public.is_internal_user())
  with check (public.is_internal_user());

drop policy if exists "internal_manage_acquisition_prospects" on public.acquisition_prospects;
create policy "internal_manage_acquisition_prospects" on public.acquisition_prospects for all to authenticated
  using (public.is_internal_user())
  with check (public.is_internal_user());

-- ============================================================================
-- PART 8: DATA IMPORT FUNCTIONS
-- ============================================================================

create or replace function public.data_import_result(p_batch_id uuid, p_replayed boolean default false)
returns jsonb language sql stable security invoker set search_path=public as $$
  select jsonb_build_object(
    'batch_id', b.id, 'batch_code', b.batch_code, 'replayed', p_replayed,
    'counts', jsonb_build_object('total',b.total_rows,'imported',b.valid_rows,'duplicate',b.duplicate_rows,
      'invalid',b.invalid_rows,'missing_email',b.missing_email_rows,'missing_phone',b.missing_phone_rows),
    'enrichment', jsonb_build_object(
      'ready',(select count(*) from acquisition_prospects p where p.acquisition_import_batch_id=b.id and p.enrichment_status='pending'),
      'enriched',(select count(*) from acquisition_prospects p where p.acquisition_import_batch_id=b.id and p.enrichment_status='enriched'),
      'failed',(select count(*) from acquisition_prospects p where p.acquisition_import_batch_id=b.id and p.enrichment_status in ('failed','no_match'))),
    'rows',coalesce((select jsonb_agg(jsonb_build_object('row_number',r.row_number,'status',r.status,
      'acquisition_prospect_id',r.acquisition_prospect_id,'errors',r.validation_errors) order by r.row_number)
      from acquisition_import_rows r where r.batch_id=b.id),'[]'::jsonb))
  from acquisition_import_batches b where b.id=p_batch_id;
$$;

create or replace function public.import_data_prospects(
  p_filename text, p_content_sha256 text, p_source_kind text, p_provider text,
  p_uploaded_by uuid, p_rows jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_batch acquisition_import_batches;
  v_row jsonb;
  v_id uuid;
  v_key text;
  v_status text;
  v_total integer := 0;
  v_imported integer := 0;
  v_duplicate integer := 0;
  v_invalid integer := 0;
  v_missing_email integer := 0;
  v_missing_phone integer := 0;
begin
  if p_source_kind not in ('manual','ai') or p_source_kind is null
    or nullif(btrim(p_provider),'') is null or nullif(btrim(p_filename),'') is null
    or p_content_sha256 is null or p_content_sha256 !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_rows) is distinct from 'array'
  then raise exception 'invalid DATA import request'; end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 5000
  then raise exception 'DATA import must contain between 1 and 5000 rows'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_source_kind||'|'||p_provider||'|'||p_content_sha256,0));
  select * into v_batch from acquisition_import_batches
    where source_kind=p_source_kind and provider=p_provider and content_sha256=p_content_sha256
      and status='confirmed' order by created_at limit 1;
  if found then return public.data_import_result(v_batch.id,true); end if;

  insert into acquisition_import_batches(batch_code,uploaded_by,original_filename,content_sha256,source_kind,provider,status)
    values('DATA-'||to_char(now(),'YYYYMMDD')||'-'||substr(gen_random_uuid()::text,1,8),p_uploaded_by,
      p_filename,p_content_sha256,p_source_kind,p_provider,'previewed') returning * into v_batch;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_total := v_total + 1;
    v_id := null;
    if nullif(v_row->>'email','') is null then v_missing_email := v_missing_email+1; end if;
    if nullif(v_row->>'phone','') is null then v_missing_phone := v_missing_phone+1; end if;
    if coalesce(v_row->>'status','invalid')='invalid' or nullif(btrim(v_row->>'business_name'),'') is null then
      v_status := 'invalid'; v_invalid := v_invalid+1;
    else
      v_key := coalesce(nullif(v_row->>'identity_key',''),'unresolved:'||v_batch.id::text||':'||(v_row->>'row_number'));
      insert into acquisition_prospects(identity_key,acquisition_import_batch_id,source_row_number,
        normalized_business_name,normalized_address,normalized_city,normalized_state,normalized_zip,
        normalized_email,normalized_phone,domain,business_name,address,city,state,zip,website_url,
        industry,source_kind,provider,source_payload,state_key)
      values(v_key,v_batch.id,(v_row->>'row_number')::integer,
        v_row->>'normalized_business_name',coalesce(v_row->>'normalized_address',''),coalesce(v_row->>'normalized_city',''),
        coalesce(v_row->>'normalized_state',''),coalesce(v_row->>'normalized_zip',''),
        nullif(v_row->>'email',''),nullif(v_row->>'phone',''),nullif(v_row->>'domain',''),v_row->>'business_name',
        nullif(v_row->>'address',''),nullif(v_row->>'city',''),nullif(v_row->>'state',''),nullif(v_row->>'zip',''),
        nullif(v_row->>'website_url',''),nullif(v_row->>'industry',''),p_source_kind,p_provider,
        coalesce(v_row->'raw_payload','{}'::jsonb),'prospect')
      on conflict(identity_key) do nothing returning id into v_id;
      if v_id is null then
        select id into strict v_id from acquisition_prospects where identity_key=v_key;
        v_status := 'duplicate'; v_duplicate := v_duplicate+1;
      else
        v_status := 'imported'; v_imported := v_imported+1;
      end if;
    end if;
    insert into acquisition_import_rows(batch_id,row_number,status,duplicate_reason,validation_errors,
      normalized_payload,raw_payload,acquisition_prospect_id)
    values(v_batch.id,(v_row->>'row_number')::integer,v_status,
      case when v_status='duplicate' then coalesce(v_row->>'duplicate_reason','business_location: existing prospect') else null end,
      coalesce(v_row->'errors','[]'::jsonb),v_row - 'raw_payload',coalesce(v_row->'raw_payload','{}'::jsonb),v_id);
  end loop;
  update acquisition_import_batches set status='confirmed',imported_at=now(),total_rows=v_total,valid_rows=v_imported,
    duplicate_rows=v_duplicate,invalid_rows=v_invalid,missing_email_rows=v_missing_email,missing_phone_rows=v_missing_phone
    where id=v_batch.id;
  return public.data_import_result(v_batch.id,false);
end $$;

revoke all on function public.import_data_prospects(text,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.import_data_prospects(text,text,text,text,uuid,jsonb) to service_role;
revoke all on function public.data_import_result(uuid,boolean) from public,anon,authenticated;
grant execute on function public.data_import_result(uuid,boolean) to service_role;

-- ============================================================================
-- PART 9: DATA VIEWS
-- ============================================================================

create or replace view public.data_prospect_records with (security_invoker=true) as
select p.id,'prospect'::text as record_kind,p.business_name,p.industry,p.address,p.city,p.state,p.zip,
  p.normalized_phone as phone,p.normalized_email as email,p.website_url,p.source_kind as source,p.provider,
  case when p.potential_duplicate_of_id is not null then 'duplicate'
    when p.enrichment_status='enriching' then 'enriching'
    when p.state_key='outreach_ready' then 'ready_for_outreach'
    when p.verified_at is not null then 'verified'
    when nullif(p.normalized_phone,'') is null and nullif(p.normalized_email,'') is null then 'missing_contact'
    when p.enrichment_status='enriched' then 'enriched' else 'imported' end as status,
  p.enrichment_status,p.enrichment_error,(p.verified_at is not null) as verified,
  (p.state_key='outreach_ready') as ready_for_outreach,p.created_at,
  array(select distinct source_kind from (
    select p.source_kind union all select b.source_kind from acquisition_import_rows r
    join acquisition_import_batches b on b.id=r.batch_id where r.acquisition_prospect_id=p.id
  ) sources) as sources,
  jsonb_build_array(jsonb_build_object('source',p.source_kind,'provider',p.provider,'batch_code',b.batch_code,
    'original_filename',b.original_filename,'row_number',p.source_row_number,'created_at',p.created_at)) as provenance
from public.acquisition_prospects p join public.acquisition_import_batches b on b.id=p.acquisition_import_batch_id
union all
select c.id,'candidate'::text,c.business_name,nullif(c.industry,''),nullif(c.raw_payload->>'address',''),
  nullif(c.raw_payload->>'city',''),c.state,nullif(c.raw_payload->>'zip',''),
  nullif(coalesce(nullif(c.business_phone,''),c.source_phone),''),nullif(c.business_email,''),c.website_url,
  'ai'::text,s.source_name,
  case when c.enrichment_status='running' then 'enriching'
    when c.identity_match and c.website_verified then 'verified'
    when nullif(c.business_email,'') is null and nullif(coalesce(nullif(c.business_phone,''),c.source_phone),'') is null then 'missing_contact'
    when c.enrichment_status='completed' then 'enriched' else 'imported' end,
  c.enrichment_status::text,c.rejection_reason,(c.identity_match and c.website_verified),false,c.created_at,
  array['ai']::text[],
  jsonb_build_array(jsonb_build_object('source','ai','provider',s.source_name,'batch_code',null,
    'original_filename',null,'row_number',null,'created_at',c.created_at))
from public.merchant_acquisition_candidates c join public.merchant_acquisition_sources s on s.id=c.source_id;

revoke all on public.data_prospect_records from public,anon,authenticated;
grant select on public.data_prospect_records to service_role;

create or replace view public.data_import_batch_summaries with (security_invoker=true) as
select b.*,jsonb_build_object(
  'ready',count(p.id) filter(where p.enrichment_status='pending'),
  'enriched',count(p.id) filter(where p.enrichment_status='enriched'),
  'failed',count(p.id) filter(where p.enrichment_status in ('failed','no_match'))
) as enrichment
from public.acquisition_import_batches b left join public.acquisition_prospects p on p.acquisition_import_batch_id=b.id
group by b.id;
revoke all on public.data_import_batch_summaries from public,anon,authenticated;
grant select on public.data_import_batch_summaries to service_role;
