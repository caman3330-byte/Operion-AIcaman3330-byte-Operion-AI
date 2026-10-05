# Preview Runtime Test Plan - DATA Workflow

**Preview URL:** https://operion-ai-dashboard-6f9o9pk6b-operion-ai-s-projects.vercel.app/data/manual-upload  
**Test File:** C:\Users\Asus\Desktop\10-4-2026.xlsx (21 rows, headerless)  
**Status:** Awaiting authenticated Preview access

---

## Test Procedure

### 1. Navigate to Manual Upload
- URL: `/data/manual-upload`
- Expected: Upload form appears
- File select button: "Choose CSV or XLSX"

### 2. Upload Test File (10-4-2026.xlsx)
- Select file: C:\Users\Asus\Desktop\10-4-2026.xlsx
- System should:
  - Detect headerless format
  - Apply positional mapping
  - Show preview with parsed data

---

## Verification Checklist

### ✓ 1. Headerless XLSX Positional Mapping
**Expected Behavior:**
- File has NO header row (21 business entries directly)
- Parser detects headerless (no recognized column aliases)
- Uses positionalRow() mapping:
  - Column A (1st): business_name
  - Column B (2nd): address
  - Column C (3rd): city (if present)
  - ...
  - Column J (10th): owner_name (if present)

**Verification:**
- [ ] Preview shows "business_name" column populated from column A
- [ ] Preview shows "address" column populated from column B
- [ ] Owner names appear (if in column J)

**Expected Output:**
```
21 rows detected
business_name | address | city | state | zip | owner_name | status
[parsed rows...]
```

---

### ✓ 2. Owner Name Preservation
**Expected Behavior:**
- Owner names from column J preserved through preview
- Shown in "Owner" column in preview table
- Preserved in import to database

**Verification:**
- [ ] Preview table shows "Owner" column
- [ ] Owner names visible where present in source file
- [ ] Owner names survive to import (checked after confirmation)

**Expected Output:**
```
Preview table columns: Row | Business | Location | Contact | Owner | Status
[rows with owner names filled]
```

---

### ✓ 3. Preview Performs No Database Writes
**Expected Behavior:**
- Preview is read-only operation
- Queries existing duplicates only
- No batch creation
- No prospect creation
- No row creation

**Verification:**
- [ ] Preview loads quickly (read-only speed)
- [ ] Exact same preview appears if shown again
- [ ] No count changes in `/data` section after preview
- [ ] No new batches appear in database

**Expected Output:**
- Preview response includes: `preview_id` (SHA256 hash)
- Status message: "The file was parsed without writing records"
- No "batch created" message

---

### ✓ 4. Exact-File Confirmation Required
**Expected Behavior:**
- Preview generates `preview_id` (SHA256 hash of rawRows)
- Import endpoint requires exact `preview_id` match
- Any file difference → 409 Conflict error

**Verification:**
- [ ] Preview shows `preview_id` or includes in response
- [ ] Clicking "Confirm DATA import" requires matching hash
- [ ] If file changed → error "Confirm the exact file preview before importing"
- [ ] Cannot import without confirmed preview

**Expected Output:**
- Preview response: `preview_id: "abc123..."`
- Import requires: `preview_id` parameter
- Mismatched hash: HTTP 409 "Confirm the exact file preview before importing"

---

### ✓ 5. Import Creates DATA Prospects and Provenance Only
**Expected Behavior:**
- Import creates:
  - ✅ acquisition_import_batches (batch metadata)
  - ✅ acquisition_import_rows (all rows: valid + invalid + duplicate)
  - ✅ acquisition_prospects (valid rows only)
- Preserves:
  - ✅ original_data (raw row before normalization)
  - ✅ raw_payload (complete row data)
  - ✅ normalized_payload (normalized fields)
  - ✅ business_name, address, owner_name, etc.
  - ✅ identity_key (for deduplication)
  - ✅ source_kind: "manual"
  - ✅ provider: "csv_upload"

**Verification:**
- [ ] Import response: `"success": true`
- [ ] Response includes: `batch_id`, `batch_code`, `total_rows`, `valid_rows`
- [ ] Response includes: counts for invalid_rows, duplicate_rows
- [ ] Import message: "No leads or outreach were created"
- [ ] Prospects appear in `/data/manual-upload` tab

**Expected Output:**
```json
{
  "success": true,
  "batch_id": "uuid...",
  "batch_code": "DATA-20261005-...",
  "total_rows": 21,
  "valid_rows": 20 (or less if invalid),
  "invalid_rows": 0,
  "duplicate_rows": 0,
  "missing_email": X,
  "missing_phone": Y,
  "message": "Confirmed 21 rows for DATA research: 20 valid, 0 invalid, 0 duplicates. No leads or outreach were created."
}
```

---

### ✓ 6. No Leads, Applications, Emails, or Outreach Created
**Expected Behavior:**
- Import creates ONLY:
  - ✅ Data prospects (records)
  - ✅ Import batches (metadata)
  - ✅ Import rows (audit trail)
- Does NOT create:
  - ❌ leads
  - ❌ business_applications
  - ❌ outreach_campaigns
  - ❌ outreach_sequences
  - ❌ emails (SendGrid not called)

**Verification:**
- [ ] Prospects appear in `/data/manual-upload` (not `/leads`)
- [ ] No automatic email notifications
- [ ] No entries in `/outreach`
- [ ] Response explicitly states "No leads or outreach were created"

**Expected Output:**
- Prospects in `/data/manual-upload` tab
- Status: "imported" (not "ready_for_outreach")
- enrichment_status: "pending" (awaiting enrichment)
- No automatic actions taken

---

### ✓ 7. Errors Are Clear and User-Facing
**Expected Behavior:**
- Invalid rows reported with specific error messages
- Missing required fields flagged
- Invalid emails/phones noted
- User receives actionable feedback

**Verification - Test Invalid Row:**
- [ ] Add row with empty business_name
- [ ] Expected error: "Business Name is required"
- [ ] Error appears in preview, not as server error
- [ ] Invalid row marked in preview

**Verification - Test Invalid Email:**
- [ ] Add row with invalid email format
- [ ] Expected error: "Email is not valid" or similar
- [ ] Row still imported (status: "invalid")
- [ ] Error message clear

**Expected Output:**
```
Invalid Row #X:
- Business Name is required
- Email is not valid

Status: invalid
Preview shows: ❌ [error message]
```

---

### ✓ 8. Search and Duplicate Handling Work
**Expected Behavior - Search:**
- `/data/manual-upload` shows imported prospects
- Search by business name, address, email, phone
- Pagination works (25 per page)
- Filters work (source, status, industry, etc.)

**Expected Behavior - Duplicates:**
- If same business imported twice → marked as duplicate
- identity_key used for duplicate detection (business_name + address + city/state/zip)
- Duplicate row preserved in audit trail
- Reason shown: "business_location: existing prospect"

**Verification - Search:**
- [ ] Navigate to `/data/manual-upload`
- [ ] Imported businesses appear in list
- [ ] Search by business name → finds record
- [ ] Filter by source: "Manual" → shows uploaded businesses

**Verification - Duplicates:**
- [ ] Upload same file again
- [ ] Second import shows all rows as "duplicate"
- [ ] Reason: "business_location: existing prospect"
- [ ] First batch: 21 valid
- [ ] Second batch: 21 duplicate

**Expected Output - Search:**
```
Manual Upload businesses
Total: 21
Search: "Acme" → 1 result found
Filter by: Source=Manual → 21 results
```

**Expected Output - Duplicates:**
```
Second Upload Summary:
total_rows: 21
valid_rows: 0
duplicate_rows: 21
invalid_rows: 0
duplicate_reason: "business_location: existing prospect"
```

---

## Response Format

After testing each component, report:

```
✅ Component 1: Headerless XLSX positional mapping
   Result: PASS (business names, addresses, owner names parsed correctly)
   
✅ Component 2: Owner name preservation
   Result: PASS (owner names preserved in preview and import)
   
✅ Component 3: Preview performs no database writes
   Result: PASS (same preview appears on reload, no batch created)
   
✅ Component 4: Exact-file confirmation required
   Result: PASS (preview_id provided, import requires exact match)
   
✅ Component 5: Import creates DATA prospects and provenance only
   Result: PASS (batch created with 21 rows, original_data preserved)
   
✅ Component 6: No leads, applications, emails, or outreach created
   Result: PASS (prospects in /data only, no auto actions)
   
✅ Component 7: Errors are clear and user-facing
   Result: PASS (invalid row shows specific error messages)
   
✅ Component 8: Search and duplicate handling work
   Result: PASS (search finds businesses, duplicates detected on re-import)

OVERALL RESULT: ALL COMPONENTS PASSING
```

---

## If Code Issue Found

If any component fails:

1. **Document the failure:**
   - Component name
   - Expected vs actual behavior
   - Steps to reproduce
   - Exact error message

2. **Fix the code:**
   - Identify root cause
   - Make minimal change
   - Verify fix locally (typecheck, lint, build)

3. **Commit and deploy:**
   - Create commit with fix
   - Run `npm run build` to verify
   - Deploy to Preview (new version)

4. **Report results:**
   - Component name
   - What was wrong
   - How it was fixed
   - New Preview URL
   - Re-test to confirm

---

## Test Data Details

**File:** C:\Users\Asus\Desktop\10-4-2026.xlsx
- Format: XLSX (Excel)
- Headers: NONE (headeless)
- Rows: 21 business entries
- Columns: 
  - Col A: business_name
  - Col B: address
  - Col C: city (optional)
  - Col D: state (optional)
  - Col E: ZIP (optional)
  - ...
  - Col J: owner_name (optional)

**Expected Parse:**
- 21 rows detected
- business_name populated from Column A
- address populated from Column B
- owner_name populated from Column J (if present)
- All rows should be valid (assuming data quality)

---

**Status:** Ready for authenticated Preview testing

**Next Action:** User signs into Preview with founder credentials, then tests components 1-8 using the test file
