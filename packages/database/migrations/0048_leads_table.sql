-- LEADS WORKFLOW FOUNDATION
-- Extend the baseline leads table without recreating it. The DATA foundation
-- creates a minimal public.leads table for foreign-key compatibility, while
-- existing deployments may already have the richer production shape.

alter table public.leads
  add column if not exists acquisition_prospect_id uuid references public.acquisition_prospects(id),
  add column if not exists business_name text,
  add column if not exists contact_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists industry text,
  add column if not exists state text,
  add column if not exists annual_revenue_est numeric,
  add column if not exists time_in_business_years numeric,
  add column if not exists apollo_id text,
  add column if not exists qualification_score integer,
  add column if not exists tier text,
  add column if not exists status text default 'raw',
  add column if not exists enrichment_score integer,
  add column if not exists enrichment_status text,
  add column if not exists enrichment_errors text[],
  add column if not exists qualified_at timestamptz,
  add column if not exists outreach_started boolean default false,
  add column if not exists outreach_paused boolean default false,
  add column if not exists blacklisted boolean default false,
  add column if not exists distribution_approved_at timestamptz,
  add column if not exists processing_error boolean default false,
  add column if not exists processing_error_detail text,
  add column if not exists distributed_at timestamptz,
  add column if not exists outreach_sent_at timestamptz,
  add column if not exists first_reply_at timestamptz,
  add column if not exists is_test_data boolean default false,
  add column if not exists simulation_run_id uuid,
  add column if not exists business_application_id uuid references public.business_applications(id),
  add column if not exists requested_amount numeric,
  add column if not exists monthly_deposits numeric,
  add column if not exists funding_purpose text,
  add column if not exists ai_summary text,
  add column if not exists internal_notes text;

create index if not exists idx_leads_prospect_id on public.leads(acquisition_prospect_id);
create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_leads_created_at on public.leads(created_at desc);
create index if not exists idx_leads_enrichment_status on public.leads(enrichment_status);
create index if not exists idx_leads_qualified_at on public.leads(qualified_at) where qualified_at is not null;

comment on table public.leads is
  'Qualified prospects ready for merchant acquisition outreach. Separated from raw DATA prospects to track enrichment and engagement.';

-- set_updated_at is defined by the DATA baseline and is available in both the
-- minimal staging schema and the richer existing production schema.
drop trigger if exists leads_updated_at_trigger on public.leads;
create trigger leads_updated_at_trigger
  before update on public.leads
  for each row execute function public.set_updated_at();

revoke all on public.leads from public, anon, authenticated;
grant select, insert, update, delete on public.leads to service_role;
