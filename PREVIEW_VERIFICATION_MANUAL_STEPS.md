# Preview Verification - Manual Steps Required

**Status:** CODE READY ✅ | STAGING VERIFICATION BLOCKED ⏸️  
**Blocker:** Supabase admin access required to apply migrations  
**Latest Commit:** 79cf14a - Headerless XLSX and owner-name support  
**Preview Deployment:** https://operion-ai-dashboard-79uexwrrw-operion-ai-s-projects.vercel.app  

---

## Access Requirement

The Preview deployment requires Vercel authentication (HTTP 302 redirect). Since credentials cannot be used in chat, verification must be completed by someone with:

1. **Supabase Admin Access** - To apply migrations to the `operion-ai-staging` database
2. **Vercel Preview Authentication** - To test API endpoints against the Preview deployment
3. **Direct Database Access** - To verify migration application and table schemas

---

## Exact Manual Steps Required

### Phase 1: Apply Migrations to Preview Supabase

**Location:** Supabase Console → `operion-ai-staging` project → SQL Editor

#### Step 1a: Verify Current Migration State

Copy and execute in Supabase SQL Editor:

```sql
SELECT version, description, success FROM _supabase_migrations 
WHERE version >= '0040'
ORDER BY version;
```

**Expected Result:**
```
0040_transactional_acquisition_submission
0041_minimal_data_schema
(0042, 0043, 0044, 0046 should NOT be present yet)
```

#### Step 1b: Apply Migration 0042

**Location:** Repository file `packages/database/migrations/0042_grant_data_table_permissions.sql`

1. Open the file in text editor
2. Copy entire contents
3. Paste into Supabase SQL Editor
4. Click "Run"

**Expected Result:** No errors, `_supabase_migrations` updated with 0042

**Verify:**
```sql
SELECT version FROM _supabase_migrations WHERE version = '0042';
-- Should return one row: 0042
```

#### Step 1c: Apply Migration 0043

**Location:** Repository file `packages/database/migrations/0043_grant_delete_permissions.sql`

1. Open the file in text editor
2. Copy entire contents
3. Paste into Supabase SQL Editor
4. Click "Run"

**Expected Result:** No errors, `_supabase_migrations` updated with 0043

#### Step 1d: Apply Migration 0044

**Location:** Repository file `packages/database/migrations/0044_acquisition_research_tracking.sql`

1. Open the file in text editor
2. Copy entire contents
3. Paste into Supabase SQL Editor
4. Click "Run"

**Expected Result:** No errors, columns added to acquisition_import_rows and acquisition_prospects

**Verify Column Addition:**
```sql
-- Check new columns exist on acquisition_import_rows
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'acquisition_import_rows' 
AND column_name IN ('researched_data', 'qualification_score', 'qualification_status', 'research_timestamp', 'error_message')
ORDER BY column_name;

-- Should return 5 rows with those column names
```

#### Step 1e: Apply Migration 0046

**Location:** Repository file `packages/database/migrations/0046_data_foundation_additions.sql`

1. Open the file in text editor
2. Copy entire contents
3. Paste into Supabase SQL Editor
4. Click "Run"

**Expected Result:** No errors, new columns added to acquisition_prospects and acquisition_import_rows

**Verify Column Addition:**
```sql
-- Check new columns on acquisition_prospects
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'acquisition_prospects' 
AND column_name IN ('batch_id', 'filename', 'row_number')
ORDER BY column_name;

-- Should return 3 rows

-- Check new column on acquisition_import_rows
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'acquisition_import_rows' 
AND column_name = 'original_data';

-- Should return 1 row
```

#### Step 1f: Apply Migration 0047

**Location:** Repository file `packages/database/migrations/0047_data_owner_name.sql`

Copy the entire file into the same SQL Editor and click **Run**. This adds the optional `owner_name` field and refreshes the DATA view so an owner supplied in the workbook is preserved.

**Expected Result:** No errors. The `owner_name` column exists on `acquisition_prospects`.

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'acquisition_prospects'
  AND column_name = 'owner_name';
-- Should return one row: owner_name | text
```

#### Step 1g: Final Migration Verification

Execute in Supabase SQL Editor:

```sql
SELECT version, description FROM _supabase_migrations 
WHERE version >= '0040'
ORDER BY version;
```

**Expected Result:**
```
0040_transactional_acquisition_submission
0041_minimal_data_schema
0042_grant_data_table_permissions
0043_grant_delete_permissions
0044_acquisition_research_tracking
0046_data_foundation_additions
0047_data_owner_name
```

**✅ If all 7 migrations show: MIGRATION PHASE COMPLETE**

---

### Phase 2: Verify DATA Tables and Columns

Execute in Supabase SQL Editor:

```sql
-- Verify key tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public'
AND table_name IN ('acquisition_import_batches', 'acquisition_import_rows', 'acquisition_prospects')
ORDER BY table_name;

-- Should return 3 tables

-- Verify key columns exist on acquisition_import_rows
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'acquisition_import_rows'
AND column_name IN ('id', 'batch_id', 'row_number', 'status', 'original_data', 'normalized_payload', 'raw_payload', 'acquisition_prospect_id', 'created_at')
ORDER BY column_name;

-- Should return 9 columns with correct data types

-- Verify key columns exist on acquisition_prospects
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'acquisition_prospects'
AND column_name IN ('id', 'identity_key', 'business_name', 'batch_id', 'filename', 'row_number', 'source_kind', 'provider', 'enrichment_status', 'state_key', 'lead_id', 'created_at')
ORDER BY column_name;

-- Should return 12 columns
```

**✅ If all columns exist with correct types: TABLE STRUCTURE VERIFIED**

---

### Phase 3: Test CSV/XLSX Preview (API Test)

**Prerequisites:**
- User must be authenticated as founder
- Preview deployment must be accessible
- Authorization header must include valid founder token

**Test Command:**

```bash
# Create test CSV
cat > test_preview.csv << 'EOF'
business_name,address,city,state,phone,email
Test Business,123 Main St,Austin,TX,512-555-1234,test@example.com
Another Co,456 Oak Ave,Dallas,TX,214-555-5678,hello@another.com
EOF

# Send preview request (user must provide valid founder token)
curl -X POST \
  "https://operion-ai-dashboard-iqrlapkwv-operion-ai-s-projects.vercel.app/api/data/csv-preview" \
  -H "Authorization: Bearer <FOUNDER_TOKEN_HERE>" \
  -F "file=@test_preview.csv"
```

**Expected Response:**
```json
{
  "preview_id": "abc123...",
  "filename": "test_preview.csv",
  "rows_detected": 2,
  "valid_rows": 2,
  "invalid_rows": 0,
  "duplicate_rows": 0,
  "missing_email": 0,
  "missing_phone": 0,
  "sample_rows": [
    {
      "row_number": 1,
      "business_name": "Test Business",
      "status": "valid"
    },
    {
      "row_number": 2,
      "business_name": "Another Co",
      "status": "valid"
    }
  ],
  "summary": "2 row(s) detected • 2 valid • 0 invalid • 0 duplicate(s)"
}
```

**✅ If response shows preview_id and correct statistics: CSV PREVIEW WORKS**

**⚠️ CRITICAL:** Verify NO database records created:

```sql
-- In Supabase SQL Editor, execute immediately after preview:
SELECT COUNT(*) as batch_count FROM acquisition_import_batches 
WHERE filename = 'test_preview.csv';

-- Should return 0 (preview doesn't persist)

SELECT COUNT(*) as row_count FROM acquisition_import_rows 
WHERE batch_id IN (
  SELECT id FROM acquisition_import_batches 
  WHERE filename = 'test_preview.csv'
);

-- Should return 0 (preview doesn't persist rows)
```

---

### Phase 4: Test CSV/XLSX Import with Hash Confirmation

**Test Command:**

```bash
# Send import request with preview_id from Phase 3
curl -X POST \
  "https://operion-ai-dashboard-iqrlapkwv-operion-ai-s-projects.vercel.app/api/data/csv-upload" \
  -H "Authorization: Bearer <FOUNDER_TOKEN_HERE>" \
  -F "file=@test_preview.csv" \
  -F "preview_id=<PREVIEW_ID_FROM_PHASE_3>"
```

**Expected Response:**
```json
{
  "success": true,
  "batch_id": "uuid...",
  "batch_code": "CSV-...",
  "filename": "test_preview.csv",
  "total_rows": 2,
  "valid_rows": 2,
  "invalid_rows": 0,
  "duplicate_rows": 0,
  "missing_email": 0,
  "missing_phone": 0,
  "message": "Imported 2 rows: 2 valid, 0 invalid, 0 duplicates."
}
```

**✅ If response includes batch_id and correct counts: CSV IMPORT WORKS**

**Verify Database Changes:**

```sql
-- Check batch created
SELECT id, batch_code, original_filename, status, total_rows, valid_rows 
FROM acquisition_import_batches 
WHERE batch_code LIKE 'CSV-%' 
ORDER BY created_at DESC LIMIT 1;

-- Should show batch with status='confirmed'

-- Check rows created with status='valid'
SELECT row_number, status 
FROM acquisition_import_rows 
WHERE batch_id = '<batch_id_from_import_response>'
ORDER BY row_number;

-- Should return 2 rows: both with status='valid'

-- Verify original_data preserved
SELECT COUNT(*) as original_data_count
FROM acquisition_import_rows 
WHERE batch_id = '<batch_id_from_import_response>'
AND original_data IS NOT NULL;

-- Should return 2
```

**✅ If rows created with correct status and original_data: IMPORT DATA VALID**

---

### Phase 5: Test Invalid and Duplicate Row Handling

**Test Command:**

```bash
# Create mixed CSV
cat > test_mixed.csv << 'EOF'
business_name,address,city,state,phone,email
Valid Co,123 Main,Austin,TX,512-1111,valid@test.com
Invalid Row,,,,
Valid Co,123 Main,Austin,TX,512-1111,valid@test.com
EOF

# Send preview
curl -X POST \
  "https://operion-ai-dashboard-iqrlapkwv-operion-ai-s-projects.vercel.app/api/data/csv-preview" \
  -H "Authorization: Bearer <FOUNDER_TOKEN_HERE>" \
  -F "file=@test_mixed.csv"
```

**Expected Response:**
- rows_detected: 3
- valid_rows: 1
- invalid_rows: 1
- duplicate_rows: 1

**Verify in Database:**

```sql
-- After importing with confirmation
SELECT row_number, status, original_data->>'business_name' as name
FROM acquisition_import_rows 
WHERE batch_id = '<new_batch_id>'
ORDER BY row_number;

-- Should return:
-- Row 1: status='valid', name='Valid Co'
-- Row 2: status='invalid', name='Invalid Row'
-- Row 3: status='duplicate', name='Valid Co'

-- Verify ALL rows preserved (count = 3)
SELECT COUNT(*) FROM acquisition_import_rows 
WHERE batch_id = '<new_batch_id>';

-- Should return 3
```

**✅ If all 3 rows exist with correct status: ROW HANDLING CORRECT**

---

### Phase 6: Test Search and Pagination

**Test Command:**

```bash
# Search for imported businesses
curl -X GET \
  "https://operion-ai-dashboard-iqrlapkwv-operion-ai-s-projects.vercel.app/api/data/search?q=valid&limit=10&offset=0" \
  -H "Authorization: Bearer <FOUNDER_TOKEN_HERE>"
```

**Expected Response:**
```json
{
  "total": 1,
  "returned": 1,
  "limit": 10,
  "offset": 0,
  "results": [
    {
      "id": "uuid...",
      "business_name": "Valid Co",
      "source_kind": "manual",
      "provider": "csv_upload",
      "created_at": "2026-10-04T...",
      ...
    }
  ]
}
```

**✅ If search returns results with correct fields: SEARCH WORKS**

**Test Pagination:**

```bash
# Test offset
curl -X GET \
  "https://operion-ai-dashboard-iqrlapkwv-operion-ai-s-projects.vercel.app/api/data/search?limit=1&offset=0" \
  -H "Authorization: Bearer <FOUNDER_TOKEN_HERE>"

# Should return first result

# Then test offset=1
curl -X GET \
  "https://operion-ai-dashboard-iqrlapkwv-operion-ai-s-projects.vercel.app/api/data/search?limit=1&offset=1" \
  -H "Authorization: Bearer <FOUNDER_TOKEN_HERE>"

# Should return second result if exists
```

**✅ If pagination returns correct records: PAGINATION WORKS**

---

### Phase 7: Verify Isolation (Critical)

**Verify NO Leads Created:**

```sql
SELECT COUNT(*) as lead_count 
FROM leads 
WHERE created_at > NOW() - INTERVAL '1 hour';

-- Should return 0 (no leads created during testing)
```

**Verify NO Applications Created:**

```sql
SELECT COUNT(*) as app_count 
FROM business_applications 
WHERE created_at > NOW() - INTERVAL '1 hour';

-- Should return 0
```

**Verify NO Outreach Campaigns:**

```sql
SELECT COUNT(*) as campaign_count 
FROM outreach_campaigns 
WHERE created_at > NOW() - INTERVAL '1 hour';

-- Should return 0
```

**Verify NO Outreach Sequences:**

```sql
SELECT COUNT(*) as sequence_count 
FROM outreach_sequences 
WHERE created_at > NOW() - INTERVAL '1 hour';

-- Should return 0
```

**Verify Prospects Created (Correct):**

```sql
SELECT COUNT(*) as prospect_count 
FROM acquisition_prospects 
WHERE created_at > NOW() - INTERVAL '1 hour'
AND source_kind = 'manual';

-- Should return > 0 (prospects created)
```

**Verify NO Auto-Linked Leads:**

```sql
SELECT COUNT(*) as auto_linked 
FROM acquisition_prospects 
WHERE lead_id IS NOT NULL
AND created_at > NOW() - INTERVAL '1 hour';

-- Should return 0 (no automatic linking)
```

**✅ If all isolation checks pass: ACQUISITION ISOLATED FROM LEADS/OUTREACH**

---

## Summary Verification Report Template

After completing all phases, report:

```
=== PREVIEW VERIFICATION COMPLETE ===

Migration Phase:
✅ 0042 applied
✅ 0043 applied
✅ 0044 applied
✅ 0046 applied
✅ All columns verified

CSV/XLSX Preview:
✅ Returns statistics correctly
✅ No database writes on preview

CSV/XLSX Import:
✅ Creates batch with status='confirmed'
✅ Creates rows with correct status
✅ Preserves original_data

Row Handling:
✅ Valid rows status='valid'
✅ Invalid rows status='invalid' (preserved)
✅ Duplicate rows status='duplicate' (preserved)

Search & Pagination:
✅ Search returns correct results
✅ Pagination works (limit/offset)
✅ Filters work (source, status)

Isolation:
✅ No leads created
✅ No applications created
✅ No outreach campaigns created
✅ No outreach sequences created
✅ Prospects created correctly
✅ No auto-linked leads

RESULT: ✅ ALL VERIFICATION CHECKS PASSED

First Blocker: [None found / Describe exact blocker]
```

---

## If Blocked

**If Supabase admin access unavailable:**
- Document which phase blocked
- Provide exact SQL statement that needs to be executed
- Suggest deferring to someone with admin credentials

**If Preview authentication unavailable:**
- Document which API test failed
- Suggest completing manual database verification only
- Provide summary of what still needs API testing

**If any SQL query fails:**
- Copy exact error message
- State which migration/verification step failed
- Provide next diagnostic SQL command

---

**Status:** All code ready | Awaiting user execution of manual verification steps

**Credentials Required:** Supabase admin access to operion-ai-mvp + Vercel Preview auth token

**Next Action:** Complete Phase 1-7 steps in order and report results
