# Phase 1 DATA - Verification Checklist

**Status**: Ready for Comprehensive Verification in Next Session
**Token Limit**: Reached - Requires fresh session for hands-on testing

---

## VERIFICATION TASKS (In Priority Order)

### 1. DETAIL VIEW FIX VERIFICATION ⚠️ CRITICAL

**Task**: Actually test the detail view fix, don't just assume it works

**Steps**:
- [ ] Hard restart application (kill dev server, clear browser cache, restart dev server)
- [ ] Navigate to /data
- [ ] Click on **TechVision Solutions** business record
- [ ] Verify: Detail modal opens without error
- [ ] Verify: All fields display (Business name, Industry, Address, Email, Phone, Website, Status)
- [ ] Verify: Missing fields show "Not available" gracefully (no crashes)
- [ ] Close modal, return to DATA table
- [ ] Click on **Green Building Corp** to test another business
- [ ] Verify: Enrich button displays if available
- [ ] Browser console: ZERO runtime errors during detail view operations

**Success Criteria**: All clicks open detail view without errors

**Expected Errors to Fix if Found**:
- [ ] If still seeing "Cannot read properties of undefined", check component re-compilation
- [ ] If /api/data/[id] returns 500, check detail endpoint implementation
- [ ] If enrichment_status is undefined, verify column exists in acquisition_prospects

---

### 2. REMOVE TEST BUSINESSES ⚠️ CRITICAL

**Task**: Delete 5 test records, verify only those are removed

**Test Records to Delete**:
1. TechVision Solutions (id: from insertion script)
2. Green Building Corp (id: from insertion script)
3. Peak Consulting Group (id: from insertion script)
4. SwiftLogistics Inc (id: from insertion script)
5. Elite Marketing Partners (id: from insertion script)

**Deletion Method**:
```sql
-- In Supabase SQL Editor
DELETE FROM public.acquisition_prospects 
WHERE provider = 'test_discovery' 
AND source_kind = 'ai';
```

**Verification**:
- [ ] Execute delete query in Supabase
- [ ] Refresh /data page
- [ ] Verify: Page shows 0 Total Acquired (or only real data if any exists)
- [ ] Query: SELECT COUNT(*) FROM acquisition_prospects; should show 0 (or only real)
- [ ] Check /api/data endpoint returns empty or only real data

---

### 3. TEST REAL AI ACQUISITION 🎯 HIGH PRIORITY

**Task**: Acquire 5-10 real businesses using configured sources

**Sources Available**:
- Google Places (may not be configured)
- Apollo (may not be configured)
- Manual test data insertion (fallback)

**Approach** (if sources aren't configured):
- [ ] Insert 5-10 real business data manually via script similar to test insertion
- OR
- [ ] Use AcquireData UI with Google Places/Apollo if configured
- [ ] For each business, verify real data:
  - [ ] Business name (actual company)
  - [ ] Industry (real category)
  - [ ] Address (actual address)
  - [ ] Website (real or empty, never fabricated)
  - [ ] Email (real or empty, never fabricated)
  - [ ] Phone (real or empty, never fabricated)

**Do NOT**:
- [ ] Fabricate missing fields
- [ ] Send any emails
- [ ] Create any leads or outreach
- [ ] Contact any businesses

**Verification**:
- [ ] Records appear in /data page
- [ ] Stat cards update with new count
- [ ] Detail view opens for each new business
- [ ] Search finds the new businesses

---

### 4. COMPLETE DATA PIPELINE END-TO-END

**Task**: Verify full flow from acquisition → database → frontend

**Test Flow**:
- [ ] Insert/Acquire business data (Step 3)
- [ ] Verify in Supabase: SELECT COUNT(*) FROM acquisition_prospects;
- [ ] Query /api/data endpoint directly: `curl http://localhost:3000/api/data`
- [ ] Check response includes businesses with all fields
- [ ] Navigate to /data page
- [ ] Verify stat cards update with new count
- [ ] Verify business table shows all acquired records
- [ ] Click detail view for each business
- [ ] Verify detail modal loads with full information

**Success Criteria**: Data flows through entire pipeline without loss

---

### 5. SEARCH FUNCTIONALITY TEST

**Task**: Test search against REAL data (not just previous test)

**Tests**:
- [ ] Search for partial business name (e.g., "Tech")
- [ ] Search for full business name
- [ ] Search for city (e.g., "Dallas")
- [ ] Search for email domain
- [ ] Search for phone number partial
- [ ] Click "Clear" to reset search
- [ ] Verify all records return

**Success Criteria**: Search returns only matching records, clear resets to all records

---

### 6. NAVIGATION PERFORMANCE ⚠️ OPTIMIZE

**Task**: Measure and improve navigation speed

**Current Baseline**: ~1-2 seconds (reported)
**Target**: <1 second, ideally instant

**Measurement Method**:
```javascript
// In browser console, on /data page:
console.time('nav');
// Navigate to Manual Upload
// On load:
console.timeEnd('nav');
```

**Measure Between Pages**:
- [ ] /data → /data/manual-upload (measure time)
- [ ] /data/manual-upload → /data (measure time)
- [ ] /data → /leads (measure time)
- [ ] /leads → /data (measure time)

**Optimization Checks**:
- [ ] Dev server logs: Are there duplicate API calls?
- [ ] Network tab: Is /api/data called multiple times per page?
- [ ] React DevTools: Are components unnecessarily remounting?
- [ ] Check if useEffect dependencies are correct to prevent refetches

**Common Issues to Check**:
- [ ] Missing dependency arrays in useEffect
- [ ] Unnecessary useCallback dependencies
- [ ] Full page reload instead of client-side navigation
- [ ] Missing Next.js prefetching

**Success Criteria**: Navigation consistently under 1 second

---

### 7. MANUAL UPLOAD TEST 🎯 HIGH PRIORITY

**Task**: Test CSV/XLSX upload with real file

**Test File to Create**:
```csv
Business Name,Address,City,State,ZIP,Website,Phone,Email
Test Company A,123 Main St,Austin,TX,78701,https://testA.com,+15551234567,contact@testA.com
Test Company B,456 Oak Ave,Dallas,TX,75201,https://testB.com,+14155554567,info@testB.com
Test Company C,789 Pine Rd,Houston,TX,77001,https://testC.com,+17135553456,hello@testC.com
```

**Upload Steps**:
- [ ] Navigate to /data/manual-upload
- [ ] Click "Choose CSV or XLSX"
- [ ] Select test CSV file
- [ ] Verify: Preview shows records
- [ ] Verify: Validation passes (or shows specific errors for invalid rows)
- [ ] Verify: Duplicate detection works (if re-uploading same)
- [ ] Click Import/Upload
- [ ] Verify: Import succeeds without errors
- [ ] Navigate back to /data
- [ ] Verify: New records appear in table
- [ ] Verify: Stat cards update
- [ ] Verify: Detail view opens for imported records

**Edge Cases to Test**:
- [ ] Missing email field
- [ ] Missing phone field
- [ ] Missing website field
- [ ] Duplicate business name (should detect)

**Do NOT**:
- [ ] Check if outreach is triggered
- [ ] Check if emails are sent
- [ ] Contact any actual businesses

---

### 8. UI SIMPLICITY CHECK

**Task**: Verify DATA page UI is clean and simple

**Required Elements** (and ONLY these):
- [ ] Top: 4 stat cards (Total Acquired, Verified, Invalid, Total Merchants)
- [ ] Middle: AI Acquired / Manual Upload tabs
- [ ] Search bar for businesses
- [ ] Business table with columns:
  - Business Name (clickable)
  - Industry
  - Location
  - Email
  - Phone
  - Status
- [ ] Pagination controls

**Not Allowed** (must NOT appear on main page):
- [ ] Provider/source selection (only in AcquireData section)
- [ ] Complex filter panels
- [ ] Additional status cards
- [ ] Enrichment dashboards
- [ ] Source breakdowns

**Success Criteria**: Page is clean and focused, no clutter

---

### 9. SECURITY CLEANUP 🔒 CRITICAL

**Task**: Find and remove any exposed credentials

**Search Repository For**:
```bash
# In terminal, from project root:
grep -r "sb_secret_" . --exclude-dir=node_modules --exclude-dir=.git
grep -r "service_role" . --exclude-dir=node_modules --exclude-dir=.git
grep -r "SUPABASE.*KEY" . --exclude-dir=node_modules --exclude-dir=.git
```

**Files to Check**:
- [ ] test_data_acquisition.ts (DELETE if still exists)
- [ ] .env files (NEVER commit)
- [ ] .env.local files (verify only in .gitignore)
- [ ] Any scripts in project root
- [ ] Browser DevTools: Check localStorage/sessionStorage for secrets

**Actions**:
- [ ] Delete test_data_acquisition.ts
- [ ] Delete PHASE_1_DATA_REPORT.md (internal doc, not for repo)
- [ ] Verify .env.local is in .gitignore
- [ ] Verify no secrets in component code
- [ ] Verify no API keys in config files

**Verification**:
- [ ] `git log --all --source --full-history -- 'sb_secret_*'` shows no commits
- [ ] No secrets in current HEAD
- [ ] .gitignore includes .env.local, .env, credentials

---

### 10. FINAL BUILD & TEST 🏗️ CRITICAL

**Commands to Run**:
```bash
cd apps/dashboard

# 1. TypeScript type check
npm run typecheck

# 2. Linting
npm run lint

# 3. Production build
npm run build

# 4. Kill old dev server, start fresh
pkill -f "next dev"
npm run dev
```

**Tests to Verify**:
- [ ] TypeScript: PASS (no type errors)
- [ ] ESLint: PASS (no linting errors)
- [ ] Build: PASS (compiles without errors)
- [ ] Dev server starts: PASS
- [ ] /data loads: PASS
- [ ] /api/data returns 200: PASS
- [ ] /data/manual-upload loads: PASS
- [ ] Detail view works: PASS
- [ ] Search works: PASS
- [ ] Manual upload works: PASS

**Failure Resolution**:
- [ ] If TypeScript fails: Fix type errors before proceeding
- [ ] If ESLint fails: Fix linting before proceeding
- [ ] If build fails: Fix build errors before proceeding
- [ ] If /api/data fails: Check server logs, fix issues

---

## FINAL VERIFICATION REPORT

After completing all above steps, fill in:

```
PHASE 1 DATA - FINAL VERIFICATION REPORT
=========================================

1. Real Businesses Acquired: ____ (count)
2. Businesses in Database: ____ (via SELECT COUNT(*))
3. Detail View: [PASS / FAIL]
   - Issues if FAIL: _______________
4. Search: [PASS / FAIL]
   - Issues if FAIL: _______________
5. Manual Upload: [PASS / FAIL]
   - Issues if FAIL: _______________
6. Navigation Timing: ____ seconds (target: <1s)
7. Security Cleanup: [PASS / FAIL]
   - Found credentials: [YES / NO]
8. Build Status: [PASS / FAIL]
   - Errors: _______________

OVERALL STATUS: [READY FOR PHASE 2 / BLOCKERS REMAIN]

Remaining Issues (if any):
- _______________
- _______________
```

---

## EXECUTION PRIORITY

1. **Immediate** (Session 1): Detail view, remove test data, real acquisition
2. **High** (Session 1): Manual upload, security cleanup
3. **Optimization** (Session 1-2): Navigation performance tuning
4. **Final** (Session 2): Build tests, final verification report

---

## NOTES FOR NEXT SESSION

- Start with fresh dev server restart (clear all caches)
- Have Supabase SQL editor open for delete operations
- Use browser DevTools Performance tab for navigation timing
- Create test CSV file before testing manual upload
- Keep this checklist handy and mark items as PASS/FAIL
- Do NOT claim Phase 1 complete until ALL items are verified PASS

