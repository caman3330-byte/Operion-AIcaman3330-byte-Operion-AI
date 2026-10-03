do $$ begin
  create type acquisition_prospect_state as enum (
    'prospect', 'outreach_ready', 'outreach_sent', 'interested',
    'application_started', 'application_submitted', 'sales_followup', 'closed'
  );
exception when duplicate_object then null;
end $$;

create table if not exists acquisition_prospects (
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (acquisition_import_batch_id, source_row_number)
);

drop trigger if exists set_acquisition_prospects_updated_at on acquisition_prospects;
create trigger set_acquisition_prospects_updated_at
before update on acquisition_prospects for each row execute function set_updated_at();

create unique index if not exists idx_acquisition_prospects_lead_unique
on acquisition_prospects(lead_id) where lead_id is not null;
create unique index if not exists idx_acquisition_prospects_application_unique
on acquisition_prospects(business_application_id) where business_application_id is not null;
create index if not exists idx_acquisition_prospects_state_created
on acquisition_prospects(state_key, created_at desc);
create index if not exists idx_acquisition_prospects_contact_signals
on acquisition_prospects(normalized_email, normalized_phone);

alter table leads add column if not exists acquisition_prospect_id uuid references acquisition_prospects(id) on delete set null;
alter table business_applications add column if not exists acquisition_prospect_id uuid references acquisition_prospects(id) on delete set null;
create unique index if not exists idx_leads_acquisition_prospect_unique
on leads(acquisition_prospect_id) where acquisition_prospect_id is not null;
create unique index if not exists idx_business_applications_acquisition_prospect_unique
on business_applications(acquisition_prospect_id) where acquisition_prospect_id is not null;

alter table acquisition_prospects enable row level security;
drop policy if exists "internal_manage_acquisition_prospects" on acquisition_prospects;
create policy "internal_manage_acquisition_prospects" on acquisition_prospects
for all to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());
