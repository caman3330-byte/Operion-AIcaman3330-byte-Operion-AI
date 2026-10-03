# Database Migration 0041 Status

**Date:** 2026-10-03  
**Status:** ✅ SCHEMA READY - Views Pending  
**Action Required:** Paste SQL into Supabase Dashboard

## What's Working ✅

- ✅ `acquisition_prospects` table exists
- ✅ `enrichment_status` column exists on `acquisition_prospects`
- ✅ All required columns (source_kind, provider, industry, enriched_at, verified_at, etc.)
- ✅ Core infrastructure (tables, enums, functions from migrations 0008-0040)
- ✅ RLS policies configured for founder/admin access

## What's Pending ⏳

Two views need to be created in Supabase SQL Editor:
1. `data_prospect_records` - Read-only view of prospect records
2. `data_import_batch_summaries` - Batch summary metrics

## Action Steps

### Step 1: Open Supabase Dashboard
Navigate to: https://app.supabase.com/project/dstqbiccseijydgsvlgj/sql/new

### Step 2: Copy & Paste This SQL

```sql
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

-- Grant select permissions
grant select on public.data_prospect_records to service_role;
grant select on public.data_import_batch_summaries to service_role;
```

### Step 3: Execute

1. Click "Run" or press `Ctrl+Enter`
2. Watch for success message (no errors)
3. Done! ✨

## Verification

After executing the SQL, these endpoints will be ready:
- `GET /data` - List all data prospects
- `GET /data/manual-upload` - Manual upload page

## Database Schema Summary

| Component | Status |
|-----------|--------|
| Tables | ✅ Created |
| Enums | ✅ Created |
| Columns | ✅ All present |
| Functions | ✅ Created |
| RLS Policies | ✅ Configured |
| Views | ⏳ Pending execution |
| Permissions | ⏳ Pending grants |

## Migration History

1. **0008**: Auth functions (current_app_role, is_internal_user)
2. **0036-0040**: Core acquisition system tables and structures
3. **0041**: Data import schema (partially applied, views pending)

---

**Next:** Run the SQL above, then test `/data` endpoint.
