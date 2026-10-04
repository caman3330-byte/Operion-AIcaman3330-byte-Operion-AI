# Preview Database Verification Checklist

**Status:** Ready for Preview deployment  
**Latest Commits:** 15089e9 (DATA migrations replay-safe) + 9ae2999 (explicit confirmation)  
**Local Validation:** ✅ 65 PostgreSQL checks + 44 Vitest checks + Build passing  
**Production:** ✅ Untouched  

---

## Commits to Deploy to Preview

Both commits are already in the main branch:

1. **9ae2999** - feat: require explicit DATA import confirmation
   - Adds hash-based idempotency to import_data_prospects RPC
   - Requires client to confirm batch hash before importing
   - Prevents accidental duplicate imports

2. **15089e9** - fix: make DATA migrations and import RPC replay-safe
   - Makes 0046 migration safe for replay on existing databases
   - Fixes RPC to handle edge cases
   - Ensures isolation from leads/outreach

**Action:** These commits are already on main branch (c606b98 was earlier). No branch merge needed.

---

## Preview Database Migration Steps

**CRITICAL:** These steps must be executed by someone with Supabase admin access to the Preview environment (operion-ai-mvp).

### Step 1: Connect to Preview Supabase

Use Supabase dashboard or authenticated psql:
```bash
# Via psql:
psql "postgresql://[user]:[password]@db.supabase.co:5432/operion-ai-mvp"

# Or use Supabase dashboard SQL Editor
```

### Step 2: Verify Current Migration State

```sql
-- Check which migrations are applied
SELECT version, description, success FROM _supabase_migrations 
ORDER BY version DESC 
LIMIT 20;

-- Expected: Should show 0041_minimal_data_schema and earlier
-- Should NOT show 0042, 0043, 0044, 0046 (we'll apply them)
```

### Step 3: Apply Migrations in Order

**IF 0042 is not applied:**
```sql
-- Apply 0042_grant_data_table_permissions.sql
-- (Copy entire content from repository file)
```

**IF 0043 is not applied:**
```sql
-- Apply 0043_grant_delete_permissions.sql
-- (Copy entire content from repository file)
```

**IF 0044 is not applied:**
```sql
-- Apply 0044_acquisition_research_tracking.sql
-- (Copy entire content from repository file)
```

**Apply 0046 (always):**
```sql
-- Apply 0046_data_foundation_additions.sql
-- (Copy entire content from repository file)
-- This adds: batch_id, filename, row_number, original_data columns
```

### Step 4: Verify Migrations Applied

```sql
-- Verify all new migrations in _supabase_migrations
SELECT version, description 
FROM _supabase_migrations 
WHERE version >= '0042' 
ORDER BY version;

-- Should show: 0042, 0043, 0044, 0046
```

### Step 5: Verify Table Schemas

```sql
-- Check acquisition_import_rows has all columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'acquisition_import_rows' 
ORDER BY ordinal_position;

-- Should include: id, batch_id, row_number, status, original_data, 
-- normalized_payload, raw_payload, acquisition_prospect_id, created_at

-- Check acquisition_prospects has new columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'acquisition_prospects' 
WHERE column_name IN ('batch_id', 'filename', 'row_number')
ORDER BY column_name;

-- Should show three new columns: batch_id (uuid), filename (text), row_number (int)
```

---

## Functional Verification Tests

These must be performed against the Preview deployment (after migrations applied).

### Test 1: CSV Preview Endpoint (No Persist)

**Endpoint:** `POST /api/data/csv-preview`  
**Auth:** Founder-only  
**Expected:** Parse file without creating database records

```bash
# Create test CSV
cat > test_preview.csv << 'EOF'
business_name,address,city,state,phone,email
Test Business,123 Main St,Austin,TX,512-555-1234,test@example.com
Another Co,456 Oak Ave,Dallas,TX,214-555-5678,hello@another.com
EOF

# Send preview request
curl -X POST https://operion-ai-dashboard.vercel.app/api/data/csv-preview \
  -H "Authorization: Bearer <FOUNDER_TOKEN>" \
  -F "file=@test_preview.csv"
```

**Verify Response:**
- ✅ Returns preview_id
- ✅ Returns rows_detected: 2
- ✅ Returns valid_rows: 2
- ✅ Returns sample_rows array with status='valid'
- ✅ NO database records created
  - acquisition_import_batches count unchanged
  - acquisition_import_rows count unchanged

### Test 2: Import with Hash-Based Confirmation

**Endpoint:** `POST /api/data/csv-upload`  
**Auth:** Founder-only  
**Expected:** Create batch and rows ONLY with exact preview hash

```bash
# Step 1: Get preview (from Test 1)
RESPONSE=$(curl -X POST ... /api/data/csv-preview ...)
PREVIEW_ID=$(echo $RESPONSE | jq -r '.preview_id')

# Step 2: Confirm import with preview_id
curl -X POST https://operion-ai-dashboard.vercel.app/api/data/csv-upload \
  -H "Authorization: Bearer <FOUNDER_TOKEN>" \
  -F "file=@test_preview.csv" \
  -F "preview_id=$PREVIEW_ID"
```

**Verify Response:**
- ✅ Returns batch_id
- ✅ Returns batch_code
- ✅ Returns total_rows: 2
- ✅ Returns valid_rows: 2
- ✅ Returns summary message

**Verify Database:**
```sql
-- Check batch created
SELECT id, batch_code, original_filename, status, total_rows, valid_rows 
FROM acquisition_import_batches 
WHERE batch_code LIKE 'CSV-%' 
ORDER BY created_at DESC LIMIT 1;

-- Should show: status='confirmed', total_rows=2, valid_rows=2

-- Check rows created with correct status
SELECT row_number, status, original_data, acquisition_prospect_id 
FROM acquisition_import_rows 
WHERE batch_id = '<batch_id_from_above>'
ORDER BY row_number;

-- Should show: 
--   Row 1: status='valid', original_data populated, acquisition_prospect_id NULL
--   Row 2: status='valid', original_data populated, acquisition_prospect_id NULL

-- Verify original_data preserved
SELECT original_data->>'business_name' as business_name,
       original_data->>'email' as email
FROM acquisition_import_rows 
WHERE batch_id = '<batch_id_from_above>';

-- Should show: Test Business / Another Co with their original emails
```

### Test 3: Handle Invalid and Duplicate Rows

**Test Data:** Create CSV with invalid and duplicate rows

```bash
cat > test_mixed.csv << 'EOF'
business_name,address,city,state,phone,email
Valid Co,123 Main,Austin,TX,512-1111,valid@test.com
Invalid Row,,,,
Valid Co,123 Main,Austin,TX,512-1111,valid@test.com
EOF

# Upload and verify
curl -X POST /api/data/csv-upload ... -F "file=@test_mixed.csv"
```

**Verify Database:**
```sql
-- Check row statuses
SELECT row_number, status, original_data->>'business_name' as business_name
FROM acquisition_import_rows 
WHERE batch_id = '<batch_id>'
ORDER BY row_number;

-- Should show:
--   Row 1: status='valid'
--   Row 2: status='invalid'  (missing required fields)
--   Row 3: status='duplicate' (matches row 1 by identity)

-- Verify ALL rows preserved (not deleted)
SELECT COUNT(*) FROM acquisition_import_rows WHERE batch_id = '<batch_id>';
-- Should return 3 (all rows, including invalid and duplicate)
```

### Test 4: Search and Pagination

**Endpoint:** `GET /api/data/search`  
**Auth:** Founder-only  
**Expected:** Return prospects from imports with working filters

```bash
# Search by business name
curl -X GET "https://operion-ai-dashboard.vercel.app/api/data/search?q=test" \
  -H "Authorization: Bearer <FOUNDER_TOKEN>"

# Expected response:
# {
#   "total": 1,
#   "returned": 1,
#   "limit": 50,
#   "offset": 0,
#   "results": [
#     {
#       "id": "...",
#       "business_name": "Test Business",
#       "source_kind": "manual",
#       "provider": "csv_upload",
#       ...
#     }
#   ]
# }
```

**Verify:**
- ✅ Returns results matching search query
- ✅ Includes source_kind and provider
- ✅ Total count accurate
- ✅ Pagination works (try ?limit=1&offset=0 then ?limit=1&offset=1)
- ✅ Filters work (try ?source=csv_upload)

### Test 5: Critical Isolation - NO Leads Created

**Verify:** Acquisition and import create DATA only, never leads

```sql
-- Check no leads created during import
SELECT COUNT(*) as lead_count 
FROM leads 
WHERE created_at > NOW() - INTERVAL '5 minutes';

-- Should return 0

-- Check no outreach campaigns created
SELECT COUNT(*) as campaign_count 
FROM outreach_campaigns 
WHERE created_at > NOW() - INTERVAL '5 minutes';

-- Should return 0

-- Check no applications created
SELECT COUNT(*) as app_count 
FROM business_applications 
WHERE created_at > NOW() - INTERVAL '5 minutes';

-- Should return 0

-- Check only acquisition_prospects created
SELECT COUNT(*) as prospect_count 
FROM acquisition_prospects 
WHERE created_at > NOW() - INTERVAL '5 minutes';

-- Should return > 0 (from CSV imports)

-- Verify prospects have NO auto-linked leads
SELECT COUNT(*) as linked_count 
FROM acquisition_prospects 
WHERE lead_id IS NOT NULL 
AND created_at > NOW() - INTERVAL '5 minutes';

-- Should return 0 (no automatic linking)
```

### Test 6: Idempotency - Repeated Imports

**Test:** Sending same preview twice should return same batch_id

```bash
# Import with preview_id (from Test 2)
BATCH_1=$(curl -X POST /api/data/csv-upload ... | jq -r '.batch_id')

# Import AGAIN with same preview_id and file
BATCH_2=$(curl -X POST /api/data/csv-upload ... | jq -r '.batch_id')

# Verify same batch returned
if [ "$BATCH_1" = "$BATCH_2" ]; then
  echo "✅ PASS: Idempotent - same batch returned"
else
  echo "❌ FAIL: Different batches returned"
fi
```

---

## Blockers & Dependencies

### What I Cannot Do (User/Admin Required)

❌ Access Supabase database directly  
❌ Apply migrations to Preview  
❌ Trigger Vercel Preview deployment  
❌ Modify Preview environment variables  

### What User Must Do

✅ Apply migrations 0042, 0043, 0044, 0046 to Preview Supabase  
✅ Verify migrations applied successfully  
✅ Run functional tests against Preview  
✅ Confirm no leads/outreach created  

### What's Already Done

✅ Code changes committed (9ae2999, 15089e9)  
✅ Local tests pass (65 PostgreSQL + 44 Vitest)  
✅ Build passes  
✅ Production untouched  
✅ Preview service-role key exists (encrypted)  

---

## Success Criteria

✅ **Migration Chain:**
- All migrations 0041-0046 apply without errors
- No schema conflicts
- All new columns exist

✅ **CSV Preview:**
- Parses files without persisting
- Returns accurate statistics
- No database changes on preview request

✅ **CSV Import:**
- Creates batch and rows with correct status
- Preserves original_data
- Hash-based confirmation works

✅ **Row Handling:**
- Valid rows: status='valid'
- Invalid rows: status='invalid' (preserved, not deleted)
- Duplicate rows: status='duplicate' (preserved, not deleted)

✅ **Isolation:**
- No leads created
- No outreach campaigns created
- No emails sent
- No applications created
- Only acquisition_prospects modified

✅ **Search:**
- Returns imported prospects
- Pagination works
- Filters work

✅ **Production:**
- Completely untouched
- No redeployment
- No credential changes

---

## Exact Report Required

After completing Preview verification, report:

1. **Migration Status:** Which migrations applied successfully (0041-0046)
2. **CSV Upload:** Did preview and import work as expected?
3. **Row Handling:** Were valid/invalid/duplicate rows handled correctly?
4. **Isolation:** Confirmed no leads/outreach/campaigns created?
5. **Search:** Did search and pagination work?
6. **Blockers:** Any errors or issues encountered?

**Format:** "Migration 0042 ✅, 0043 ✅, 0044 ✅, 0046 ✅. CSV preview ✅. Import ✅. Rows ✅. Isolation ✅. Search ✅. No blockers."

---

**Status:** Code ready for Preview verification  
**Latest Commit:** 15089e9 - DATA migrations replay-safe  
**Next Step:** User applies migrations to Preview Supabase and runs verification tests
