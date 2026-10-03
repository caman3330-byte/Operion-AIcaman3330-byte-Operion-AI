-- Complete DATA schema views and permissions
-- Run this in Supabase SQL Editor when 0041_data_prospect_import.sql fails
-- This migration creates the two required views for /data endpoint

-- First, ensure all required columns exist
alter table public.acquisition_prospects add column if not exists industry text;
alter table public.acquisition_prospects add column if not exists address text;
alter table public.acquisition_prospects add column if not exists city text;
alter table public.acquisition_prospects add column if not exists state text;
alter table public.acquisition_prospects add column if not exists zip text;
alter table public.acquisition_prospects add column if not exists website_url text;
alter table public.acquisition_prospects add column if not exists normalized_email text;
alter table public.acquisition_prospects add column if not exists normalized_phone text;
alter table public.acquisition_prospects add column if not exists enrichment_error text;
alter table public.acquisition_prospects add column if not exists enriched_at timestamptz;
alter table public.acquisition_prospects add column if not exists verified_at timestamptz;
alter table public.acquisition_prospects add column if not exists source_kind text default 'manual';
alter table public.acquisition_prospects add column if not exists provider text default 'manual_upload';
alter table public.acquisition_prospects add column if not exists state_key text default 'prospect';
alter table public.acquisition_prospects add column if not exists potential_duplicate_of_id uuid;

-- View 1: Unified prospect records across all sources
create or replace view public.data_prospect_records with (security_invoker=true) as
select
  p.id,
  'prospect'::text as record_kind,
  p.business_name,
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
    when p.potential_duplicate_of_id is not null then 'duplicate'
    when p.enrichment_status = 'enriching' then 'enriching'
    when p.state_key = 'outreach_ready' then 'ready_for_outreach'
    when p.verified_at is not null then 'verified'
    when nullif(p.normalized_phone, '') is null
      and nullif(p.normalized_email, '') is null then 'missing_contact'
    when p.enrichment_status = 'enriched' then 'enriched'
    else 'imported'
  end as status,
  p.enrichment_status,
  p.enrichment_error,
  (p.verified_at is not null) as verified,
  (p.state_key = 'outreach_ready') as ready_for_outreach,
  p.created_at
from public.acquisition_prospects p;

-- View 2: Import batch summaries with enrichment metrics
create or replace view public.data_import_batch_summaries with (security_invoker=true) as
select
  b.*,
  (
    select count(*)
    from acquisition_prospects p
    where p.acquisition_import_batch_id = b.id
      and p.enrichment_status = 'pending'
  ) as ready_count,
  (
    select count(*)
    from acquisition_prospects p
    where p.acquisition_import_batch_id = b.id
      and p.enrichment_status = 'enriched'
  ) as enriched_count,
  (
    select count(*)
    from acquisition_prospects p
    where p.acquisition_import_batch_id = b.id
      and p.enrichment_status in ('failed', 'no_match')
  ) as failed_count
from public.acquisition_import_batches b;

-- Grant select on views to service_role for API access
grant select on public.data_prospect_records to service_role;
grant select on public.data_import_batch_summaries to service_role;

-- Grant select on views to authenticated users (for frontend use)
grant select on public.data_prospect_records to authenticated;
grant select on public.data_import_batch_summaries to authenticated;
