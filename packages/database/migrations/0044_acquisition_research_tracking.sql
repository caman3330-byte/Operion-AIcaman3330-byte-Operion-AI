-- Add research tracking fields to acquisition_import_rows table
-- Supports CSV research pipeline with qualification scoring

alter table public.acquisition_import_rows add column if not exists
  researched_data jsonb default '{}'::jsonb;
comment on column public.acquisition_import_rows.researched_data is 'Full researched business data';

alter table public.acquisition_import_rows add column if not exists
  qualification_score integer check (qualification_score >= 0 and qualification_score <= 100);
comment on column public.acquisition_import_rows.qualification_score is 'Lead quality score 0-100';

alter table public.acquisition_import_rows add column if not exists
  qualification_status text check (qualification_status in ('strong_fit', 'possible_fit', 'weak_fit', 'not_a_fit', 'needs_review'));
comment on column public.acquisition_import_rows.qualification_status is 'Qualification status after research';

alter table public.acquisition_import_rows add column if not exists
  research_timestamp timestamptz;
comment on column public.acquisition_import_rows.research_timestamp is 'When research was completed';

alter table public.acquisition_import_rows add column if not exists
  error_message text;
comment on column public.acquisition_import_rows.error_message is 'Error message if research failed';

-- Add qualification tracking to acquisition_prospects
alter table public.acquisition_prospects add column if not exists
  lead_score integer check (lead_score >= 0 and lead_score <= 100);
comment on column public.acquisition_prospects.lead_score is 'Calculated lead quality score';

alter table public.acquisition_prospects add column if not exists
  qualification_status text check (qualification_status in ('strong_fit', 'possible_fit', 'weak_fit', 'not_a_fit', 'needs_review'));
comment on column public.acquisition_prospects.qualification_status is 'MCA qualification status';

alter table public.acquisition_prospects add column if not exists
  qualification_reason text;
comment on column public.acquisition_prospects.qualification_reason is 'Why the lead was qualified at this level';

-- Create index on research status for efficient queue queries
create index if not exists idx_acquisition_import_rows_status_created
  on acquisition_import_rows(status, created_at);

create index if not exists idx_acquisition_prospects_qualification
  on acquisition_prospects(qualification_status, created_at desc);

-- Allow displaying researched leads
create or replace view public.qualified_leads with (security_invoker=true) as
select
  p.id,
  p.business_name,
  p.industry,
  p.city,
  p.state,
  p.website_url,
  p.normalized_phone as phone,
  p.normalized_email as email,
  p.lead_score,
  p.qualification_status,
  p.qualification_reason,
  p.enrichment_status,
  p.verified_at,
  p.created_at,
  p.source_kind,
  p.provider,
  case
    when p.lead_score >= 90 then 'excellent'
    when p.lead_score >= 75 then 'strong'
    when p.lead_score >= 60 then 'potential'
    when p.lead_score >= 40 then 'weak'
    else 'poor'
  end as score_tier
from public.acquisition_prospects p
where p.lead_score is not null
  and p.qualification_status in ('strong_fit', 'possible_fit')
order by p.lead_score desc, p.created_at desc;

grant select on public.qualified_leads to service_role;
grant select on public.qualified_leads to authenticated;
