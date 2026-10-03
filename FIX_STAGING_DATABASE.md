# Fix Staging Database - Final Steps

**Status:** 95% Complete - Schema Ready, Views Pending

## Summary

The staging database schema is **ready for /data endpoint** except for two database views that need to be created. The core infrastructure is in place:

✅ **Complete:**
- All required tables (acquisition_prospects, acquisition_import_batches, etc.)
- All required columns including `enrichment_status`
- Authentication functions (current_app_role, is_internal_user)
- RLS policies configured
- Indexes created
- Enums and types defined

⏳ **Pending:**
- Two SQL views need to be executed in Supabase SQL Editor

---

## What to Do

### Step 1: Open Supabase SQL Editor

Go to: https://app.supabase.com/project/dstqbiccseijydgsvlgj/sql/new

### Step 2: Copy the SQL

Open this file and copy the SQL:
```
packages/database/migrations/0041_finalize_data_views.sql
```

Or use this SQL directly:

```sql
-- View 1: Unified prospect records
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

-- View 2: Import batch summaries
create or replace view public.data_import_batch_summaries with (security_invoker=true) as
select
  b.*,
  (select count(*) from acquisition_prospects p where p.acquisition_import_batch_id = b.id and p.enrichment_status = 'pending') as ready_count,
  (select count(*) from acquisition_prospects p where p.acquisition_import_batch_id = b.id and p.enrichment_status = 'enriched') as enriched_count,
  (select count(*) from acquisition_prospects p where p.acquisition_import_batch_id = b.id and p.enrichment_status in ('failed', 'no_match')) as failed_count
from public.acquisition_import_batches b;

-- Grant permissions
grant select on public.data_prospect_records to service_role;
grant select on public.data_import_batch_summaries to service_role;
grant select on public.data_prospect_records to authenticated;
grant select on public.data_import_batch_summaries to authenticated;
```

### Step 3: Execute

1. Paste the SQL into the SQL editor
2. Click **Run** (or press `Ctrl+Enter`)
3. Wait for success message
4. Done! ✅

---

## Testing After Fix

### 1. Start Development Server

```bash
npm run dev
```

### 2. Test Data Pages

Visit these URLs in your browser:
- **Data Dashboard:** http://localhost:3000/data
- **Manual Upload:** http://localhost:3000/data/manual-upload

### 3. Run Tests

```bash
npm test -- 0041-data-schema
```

### 4. Build Check

```bash
npm run build
```

---

## What Was Done

### Previous Session
1. ✅ Verified staging database was empty (only Supabase system tables)
2. ✅ Identified missing migration 0008 (auth functions)
3. ✅ Applied migration 0008 to staging (current_app_role, is_internal_user)
4. ✅ Applied migrations 0036-0040 (core acquisition system)
5. ✅ Created acquisition_prospects table with all columns
6. ✅ Created acquisition_import_batches table
7. ✅ Created acquisition_import_rows table
8. ✅ Added enrichment_status column to acquisition_prospects

### This Session
1. ✅ Verified enrichment_status column EXISTS in staging
2. ✅ Verified all core tables are properly configured
3. ✅ Prepared final migration SQL (0041_finalize_data_views.sql)
4. ✅ Created verification tests
5. ✅ Documented complete fix process

---

## Architecture

The /data endpoint requires:

```
┌─ Supabase Database (Staging)
│  ├─ Tables
│  │  ├─ acquisition_import_batches ✅
│  │  ├─ acquisition_import_rows ✅
│  │  └─ acquisition_prospects ✅
│  ├─ Views
│  │  ├─ data_prospect_records ⏳
│  │  └─ data_import_batch_summaries ⏳
│  ├─ Functions
│  │  ├─ current_app_role() ✅
│  │  ├─ is_internal_user() ✅
│  │  ├─ import_data_prospects() ✅
│  │  └─ data_import_result() ✅
│  └─ RLS Policies ✅
│
└─ Next.js API Endpoints
   ├─ GET /data - read via data_prospect_records view ⏳
   └─ GET /data/manual-upload - upload form ✅
```

---

## Files Generated

| File | Purpose |
|------|---------|
| `packages/database/migrations/0041_finalize_data_views.sql` | Final SQL to execute in dashboard |
| `packages/database/tests/0041-data-schema.test.ts` | Verification tests |
| `DATABASE_MIGRATION_STATUS.md` | Status summary |
| `FIX_STAGING_DATABASE.md` | This file |

---

## Troubleshooting

### If views fail to create:

**Error: "relation ... does not exist"**
- Verify enrichment_status column exists:
  ```sql
  SELECT column_name FROM information_schema.columns 
  WHERE table_name='acquisition_prospects' AND column_name='enrichment_status';
  ```

**Error: "permission denied"**
- User may not have admin role in Supabase
- Use project owner account to run SQL

**Error: "object already exists"**
- Views already created - this is OK
- No need to re-run

### If /data endpoint still fails after views created:

1. Check Supabase logs in dashboard
2. Verify RLS policies aren't blocking access
3. Check service_role key is valid

---

## Next Steps

1. **Execute SQL** in Supabase Dashboard (see Step 2-3 above)
2. **Test pages** at http://localhost:3000/data
3. **Verify API** responses with actual data
4. **Run test suite** to confirm
5. **Deploy to preview** for full testing
6. **Merge to main** once verified

---

**Time to complete:** ~5 minutes (just paste & run SQL)  
**Support:** See DATABASE_MIGRATION_STATUS.md for detailed status
