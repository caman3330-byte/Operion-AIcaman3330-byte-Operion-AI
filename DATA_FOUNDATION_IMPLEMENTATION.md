# DATA Foundation Implementation Plan

## Phase Overview
Build the DATA module for merchant acquisition and research with two independent sources: AI Acquired and Manual Upload. Ensure complete separation from Lead creation and outreach.

## Current State Assessment
✅ **Already Correct**
- `ingestLeadBatch()` creates DATA/prospect records only (not leads)
- `ingestAcquiredProspects()` persists to acquisition_prospects table
- CSV upload accepts .csv and .xlsx files
- Google Places acquisition fully implemented
- Outreach system properly isolated
- Middleware allows public access to `/api/acquisition/google-places-scheduler`

⚠️ **Issues to Fix**
- Migration 0041 file duplication (5 files with same name)
- Manual CSV upload skips preview/confirm workflow (goes straight to persist)
- No comprehensive test coverage
- Missing search/filter/pagination for DATA interface
- No explicit lead promotion path documented

## Implementation Tasks

### 1. Migration Consolidation (Safe Strategy)
- [ ] Identify which 0041 file is currently applied to production/staging
- [ ] Create new migration 0045_consolidate_0041_schema.sql that:
  - Adds missing columns if they don't exist
  - Documents canonical migration structure
  - Works on both new and existing databases
- [ ] Rename/remove local duplicate 0041 files (keep complete_data_schema for reference)
- [ ] Test migration replay on blank database

### 2. CSV Upload Preview Workflow
- [ ] Create new `/api/data/csv-preview` endpoint (POST)
  - Parse file without persisting
  - Return preview with counts (valid, invalid, duplicates, missing contact info)
  - Generate preview ID for confirmation
- [ ] Enhance `/api/data/csv-upload` to accept preview ID
  - Persist batch and rows to DB
  - Return batch_id and summary
- [ ] Add CSV preview component to UI

### 3. DATA Interface & Search
- [ ] Create `/api/data/search` endpoint with filters:
  - business_name, address, phone, email (search)
  - source/provider (filter)
  - status/enrichment_status (filter)
  - state/city (filter)
  - has_email, has_phone (boolean filters)
  - date_range (created_at filter)
  - pagination (limit, offset)
- [ ] Create DATA detail view component
  - Show all fields with provenance
  - Display source/provider/batch information
  - Show enrichment status and timestamp

### 4. Lead Promotion Path
- [ ] Define promotion workflow:
  - DATA prospect → (explicit action) → Lead (preserving provenance)
  - Require founder authorization
  - Create audit trail
- [ ] Create `/api/data/[id]/promote-to-lead` endpoint (if schema supports)
  - Or create `/api/leads/from-prospect` endpoint
  - Link original prospect data to lead
- [ ] Add "Promote to Lead" action in UI (if supported)

### 5. Testing Suite
Tests to add:
- [ ] acquisition/AI acquisition creates DATA only, not leads
- [ ] acquisition/Google Places discovers and imports prospects
- [ ] acquisition/Apollo adapter (if enabled) imports prospects
- [ ] csv/CSV parse and normalize
- [ ] csv/XLSX parse and normalize
- [ ] csv/Invalid rows preserved, not silently deleted
- [ ] csv/Duplicate detection using business/location identity
- [ ] csv/Provenance stored (batch_id, filename, row_number, original_data)
- [ ] csv/Missing contact information preserved
- [ ] search/Database search by name/address/phone/email
- [ ] search/Filters (source, status, state, date_range)
- [ ] search/Pagination
- [ ] enrichment/Enrichment updates prospect, doesn't create lead
- [ ] enrichment/Enrichment doesn't trigger outreach
- [ ] auth/Founder auth required for upload
- [ ] auth/Unauthorized rejection for non-founders

### 6. Production Verification
- [ ] All TypeScript checks pass
- [ ] Lint clean
- [ ] Migrations apply cleanly (test replay)
- [ ] All acquisition tests pass
- [ ] All CSV/upload tests pass
- [ ] All DATA tests pass
- [ ] Build succeeds (next build)
- [ ] Deploy to Preview (staging Vercel)
- [ ] Verify Preview deployment
- [ ] Test DATA page in Preview UI
- [ ] Verify no Production changes made
- [ ] Verify no outreach emails sent

## File Manifest (To Be Created/Modified)

### Migrations
- [ ] packages/database/migrations/0045_consolidate_0041_schema.sql (NEW)

### API Routes
- [ ] apps/dashboard/app/api/data/search/route.ts (NEW)
- [ ] apps/dashboard/app/api/data/csv-preview/route.ts (NEW)
- [ ] apps/dashboard/app/api/data/csv-upload/route.ts (MODIFY - accept preview ID)

### Libraries
- [ ] apps/dashboard/lib/data-prospects/search.ts (NEW)
- [ ] apps/dashboard/lib/data-prospects/promotion.ts (NEW)

### Components
- [ ] apps/dashboard/components/data/search-results.tsx (NEW)
- [ ] apps/dashboard/components/data/prospect-detail.tsx (NEW)
- [ ] apps/dashboard/components/data/csv-preview.tsx (NEW)

### Tests
- [ ] apps/dashboard/__tests__/acquisition/ai-acquisition.test.ts (NEW)
- [ ] apps/dashboard/__tests__/acquisition/google-places.test.ts (NEW)
- [ ] apps/dashboard/__tests__/csv/upload.test.ts (NEW)
- [ ] apps/dashboard/__tests__/csv/parse.test.ts (NEW)
- [ ] apps/dashboard/__tests__/data/search.test.ts (NEW)
- [ ] apps/dashboard/__tests__/data/dedup.test.ts (NEW)
- [ ] apps/dashboard/__tests__/data/enrichment.test.ts (NEW)

---

**Status:** Starting implementation
**Target:** Complete by end of session with Preview verification
