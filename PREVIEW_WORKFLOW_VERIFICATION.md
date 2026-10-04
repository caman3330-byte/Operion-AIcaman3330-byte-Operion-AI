# Preview DATA Workflow Verification

**Status:** Awaiting authenticated Preview access  
**Latest Commit:** 985944f - Explicit data prospect lead promotion  
**Test File:** `C:\Users\Asus\Desktop\10-4-2026.xlsx` (21-row registry, headerless)  
**Preview URL:** https://operion-ai-dashboard-m5qlwi9da-operion-ai-s-projects.vercel.app/data/manual-upload

---

## Workflow Checklist

### 1. Registry File Parsing
**Objective:** Verify 10-4-2026.xlsx headerless detection and positional mapping

**Procedure:**
1. Navigate to `/data/manual-upload`
2. Click "Choose CSV or XLSX"
3. Select `C:\Users\Asus\Desktop\10-4-2026.xlsx`
4. Observe preview loading

**Expected:**
- ✅ File detects as headerless (no recognized headers)
- ✅ Preview shows 21 rows detected
- ✅ Columns 1-2 mapped: business_name, address
- ✅ Column 10 mapped: owner_name (if present)
- ✅ All sample rows show correct parsing

**Verify in UI:**
- Preview table shows:
  - Row numbers
  - Business names
  - Addresses
  - Owner names (if filled)
  - Status: "valid", "invalid", or "duplicate"

---

### 2. Owner Name Preservation
**Objective:** Verify owner_name field captured end-to-end

**Procedure:**
1. In preview, check sample_rows for owner_name column
2. Look for any rows where column 10 (owner_name) has values
3. Note preview_id displayed at top

**Expected:**
- ✅ Owner names visible in preview table (where present)
- ✅ Preview includes rows with and without owner_name
- ✅ Field preserved throughout preview and import

**Verify in UI:**
- "Owner" column in preview table shows:
  - Business owner names (e.g., "John Smith")
  - "—" (dash) for rows without owner_name

---

### 3. Preview & Exact Confirmation
**Objective:** Verify preview doesn't persist and import requires hash match

**Procedure:**
1. Review preview statistics:
   - Total rows
   - Valid rows
   - Invalid rows
   - Duplicate rows
   - Missing email/phone counts
2. Note the exact statistics
3. Scroll to "Import safeguard" section
4. Confirm message: "Review the sample rows before confirming. Confirmation queues DATA rows only; it does not create leads, applications, or outreach messages."

**Expected:**
- ✅ Preview shows accurate row counts
- ✅ Preview message states "no leads, applications, or outreach messages"
- ✅ Import safeguard section visible with "Confirm DATA import" button
- ✅ Preview did NOT create any database records yet (will verify after import)

---

### 4. DATA-Only Import
**Objective:** Verify import creates acquisition_prospects only

**Procedure:**
1. Click "Confirm DATA import" button
2. Wait for completion message
3. Observe success response with:
   - batch_id (UUID)
   - batch_code (DATA-...)
   - Row counts summary
   - Message: "No leads or outreach were created."

**Expected:**
- ✅ Import completes successfully
- ✅ Response includes batch_id and batch_code
- ✅ Row counts match preview exactly
- ✅ Message explicitly states "No leads or outreach were created."

**Database Verification (if SQL access available):**
```sql
-- Verify batch created
SELECT id, batch_code, original_filename, total_rows, valid_rows
FROM acquisition_import_batches 
WHERE original_filename = '10-4-2026.xlsx'
ORDER BY created_at DESC LIMIT 1;

-- Verify rows created (all rows, including invalid/duplicate)
SELECT COUNT(*) as total_import_rows, 
       COUNT(*) FILTER (WHERE status = 'valid') as valid,
       COUNT(*) FILTER (WHERE status = 'invalid') as invalid,
       COUNT(*) FILTER (WHERE status = 'duplicate') as duplicate
FROM acquisition_import_rows 
WHERE batch_id = '<batch_id>';

-- Verify prospects created (valid rows only)
SELECT COUNT(*) as prospect_count FROM acquisition_prospects
WHERE acquisition_import_batch_id = '<batch_id>';

-- Verify owner_name preserved
SELECT COUNT(*) as with_owner_name FROM acquisition_prospects
WHERE acquisition_import_batch_id = '<batch_id>'
AND owner_name IS NOT NULL;
```

---

### 5. Provider Enrichment
**Objective:** Verify DATA prospects ready for enrichment

**Procedure:**
1. In `/data/manual-upload` results, search for uploaded business
2. Click on a prospect to view details
3. Check enrichment_status (should be "pending")
4. Check for "Enrich" button

**Expected:**
- ✅ Prospects appear in `/data/manual-upload` tab
- ✅ Status shows "imported" or "enriching"
- ✅ enrichment_status shows "pending"
- ✅ "Enrich" button available for founder to trigger enrichment

**Verify:**
- business_name matches uploaded data
- address matches uploaded data
- owner_name populated (if was in file)
- source shows "Manual" or "Manual Upload"
- All contact fields preserved

---

### 6. Provenance & No-Match Handling
**Objective:** Verify original data preserved and identities tracked

**Procedure:**
1. View prospect details
2. Scroll to see full details including:
   - Business name (original + normalized)
   - Address (original + normalized)
   - owner_name
   - source_payload (raw data from file)
   - state_key
   - identity_key

**Expected:**
- ✅ source_payload contains original row data
- ✅ Normalized fields show cleaned versions
- ✅ owner_name preserved exactly as uploaded
- ✅ identity_key shows deduplication basis
- ✅ enrichment_status tracks research state

**Database Verification (if SQL access available):**
```sql
-- Verify provenance preserved
SELECT id, business_name, owner_name, source_payload, state_key
FROM acquisition_prospects
WHERE acquisition_import_batch_id = '<batch_id>' LIMIT 1;

-- Verify identity_key tracking
SELECT id, identity_key, duplicate_reason
FROM acquisition_prospects
WHERE acquisition_import_batch_id = '<batch_id>'
AND identity_key IS NOT NULL;
```

---

### 7. Explicit Idempotent Promote to Leads
**Objective:** Verify promotion only via explicit founder action

**Procedure:**
1. After enrichment completes (status becomes "enriched" or "no_match"):
2. View prospect details
3. Look for "Promote to Lead" button (should appear after enrichment)
4. Click "Promote to Lead"
5. Observe response:
   - promoted: true
   - lead_id: (UUID)
   - replayed: false (first time) or true (if retried)

**Expected:**
- ✅ "Promote to Lead" button only appears after enrichment
- ✅ Promotion is explicit founder action (no automatic conversion)
- ✅ Button disabled unless enrichment complete
- ✅ Response includes lead_id linking to new lead record
- ✅ Click again → returns replayed: true with same lead_id (idempotent)

**Verify Idempotency:**
1. Click "Promote to Lead" once → note lead_id, replayed: false
2. Navigate away and back to prospect
3. Click "Promote to Lead" again → same lead_id, replayed: true
4. Verify only ONE lead created in database (not two)

---

### 8. No Automatic Effects
**Objective:** Verify no automatic lead/application/campaign/outreach creation

**Procedure:**
After import completes, verify NO automatic cascading effects:

**Expected - All should be ZERO:**
- ❌ NO applications created automatically
- ❌ NO outreach_campaigns created automatically
- ❌ NO outreach_sequences created automatically
- ❌ NO emails sent automatically
- ❌ NO status changes to "outreach_ready" automatically

**Before explicit promotion:**
- ✅ Prospects created with status "imported"
- ✅ enrichment_status is "pending"
- ✅ No lead_id linked yet

**After explicit promotion:**
- ✅ Prospect status remains "imported" (view status doesn't change)
- ✅ lead_id now populated
- ✅ state_key changes to "outreach_ready" (internal only, not visible in status)
- ✅ New lead created with status "raw"
- ✅ No automatic applications/campaigns/outreach created

**Database Verification (if SQL access available):**
```sql
-- Before promotion: verify no leads created during import
SELECT COUNT(*) as lead_count FROM leads
WHERE created_at > NOW() - INTERVAL '1 hour'
AND acquisition_prospect_id IN (
  SELECT id FROM acquisition_prospects 
  WHERE acquisition_import_batch_id = '<batch_id>'
);
-- Should return 0

-- After promotion: verify ONLY explicit promotion creates leads
SELECT COUNT(*) as auto_apps FROM business_applications
WHERE created_at > NOW() - INTERVAL '1 hour';
-- Should return 0

SELECT COUNT(*) as auto_campaigns FROM outreach_campaigns
WHERE created_at > NOW() - INTERVAL '1 hour';
-- Should return 0

SELECT COUNT(*) as auto_sequences FROM outreach_sequences
WHERE created_at > NOW() - INTERVAL '1 hour';
-- Should return 0
```

---

## Summary Verification Report

### After Complete Workflow Test

Create report with:

```
=== PREVIEW DATA WORKFLOW VERIFICATION ===

Test File: 10-4-2026.xlsx (21 rows, headerless)

✅ Registry Parsing
  - Headerless detection working
  - Positional mapping correct (col 1=name, col 2=address, col 10=owner)
  - 21 rows detected in preview

✅ Owner Name Preservation
  - owner_name field present in preview
  - owner_name values displayed in sample table
  - owner_name preserved through import

✅ Preview & Confirmation
  - Preview returns accurate counts
  - Preview message: "No leads or outreach were created"
  - Import requires exact preview_id confirmation
  - Batch created with correct row counts

✅ DATA-Only Import
  - acquisition_prospects created for valid rows
  - acquisition_import_rows created for ALL rows (valid+invalid+duplicate)
  - original_data preserved in each row
  - owner_name stored in acquisition_prospects table

✅ Provider Enrichment
  - Prospects appear in /data/manual-upload tab
  - enrichment_status = 'pending' initially
  - Enrich button available for founder

✅ Provenance Tracking
  - source_payload contains original file row
  - identity_key tracks deduplication
  - state_key empty initially (filled on promotion)
  - normalized fields show cleaned data

✅ Explicit Promotion
  - Promote button appears only after enrichment
  - Promotion is explicit founder action (not automatic)
  - Returns lead_id linking prospect to lead
  - Promotion is idempotent (retry returns same lead_id)

✅ Isolation Verified
  - NO automatic applications created
  - NO automatic outreach campaigns created
  - NO automatic outreach sequences created
  - NO automatic emails sent
  - DATA prospects created only until explicit promotion

RESULT: ✅ COMPLETE DATA WORKFLOW VERIFIED

Blocker: [If any issue found, describe it here]
```

---

## Known Limitations

**Staging Database:**
- `merchant_acquisition_candidates` table absent (OK - view conditional)
- `leads` table present (required for promotion)
- `business_applications` table absent (expected - not created automatically)

**Preview Deployment:**
- Requires Vercel founder authentication
- No production secrets exposed
- Uses existing configured Supabase service role key

---

## Notes

- All owner_name references use TypeScript type `string | null`
- Promotion route is idempotent (safe to retry)
- Conflict resolution: if another request promotes same prospect, returns existing lead_id
- No webhook integration yet (could queue enrichment in future)
- No async enrichment worker yet (Enrich button manual for now)

---

**Ready for:** Authenticated Preview testing when access available

**Test Duration:** ~10-15 minutes for complete workflow

**Artifacts Needed:** None (all code changes committed)
