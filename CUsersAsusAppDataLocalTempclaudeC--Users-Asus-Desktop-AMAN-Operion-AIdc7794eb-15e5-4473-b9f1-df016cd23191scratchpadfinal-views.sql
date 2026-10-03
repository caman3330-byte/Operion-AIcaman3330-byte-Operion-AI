-- Create data_prospect_records view
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
  (p.state_key='outreach_ready') as ready_for_outreach,p.created_at
from public.acquisition_prospects p;

-- Create data_import_batch_summaries view  
create or replace view public.data_import_batch_summaries with (security_invoker=true) as
select b.*,
  (select count(*) from acquisition_prospects p where p.acquisition_import_batch_id=b.id and p.enrichment_status='pending') as ready_count,
  (select count(*) from acquisition_prospects p where p.acquisition_import_batch_id=b.id and p.enrichment_status='enriched') as enriched_count,
  (select count(*) from acquisition_prospects p where p.acquisition_import_batch_id=b.id and p.enrichment_status in ('failed','no_match')) as failed_count
from public.acquisition_import_batches b;

-- Grant select on views to service_role
grant select on public.data_prospect_records to service_role;
grant select on public.data_import_batch_summaries to service_role;
