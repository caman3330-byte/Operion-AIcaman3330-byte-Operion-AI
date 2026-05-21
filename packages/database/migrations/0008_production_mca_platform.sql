-- Operion Capital production MCA funding platform schema
-- Apply after 0001-0007. This migration introduces the canonical production records
-- used by customer intake, internal underwriting, AI qualification, lender routing,
-- outreach infrastructure, and operational reporting.

do $$
begin
  create type app_role as enum ('customer', 'staff', 'supervisor', 'founder', 'admin', 'operator', 'analyst', 'super_admin');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type business_application_status as enum (
    'draft',
    'submitted',
    'ai_review',
    'qualified',
    'reviewing',
    'submitted_to_lender',
    'approved',
    'funded',
    'rejected',
    'withdrawn'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type ai_task_status as enum ('queued', 'running', 'completed', 'failed', 'blocked');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type ai_task_type as enum (
    'lead_qualification',
    'underwriting_summary',
    'lender_recommendation',
    'outreach_preparation',
    'reporting'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type lender_match_status as enum ('recommended', 'approved', 'submitted', 'accepted', 'rejected', 'funded');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type document_status as enum ('requested', 'uploaded', 'verified', 'rejected');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type funding_offer_status as enum ('draft', 'presented', 'accepted', 'declined', 'expired');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type approval_status_type as enum ('pending', 'approved', 'rejected', 'cancelled');
exception
  when duplicate_object then null;
end $$;

alter type entity_type add value if not exists 'business_application';
alter type entity_type add value if not exists 'ai_task';
alter type entity_type add value if not exists 'lender_match';
alter type entity_type add value if not exists 'funding_offer';
alter type entity_type add value if not exists 'document';

alter table users add column if not exists auth_user_id uuid null references auth.users(id) on delete set null;
alter table users add column if not exists role text not null default 'customer';
alter table users add column if not exists last_login_at timestamptz null;
alter table users alter column role set default 'customer';
update users set role = 'customer' where role = 'applicant';

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text null,
  phone text null,
  role app_role not null default 'customer',
  company_name text null,
  title text null,
  avatar_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists business_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  profile_id uuid null references profiles(id) on delete set null,
  business_id uuid null references businesses(id) on delete set null,
  lead_id uuid null references leads(id) on delete set null,
  status business_application_status not null default 'submitted',
  business_name text not null,
  industry text not null,
  state text null,
  website_url text null,
  annual_revenue numeric(14, 2) null,
  monthly_revenue numeric(14, 2) null,
  monthly_deposits numeric(14, 2) not null check (monthly_deposits >= 0),
  requested_amount numeric(14, 2) not null check (requested_amount > 0),
  product_type funding_product_type not null default 'mca',
  credit_score_range credit_score_range not null default 'unknown',
  owner_name text not null,
  contact_email text not null,
  contact_phone text not null,
  ownership_percentage numeric(5, 2) null,
  bank_name text null,
  average_daily_balance numeric(14, 2) null,
  funding_purpose text null,
  consent_to_contact boolean not null default true,
  progress_step integer not null default 4,
  metadata jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table leads add column if not exists business_application_id uuid null references business_applications(id) on delete set null;
alter table leads add column if not exists requested_amount numeric(14, 2) null;
alter table leads add column if not exists monthly_deposits numeric(14, 2) null;
alter table leads add column if not exists funding_purpose text null;
alter table leads add column if not exists ai_summary text null;
alter table leads add column if not exists internal_notes text null;

alter type lead_status add value if not exists 'reviewing';
alter type lead_status add value if not exists 'submitted';
alter type lead_status add value if not exists 'approved';
alter type lead_status add value if not exists 'funded';
alter type lead_status add value if not exists 'rejected';

create table if not exists lead_scores (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  business_application_id uuid null references business_applications(id) on delete cascade,
  score integer not null check (score >= 0 and score <= 100),
  tier lead_tier null,
  decision text not null,
  industry_risk text null,
  funding_fit text null,
  underwriting_summary text null,
  lender_recommendations jsonb not null default '[]'::jsonb,
  internal_notes text null,
  model text null,
  provider text not null default 'openai',
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists lender_matches (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  business_application_id uuid null references business_applications(id) on delete cascade,
  match_score integer null check (match_score is null or (match_score >= 0 and match_score <= 100)),
  status lender_match_status not null default 'recommended',
  criteria_snapshot jsonb not null default '{}'::jsonb,
  submitted_at timestamptz null,
  decision_at timestamptz null,
  commission_estimate numeric(14, 2) null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, lender_id)
);

alter table outreach_campaigns add column if not exists owner_id uuid null references auth.users(id) on delete set null;
alter table outreach_campaigns add column if not exists channel text not null default 'email';
alter table outreach_campaigns add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists outreach_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid null references outreach_campaigns(id) on delete set null,
  lead_id uuid null references leads(id) on delete set null,
  business_application_id uuid null references business_applications(id) on delete set null,
  channel text not null default 'email',
  direction text not null default 'outbound',
  subject text null,
  body text null,
  status text not null default 'queued',
  provider text null,
  provider_message_id text null,
  error_message text null,
  sent_at timestamptz null,
  opened_at timestamptz null,
  replied_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ai_tasks (
  id uuid primary key default gen_random_uuid(),
  task_type ai_task_type not null,
  status ai_task_status not null default 'queued',
  priority text not null default 'normal',
  lead_id uuid null references leads(id) on delete cascade,
  business_application_id uuid null references business_applications(id) on delete cascade,
  assigned_agent text not null default 'underwriting_ai',
  input_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  error_message text null,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  cost_estimate_usd numeric(12, 6) null,
  created_by uuid null references auth.users(id) on delete set null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_task_logs (
  id uuid primary key default gen_random_uuid(),
  ai_task_id uuid not null references ai_tasks(id) on delete cascade,
  status ai_task_status not null,
  message text not null,
  provider text null,
  model text null,
  input_tokens integer null,
  output_tokens integer null,
  latency_ms integer null,
  cost_estimate_usd numeric(12, 6) null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table underwriting_reviews add column if not exists lead_id uuid null references leads(id) on delete cascade;
alter table underwriting_reviews add column if not exists business_application_id uuid null references business_applications(id) on delete cascade;
alter table underwriting_reviews add column if not exists ai_task_id uuid null references ai_tasks(id) on delete set null;
alter table underwriting_reviews add column if not exists qualification_score integer null check (qualification_score is null or (qualification_score >= 0 and qualification_score <= 100));
alter table underwriting_reviews add column if not exists industry_risk text null;
alter table underwriting_reviews add column if not exists lender_recommendations jsonb not null default '[]'::jsonb;
alter table underwriting_reviews alter column application_id drop not null;

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  business_application_id uuid null references business_applications(id) on delete cascade,
  lead_id uuid null references leads(id) on delete set null,
  document_type text not null,
  file_name text null,
  storage_path text null,
  mime_type text null,
  file_size integer null,
  status document_status not null default 'requested',
  uploaded_at timestamptz null,
  verified_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists funding_offers (
  id uuid primary key default gen_random_uuid(),
  business_application_id uuid not null references business_applications(id) on delete cascade,
  lead_id uuid null references leads(id) on delete set null,
  lender_id uuid null references lenders(id) on delete set null,
  amount numeric(14, 2) not null check (amount > 0),
  factor_rate numeric(8, 4) null,
  term_months integer null,
  repayment_frequency text null,
  estimated_payment numeric(14, 2) null,
  status funding_offer_status not null default 'draft',
  presented_at timestamptz null,
  expires_at timestamptz null,
  accepted_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists approval_statuses (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  requested_by uuid null references auth.users(id) on delete set null,
  assigned_to uuid null references auth.users(id) on delete set null,
  status approval_status_type not null default 'pending',
  reason text null,
  decided_by uuid null references auth.users(id) on delete set null,
  decided_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_id text null,
  actor_role text null,
  entity_type text not null,
  entity_id text null,
  before_state jsonb null,
  after_state jsonb null,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet null,
  created_at timestamptz not null default now()
);

create table if not exists api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  operation text not null,
  lead_id uuid null references leads(id) on delete set null,
  business_application_id uuid null references business_applications(id) on delete set null,
  ai_task_id uuid null references ai_tasks(id) on delete set null,
  input_tokens integer null,
  output_tokens integer null,
  estimated_cost_usd numeric(12, 6) null,
  success boolean not null default true,
  latency_ms integer null,
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on profiles(role);
create index if not exists idx_business_applications_user_status on business_applications(user_id, status, created_at desc);
create index if not exists idx_business_applications_lead_id on business_applications(lead_id) where lead_id is not null;
create index if not exists idx_leads_business_application_id on leads(business_application_id) where business_application_id is not null;
create index if not exists idx_lead_scores_lead_created on lead_scores(lead_id, created_at desc);
create index if not exists idx_lender_matches_lead_status on lender_matches(lead_id, status);
create index if not exists idx_outreach_logs_lead_created on outreach_logs(lead_id, created_at desc);
create index if not exists idx_ai_tasks_status_created on ai_tasks(status, created_at);
create index if not exists idx_ai_tasks_application on ai_tasks(business_application_id, created_at desc);
create index if not exists idx_ai_task_logs_task_created on ai_task_logs(ai_task_id, created_at desc);
create index if not exists idx_documents_application_status on documents(business_application_id, status);
create index if not exists idx_funding_offers_application_status on funding_offers(business_application_id, status);
create index if not exists idx_approval_statuses_entity on approval_statuses(entity_type, entity_id, status);
create index if not exists idx_audit_logs_entity on audit_logs(entity_type, entity_id, created_at desc);
create index if not exists idx_api_usage_logs_service_created on api_usage_logs(service, created_at desc);

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at
before update on profiles
for each row execute function set_updated_at();

drop trigger if exists business_applications_set_updated_at on business_applications;
create trigger business_applications_set_updated_at
before update on business_applications
for each row execute function set_updated_at();

drop trigger if exists lender_matches_set_updated_at on lender_matches;
create trigger lender_matches_set_updated_at
before update on lender_matches
for each row execute function set_updated_at();

drop trigger if exists ai_tasks_set_updated_at on ai_tasks;
create trigger ai_tasks_set_updated_at
before update on ai_tasks
for each row execute function set_updated_at();

drop trigger if exists documents_set_updated_at on documents;
create trigger documents_set_updated_at
before update on documents
for each row execute function set_updated_at();

drop trigger if exists funding_offers_set_updated_at on funding_offers;
create trigger funding_offers_set_updated_at
before update on funding_offers
for each row execute function set_updated_at();

drop trigger if exists approval_statuses_set_updated_at on approval_statuses;
create trigger approval_statuses_set_updated_at
before update on approval_statuses
for each row execute function set_updated_at();

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

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    case
      when new.raw_user_meta_data ->> 'role' in ('customer', 'staff', 'supervisor', 'founder')
        then (new.raw_user_meta_data ->> 'role')::app_role
      else 'customer'::app_role
    end
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    phone = coalesce(excluded.phone, public.profiles.phone),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_operion_profile on auth.users;
create trigger on_auth_user_created_operion_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user_profile();

alter table profiles enable row level security;
alter table business_applications enable row level security;
alter table lead_scores enable row level security;
alter table lender_matches enable row level security;
alter table outreach_logs enable row level security;
alter table ai_tasks enable row level security;
alter table ai_task_logs enable row level security;
alter table documents enable row level security;
alter table funding_offers enable row level security;
alter table approval_statuses enable row level security;
alter table audit_logs enable row level security;
alter table api_usage_logs enable row level security;

drop policy if exists "profiles_self_or_internal_select" on profiles;
create policy "profiles_self_or_internal_select" on profiles
for select to authenticated
using (id = auth.uid() or public.is_internal_user());

drop policy if exists "profiles_self_insert" on profiles;
create policy "profiles_self_insert" on profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_self_update" on profiles;
create policy "profiles_self_update" on profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "business_applications_owner_or_internal_select" on business_applications;
create policy "business_applications_owner_or_internal_select" on business_applications
for select to authenticated
using (user_id = auth.uid() or profile_id = auth.uid() or public.is_internal_user());

drop policy if exists "business_applications_owner_insert" on business_applications;
create policy "business_applications_owner_insert" on business_applications
for insert to authenticated
with check (user_id = auth.uid() or profile_id = auth.uid());

drop policy if exists "business_applications_owner_or_internal_update" on business_applications;
create policy "business_applications_owner_or_internal_update" on business_applications
for update to authenticated
using (user_id = auth.uid() or profile_id = auth.uid() or public.is_internal_user())
with check (user_id = auth.uid() or profile_id = auth.uid() or public.is_internal_user());

drop policy if exists "documents_owner_or_internal_select" on documents;
create policy "documents_owner_or_internal_select" on documents
for select to authenticated
using (user_id = auth.uid() or public.is_internal_user());

drop policy if exists "documents_owner_insert" on documents;
create policy "documents_owner_insert" on documents
for insert to authenticated
with check (user_id = auth.uid() or public.is_internal_user());

drop policy if exists "funding_offers_owner_or_internal_select" on funding_offers;
create policy "funding_offers_owner_or_internal_select" on funding_offers
for select to authenticated
using (
  public.is_internal_user()
  or exists (
    select 1 from business_applications ba
    where ba.id = funding_offers.business_application_id
      and (ba.user_id = auth.uid() or ba.profile_id = auth.uid())
  )
);

drop policy if exists "internal_read_lead_scores" on lead_scores;
create policy "internal_read_lead_scores" on lead_scores for select to authenticated using (public.is_internal_user());
drop policy if exists "internal_read_lender_matches" on lender_matches;
create policy "internal_read_lender_matches" on lender_matches for select to authenticated using (public.is_internal_user());
drop policy if exists "internal_read_outreach_logs" on outreach_logs;
create policy "internal_read_outreach_logs" on outreach_logs for select to authenticated using (public.is_internal_user());
drop policy if exists "internal_read_ai_tasks" on ai_tasks;
create policy "internal_read_ai_tasks" on ai_tasks for select to authenticated using (public.is_internal_user());
drop policy if exists "internal_read_ai_task_logs" on ai_task_logs;
create policy "internal_read_ai_task_logs" on ai_task_logs for select to authenticated using (public.is_internal_user());
drop policy if exists "internal_read_approval_statuses" on approval_statuses;
create policy "internal_read_approval_statuses" on approval_statuses for select to authenticated using (public.is_internal_user());
drop policy if exists "internal_read_audit_logs" on audit_logs;
create policy "internal_read_audit_logs" on audit_logs for select to authenticated using (public.is_internal_user());
drop policy if exists "internal_read_api_usage_logs" on api_usage_logs;
create policy "internal_read_api_usage_logs" on api_usage_logs for select to authenticated using (public.is_internal_user());
