# Migration Reconciliation & Conflict Analysis

**Status:** CRITICAL ISSUES FOUND - Consolidation Required Before Production

---

## Schema State Analysis

### Existing Schema (Applied via 0036, 0038, 0040, 0041_minimal)

**acquisition_import_batches:**
```sql
-- 0036:
batch_code text unique not null
source_id uuid references lead_sources
status acquisition_import_status ('previewed'|'confirmed'|'failed'|'cancelled')
total_rows, valid_rows, duplicate_rows, invalid_rows, missing_email_rows, missing_phone_rows
imported_at

-- Later added (0041_minimal):
source_kind text ('manual'|'ai')
provider text ('manual_upload'|'csv_upload'|'google_places'|etc)
```

**acquisition_import_rows:**
```sql
-- 0036:
batch_id uuid (cascade delete)
row_number integer
status text CHECK (status in ('valid', 'duplicate', 'invalid', 'imported'))
duplicate_reason text
validation_errors jsonb
normalized_payload jsonb
lead_id uuid (can link to leads)

-- Later added:
raw_payload jsonb
acquisition_prospect_id uuid (links to prospects)
```

**acquisition_prospects:**
```sql
-- 0038:
identity_key text unique
acquisition_import_batch_id uuid (REQUIRED, restrict delete)
source_row_number integer
normalized_* fields (business_name, address, city, state, zip, email, phone)
domain text
business_name, address, city, state, zip, website_url text
source_payload jsonb
state_key acquisition_prospect_state 
  ('prospect'|'outreach_ready'|'outreach_sent'|'interested'|
   'application_started'|'application_submitted'|'sales_followup'|'closed')
potential_duplicate_of_id uuid
lead_id uuid (OPTIONAL, can link to leads)
business_application_id uuid
application_session_id uuid

-- Later added (0041_minimal):
source_kind text ('manual'|'ai')
provider text
industry text
enrichment_status text ('pending'|'enriching'|'enriched'|'no_match'|'failed')
enrichment_error text
enriched_at timestamptz
verified_at timestamptz
```

---

## Conflict Matrix: My 0045 vs Existing Schema

| Column | acquisition_import_rows | 0045 Addition | Conflict? | Action |
|--------|-------------------------|---------------|-----------|--------|
| batch_id | ✅ UUID ref | (no change) | ❌ None | KEEP EXISTING |
| row_number | ✅ INTEGER | (no change) | ❌ None | KEEP EXISTING |
| status | ✅ TEXT ('valid'\|'duplicate'\|'invalid'\|'imported') | (no change) | ❌ None | KEEP EXISTING |
| duplicate_reason | ✅ TEXT | (no change) | ❌ None | KEEP EXISTING |
| validation_errors | ✅ JSONB | (no change) | ❌ None | KEEP EXISTING |
| normalized_payload | ✅ JSONB | (no change) | ❌ None | KEEP EXISTING |
| raw_payload | ✅ JSONB | (no change) | ❌ None | KEEP EXISTING |
| acquisition_prospect_id | ✅ UUID ref | (no change) | ❌ None | KEEP EXISTING |
| created_at | ✅ TIMESTAMPTZ | (no change) | ❌ None | KEEP EXISTING |

| Column | acquisition_prospects | 0045 Addition | Conflict? | Action |
|--------|----------------------|---------------|-----------|--------|
| identity_key | ✅ TEXT UNIQUE | (redundant) | ✅ **CONFLICT** | KEEP EXISTING - ALREADY UNIQUE |
| source_kind | ✅ TEXT | (redundant) | ✅ **CONFLICT** | KEEP EXISTING |
| provider | ✅ TEXT | (redundant) | ✅ **CONFLICT** | KEEP EXISTING |
| enrichment_status | ✅ TEXT | (redundant) | ✅ **CONFLICT** | KEEP EXISTING |
| created_at | ✅ TIMESTAMPTZ | (redundant) | ✅ **CONFLICT** | KEEP EXISTING |
| filename | ❌ MISSING | ✅ Need to add | ✅ **ADD MISSING** | ADD: text column |
| row_number | ❌ MISSING | ✅ Need to add | ✅ **ADD MISSING** | ADD: integer column |
| batch_id | ❌ MISSING | ✅ Need to add | ✅ **ADD MISSING** | ADD: uuid ref (links back) |
| original_data | ❌ MISSING | ✅ Need to add | ✅ **ADD MISSING** | ADD: jsonb for complete row |

---

## Status Enum Mismatch (CRITICAL)

**Problem:** My code expects different status values

### CSV Parser Status Values (My Code)
```typescript
type ImportRowStatus = "valid" | "invalid" | "duplicate";
```

### Database Constraint (Existing)
```sql
status text not null check (status in ('valid', 'duplicate', 'invalid', 'imported'))
```

**Result:** ✅ MY STATUS VALUES ARE CORRECT - matches existing constraint

### Enrichment Status (Separate Field)
```
enrichment_status text default 'pending' 
  -- Can be: pending, enriching, enriched, no_match, failed
```

**Problem:** My CSV preview parser doesn't need enrichment_status (that's for research worker)

---

## Functions & RPCs Conflict

**Existing:** `import_data_prospects(p_filename, p_content_sha256, p_source_kind, p_provider, p_uploaded_by, p_rows)`
- Defined in 0041_minimal_data_schema.sql
- Takes JSONB array of rows
- Creates batch
- Returns batch result

**My Code (ingestAcquiredProspects):** 
- Calls import_data_prospects RPC
- Compatible ✅

---

## 0041 Files Analysis

| File | Status | Contains | Should Keep? |
|------|--------|----------|-------------|
| 0041_complete_data_schema_with_dependencies.sql | REDUNDANT | Full schema (bloated) | ❌ DELETE |
| 0041_data_prospect_import.sql | REDUNDANT | RPC function | ❌ DELETE |
| 0041_data_prospect_import_fixed.sql | REDUNDANT | RPC function (variation) | ❌ DELETE |
| 0041_finalize_data_views.sql | REDUNDANT | Views | ❌ DELETE |
| 0041_minimal_data_schema.sql | **CANONICAL** | Everything needed (clean) | ✅ **KEEP** |

---

## CSV/XLSX Parsing Issue

### Current Code Status Values
```typescript
// apps/dashboard/__tests__/csv/parse-and-dedup.test.ts
const validRows = rows.filter(r => r.status === 'valid');
const invalidRows = rows.filter(r => r.status === 'invalid');
const duplicateRows = rows.filter(r => r.status === 'duplicate');
```

**Issue:** Manual-import.ts returns ImportRowStatus = "valid" | "invalid" | "duplicate"
**Database expects:** 'valid' | 'duplicate' | 'invalid' | 'imported'

**Status after CSV import:** Should be 'valid'|'invalid'|'duplicate', NOT 'imported'
- 'imported' means it was inserted to acquisition_prospects
- During CSV preview: status should be 'valid'|'invalid'|'duplicate'
- After research: status becomes 'imported' when prospect is created

✅ **THIS IS CORRECT**

---

## API Routes & Column Names

### /api/data/csv-preview
- Reads: parseFile() → normalizeImportRows()
- Returns: status = 'valid'|'invalid'|'duplicate'
- Uses: normalized_payload (existing field)
- ✅ COMPATIBLE

### /api/data/csv-upload  
- Creates: acquisition_import_batches with source_kind='manual', provider='csv_upload'
- Creates: acquisition_import_rows with status='pending' (WAIT - WRONG!)
- ❌ ISSUE: Code sets status='pending' but DB expects 'valid'|'duplicate'|'invalid'

### /api/data/search
- Queries: data_prospect_records view
- Uses: enrichment_status field
- ✅ COMPATIBLE

---

## Required Fixes

### 1. DELETE Duplicate 0041 Files
```bash
# Keep only 0041_minimal_data_schema.sql
# Delete:
# - 0041_complete_data_schema_with_dependencies.sql
# - 0041_data_prospect_import.sql
# - 0041_data_prospect_import_fixed.sql
# - 0041_finalize_data_views.sql
# - 0045_consolidate_data_schema.sql (my new file - conflicts too)
```

### 2. Create NEW Migration (0046)
Instead of 0045, create 0046_data_foundation_additions.sql:
```sql
-- Only ADD missing columns, don't recreate existing ones

ALTER TABLE acquisition_import_rows
  ADD COLUMN IF NOT EXISTS original_data jsonb DEFAULT '{}'::jsonb
    COMMENT 'Complete original row from upload (before normalization)';

ALTER TABLE acquisition_prospects
  ADD COLUMN IF NOT EXISTS batch_id uuid 
    REFERENCES acquisition_import_batches(id) ON DELETE SET NULL
    COMMENT 'Original batch this prospect came from (can differ from acquisition_import_batch_id)';

ALTER TABLE acquisition_prospects
  ADD COLUMN IF NOT EXISTS filename text
    COMMENT 'Original filename (for audit trail)';

ALTER TABLE acquisition_prospects
  ADD COLUMN IF NOT EXISTS row_number integer
    COMMENT 'Original row number (for traceability)';

-- Create missing indexes
CREATE INDEX IF NOT EXISTS idx_prospects_batch_id
  ON acquisition_prospects(batch_id) WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_identity_key
  ON acquisition_prospects(identity_key);

-- Document the schema
COMMENT ON TABLE acquisition_import_batches IS
  'Batches of uploaded CSV/XLSX files. Status: previewed→confirmed→failed/cancelled.';

COMMENT ON TABLE acquisition_import_rows IS  
  'Individual rows from uploads. Status: valid/invalid/duplicate initially, then imported after prospect creation.';

COMMENT ON TABLE acquisition_prospects IS
  'DATA prospects from uploads or acquisition. enrichment_status tracks research (pending/enriching/enriched/failed). state_key tracks workflow (prospect/outreach_ready/etc). Preserved isolation: no automatic leads/outreach.';
```

### 3. Fix CSV Upload Route
```typescript
// apps/dashboard/app/api/data/csv-upload/route.ts

// WRONG (current):
const queueEntries = rows.map((row, index) => ({
  status: 'pending',  // ❌ Database doesn't accept 'pending'
}));

// CORRECT:
const normalizedRows = normalizeImportRows(rows);
const queueEntries = normalizedRows.map((row) => ({
  batch_id: batch.id,
  row_number: row.row_number,
  original_data: row, // Keep entire original row
  status: row.status, // Will be 'valid'|'invalid'|'duplicate'
  normalized_payload: {
    business_name: row.business_name,
    address: row.address,
    // ... normalized fields
  },
  validation_errors: row.errors || [],
  created_at: new Date().toISOString(),
}));
```

### 4. Update Tests
- CSV tests already expect 'valid'|'invalid'|'duplicate' ✅ GOOD
- But update to not use 'pending' status ✅ ALREADY CORRECT

### 5. Remove 0045 Migration
My 0045_consolidate_data_schema.sql creates conflicts and is redundant.
- Delete it
- Replace with smaller 0046_data_foundation_additions.sql (additions only)

---

## Critical Isolation Verification

**ISSUE FOUND:** acquisition_import_rows has `lead_id` column directly!

```sql
-- From 0036 (existing):
lead_id uuid references leads(id) on delete set null
```

**This means:** Rows can be linked to leads directly, which could bypass isolation!

**Check:** Is this actually used anywhere?
- acquisition_import_rows.lead_id is orphaned (not referenced in code)
- prospects have their own lead_id (separate)
- Research worker doesn't use it

**Action:** Document that lead_id on import_rows is legacy/unused. Actual prospect→lead link is via acquisition_prospects.lead_id only.

---

## Database State for Preview

### What's in Preview Supabase (operion-ai-mvp)?
1. Migrations 0001-0041_minimal applied
2. Tables: acquisition_import_batches, acquisition_import_rows, acquisition_prospects
3. Function: import_data_prospects(text,text,text,text,uuid,jsonb)
4. Views: data_prospect_records
5. Policies: Founder-only access

### What's NOT in Preview?
- ❌ 0042_grant_data_table_permissions
- ❌ 0043_grant_delete_permissions
- ❌ 0044_acquisition_research_tracking
- ❌ 0045_consolidate_data_schema (my file - not applied)
- ❌ 0046_data_foundation_additions (not created yet)

### Preview is Ready For:
✅ CSV upload/preview (using existing schema)
✅ Search (using existing fields)
✅ Data display (using existing fields)

### Preview Needs (P0):
⚠️ Apply 0042, 0043 to add permissions
⚠️ Apply 0044 to add research_timestamp, qualification fields
⚠️ Apply 0046 to add batch_id, filename, row_number, original_data

---

## Action Plan

1. **Delete conflicting files:**
   - [ ] rm 0041_complete_data_schema_with_dependencies.sql
   - [ ] rm 0041_data_prospect_import.sql
   - [ ] rm 0041_data_prospect_import_fixed.sql
   - [ ] rm 0041_finalize_data_views.sql
   - [ ] rm 0045_consolidate_data_schema.sql (my file)

2. **Create safe additions:**
   - [ ] Create 0046_data_foundation_additions.sql (ADD ONLY, no conflicts)

3. **Fix API routes:**
   - [ ] Update csv-upload to not set status='pending'
   - [ ] Update csv-upload to preserve original_data
   - [ ] Verify status values match DB constraints

4. **Verify isolation:**
   - [ ] Confirm acquisition_import_rows.lead_id is not used
   - [ ] Confirm import_data_prospects doesn't create leads
   - [ ] Verify acquisition_prospects links to prospects, not leads directly

5. **Test & deploy:**
   - [ ] TypeScript build clean
   - [ ] Migration test (replay on blank DB)
   - [ ] Deploy to Preview
   - [ ] Test CSV upload→search→display

---

**Status:** BLOCKED - Requires migration cleanup before Preview can verify
**Files to change:** 5 migrations + 1 API route
**Risk:** MEDIUM - Need careful column mapping
**Timeline:** 30 minutes to fix and verify
