-- DATA Foundation Additions (Safe consolidation)
-- This migration ONLY adds missing columns to existing schema
-- Does not conflict with 0041_minimal_data_schema.sql
-- Preserves complete provenance and isolation from leads/outreach

-- ============================================================================
-- PART 1: Add missing provenance columns to acquisition_import_rows
-- ============================================================================

alter table public.acquisition_import_rows
  add column if not exists original_data jsonb default '{}'::jsonb
    comment 'Complete original row from file upload (before any normalization)';

-- Index for efficient lookups
create index if not exists idx_acquisition_import_rows_prospect_id
  on acquisition_import_rows(acquisition_prospect_id) where acquisition_prospect_id is not null;

-- ============================================================================
-- PART 2: Add missing provenance columns to acquisition_prospects
-- ============================================================================

-- Link back to original batch (may differ from acquisition_import_batch_id for AI acquisition)
alter table public.acquisition_prospects
  add column if not exists batch_id uuid
    references public.acquisition_import_batches(id) on delete set null
    comment 'Original import batch (for provenance; may be same as acquisition_import_batch_id)';

-- Original filename for audit trail
alter table public.acquisition_prospects
  add column if not exists filename text
    comment 'Original filename (for audit trail and provenance)';

-- Row number from file for traceability
alter table public.acquisition_prospects
  add column if not exists row_number integer
    comment 'Original row number from source file (for full traceability)';

-- ============================================================================
-- PART 3: Add missing indexes for efficient queries
-- ============================================================================

create index if not exists idx_acquisition_prospects_batch_id
  on acquisition_prospects(batch_id) where batch_id is not null;

create index if not exists idx_acquisition_prospects_identity_key
  on acquisition_prospects(identity_key);

create index if not exists idx_acquisition_prospects_filename
  on acquisition_prospects(filename) where filename is not null;

create index if not exists idx_acquisition_prospects_enrichment_status
  on acquisition_prospects(enrichment_status, created_at desc);

-- ============================================================================
-- PART 4: Schema Documentation
-- ============================================================================

comment on table public.acquisition_import_batches is
  'Batches of uploaded CSV/XLSX files. Status flow: previewed → confirmed → (imported/failed/cancelled). Each batch persists all rows (valid, invalid, duplicate) with complete metadata.';

comment on table public.acquisition_import_rows is
  'Individual rows from CSV/XLSX uploads. Status values: valid|invalid|duplicate (before prospect creation) → imported (when prospect created). All rows preserved including invalid and duplicates. original_data preserves complete row before normalization.';

comment on table public.acquisition_prospects is
  'DATA prospects from manual uploads or AI acquisition. Core isolation boundary: acquisition creates prospects ONLY, never leads/applications. enrichment_status tracks research workflow (pending→enriching→enriched/no_match/failed). state_key tracks business workflow (prospect→outreach_ready→outreach_sent→...). Lead promotion requires explicit action, not automatic.';

comment on column public.acquisition_import_rows.original_data is
  'Complete original row from file before any parsing/normalization. Enables full audit trail and recovery.';

comment on column public.acquisition_import_rows.batch_id is
  'Foreign key to parent batch. Supports cascade delete of all rows when batch deleted.';

comment on column public.acquisition_import_rows.status is
  'Valid values: valid|invalid|duplicate|imported. Initially set during parse, updated to imported when prospect created.';

comment on column public.acquisition_prospects.batch_id is
  'Original batch this prospect came from. Links back to source for complete provenance (different from acquisition_import_batch_id for AI-acquired prospects).';

comment on column public.acquisition_prospects.filename is
  'Original filename for audit trail. Enables tracking source of every prospect.';

comment on column public.acquisition_prospects.row_number is
  'Original row number from source file. Combined with filename, enables unique traceability.';

comment on column public.acquisition_prospects.state_key is
  'Workflow state machine: prospect(initial)→outreach_ready→outreach_sent→interested→application_started→application_submitted→sales_followup→closed. Does NOT automatically advance. Requires explicit action.';

comment on column public.acquisition_prospects.enrichment_status is
  'Research status machine: pending→enriching→enriched|no_match|failed. Tracks if/when business was researched and verified.';

comment on column public.acquisition_prospects.lead_id is
  'Optional link to leads table. CRITICAL: This is NOT automatic. Lead created only via explicit promotion action, never by acquisition or research.';

-- ============================================================================
-- PART 5: Critical Isolation Verification (Documentation)
-- ============================================================================

-- NOTE: The acquisition_import_rows.lead_id column exists from 0036 but is UNUSED.
-- Prospects link to leads via acquisition_prospects.lead_id only, and only after
-- explicit promotion action. Acquisition and research pipelines NEVER create leads.

-- Verify no outreach triggers exist during DATA operations:
-- - acquisition/google-places-scheduler: creates acquisition_prospects only
-- - /api/data/csv-upload: persists rows and batches only
-- - /api/data/research-worker: updates enrichment_status only
-- - /api/data/search: read-only queries only

-- All lead creation routes (/api/leads/*) are SEPARATE and EXPLICIT.
