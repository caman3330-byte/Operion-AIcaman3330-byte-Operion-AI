-- Preserve an owner name supplied by a manual file or found during research.
-- This remains DATA-only; it does not create leads or send outreach.

alter table public.acquisition_prospects
  add column if not exists owner_name text;

create index if not exists idx_acquisition_prospects_owner_name
  on public.acquisition_prospects(owner_name)
  where owner_name is not null;

comment on column public.acquisition_prospects.owner_name is
  'Owner or principal name supplied by the source file or verified during research.';

drop view if exists public.data_prospect_records;

create view public.data_prospect_records with (security_invoker = true) as
select
  p.id,
  'prospect'::text as record_kind,
  p.business_name,
  p.owner_name,
  p.industry,
  p.address,
  p.city,
  p.state,
  p.zip,
  p.normalized_phone as phone,
  p.normalized_email as email,
  p.website_url,
  p.source_kind as source,
  p.provider,
  case
    when p.verified_at is not null then 'verified'
    when p.enrichment_status = 'enriched' then 'enriched'
    when p.normalized_email is null and p.normalized_phone is null then 'missing_contact'
    else 'imported'
  end as status,
  p.enrichment_status,
  p.enrichment_error,
  (p.verified_at is not null) as verified,
  (p.enrichment_status = 'enriched' and (p.normalized_email is not null or p.normalized_phone is not null)) as ready_for_outreach,
  p.created_at,
  coalesce((
    select array_agg(distinct b.source_kind order by b.source_kind)
    from public.acquisition_import_rows r
    join public.acquisition_import_batches b on b.id = r.batch_id
    where r.acquisition_prospect_id = p.id
  ), array[p.source_kind]::text[]) as sources
from public.acquisition_prospects p
union all
select
  c.id,
  'candidate'::text,
  c.business_name,
  null::text,
  c.industry,
  c.raw_payload->>'address',
  c.raw_payload->>'city',
  c.state,
  c.raw_payload->>'zip',
  c.business_phone,
  c.business_email,
  c.website_url,
  'ai'::text,
  s.source_name,
  case when c.enrichment_status::text in ('completed','verified') then 'verified' else c.enrichment_status::text end,
  c.enrichment_status::text,
  null::text,
  coalesce(c.website_verified or c.phone_verified or c.email_found, false),
  false,
  c.created_at,
  array['ai']::text[]
from public.merchant_acquisition_candidates c
join public.merchant_acquisition_sources s on s.id = c.source_id;

revoke all on public.data_prospect_records from public, anon, authenticated;
grant select on public.data_prospect_records to service_role;
