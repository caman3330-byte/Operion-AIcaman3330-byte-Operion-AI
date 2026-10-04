-- Consolidation and cleanup of DATA schema (0041 variations)
-- This migration safely handles both new and existing databases
-- by using "if not exists" for all objects and "if not exists" columns

-- ============================================================================
-- PART 1: Identity Key Infrastructure (for deduplication)
-- ============================================================================

alter table public.acquisition_import_rows
  add column if not exists identity_key text
    comment 'Normalized business/location identity for deduplication';

alter table public.acquisition_prospects
  add column if not exists identity_key text
    comment 'Normalized business/location identity for deduplication';

-- Index for efficient identity lookups
create index if not exists idx_prospects_identity_key
  on acquisition_prospects(identity_key) where identity_key is not null;

-- ============================================================================
-- PART 2: Provenance Preservation
-- ============================================================================

-- Ensure all provenance columns exist
alter table public.acquisition_import_rows
  add column if not exists batch_id uuid
    comment 'Foreign key to acquisition_import_batches',
  add column if not exists row_number integer
    comment 'Original row number in uploaded file',
  add column if not exists original_data jsonb default '{}'::jsonb
    comment 'Complete original row data from file',
  add column if not exists status text default 'pending'
    check (status in ('pending', 'researching', 'researched', 'imported', 'invalid', 'duplicate'))
    comment 'Processing status of this row',
  add column if not exists created_at timestamptz default now()
    comment 'When this row was created',
  add column if not exists updated_at timestamptz default now()
    comment 'Last update timestamp';

alter table public.acquisition_prospects
  add column if not exists batch_id uuid references public.acquisition_import_batches(id) on delete set null
    comment 'Batch this prospect came from',
  add column if not exists filename text
    comment 'Original filename (if from file upload)',
  add column if not exists row_number integer
    comment 'Original row number (if from file)',
  add column if not exists raw_payload jsonb
    comment 'Raw discovery/API response payload',
  add column if not exists source_kind text default 'manual'
    check (source_kind in ('manual', 'ai'))
    comment 'How prospect was acquired: manual upload or AI acquisition',
  add column if not exists provider text default 'unknown'
    comment 'Source provider (google_places, apollo, csv_upload, etc)',
  add column if not exists created_at timestamptz default now()
    comment 'When prospect was created',
  add column if not exists updated_at timestamptz default now()
    comment 'Last update timestamp';

-- ============================================================================
-- PART 3: Enrichment Tracking
-- ============================================================================

alter table public.acquisition_prospects
  add column if not exists enrichment_status text default 'pending'
    check (enrichment_status in ('pending', 'enriching', 'enriched', 'no_match', 'failed'))
    comment 'Current enrichment state',
  add column if not exists enrichment_error text
    comment 'Error message if enrichment failed',
  add column if not exists enriched_at timestamptz
    comment 'When enrichment completed',
  add column if not exists verified_at timestamptz
    comment 'When prospect was verified';

-- ============================================================================
-- PART 4: Business Information Fields
-- ============================================================================

-- Ensure all business information columns exist
alter table public.acquisition_prospects
  add column if not exists business_name text not null
    comment 'Business name',
  add column if not exists website_url text
    comment 'Business website URL',
  add column if not exists phone text
    comment 'Business phone number (raw)',
  add column if not exists normalized_phone text
    comment 'Normalized phone for matching',
  add column if not exists email text
    comment 'Business email address',
  add column if not exists normalized_email text
    comment 'Normalized email for matching',
  add column if not exists address text
    comment 'Full business address',
  add column if not exists city text
    comment 'City',
  add column if not exists state text
    comment 'State/province',
  add column if not exists zip text
    comment 'Postal code',
  add column if not exists industry text
    comment 'Business industry/category',
  add column if not exists google_place_id text
    comment 'Google Places API ID (if from Google)',
  add column if not exists domain text
    comment 'Business domain (extracted from website)';

-- Create indexes for common queries
create index if not exists idx_prospects_business_name
  on acquisition_prospects(business_name);

create index if not exists idx_prospects_email
  on acquisition_prospects(normalized_email) where normalized_email is not null;

create index if not exists idx_prospects_phone
  on acquisition_prospects(normalized_phone) where normalized_phone is not null;

create index if not exists idx_prospects_domain
  on acquisition_prospects(domain) where domain is not null;

create index if not exists idx_prospects_google_place_id
  on acquisition_prospects(google_place_id) where google_place_id is not null;

create index if not exists idx_prospects_state
  on acquisition_prospects(state) where state is not null;

create index if not exists idx_prospects_created
  on acquisition_prospects(created_at desc);

-- ============================================================================
-- PART 5: CSV Import Batch Tracking
-- ============================================================================

create table if not exists public.acquisition_import_batches (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  content_sha256 text not null unique,
  source_kind text not null default 'manual'
    check (source_kind in ('manual', 'ai')),
  provider text not null default 'csv_upload',
  uploaded_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_batches_content_sha256
  on acquisition_import_batches(content_sha256);

create index if not exists idx_batches_created
  on acquisition_import_batches(created_at desc);

-- ============================================================================
-- PART 6: CSV Import Row Tracking
-- ============================================================================

create table if not exists public.acquisition_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.acquisition_import_batches(id) on delete cascade,
  row_number integer not null,
  original_data jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'researching', 'researched', 'imported', 'invalid', 'duplicate')),
  acquisition_prospect_id uuid references public.acquisition_prospects(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  researched_data jsonb default '{}'::jsonb,
  qualification_score integer check (qualification_score >= 0 and qualification_score <= 100),
  qualification_status text check (qualification_status in ('strong_fit', 'possible_fit', 'weak_fit', 'not_a_fit', 'needs_review')),
  research_timestamp timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id, row_number)
);

create index if not exists idx_rows_batch
  on acquisition_import_rows(batch_id, status);

create index if not exists idx_rows_status_created
  on acquisition_import_rows(status, created_at);

create index if not exists idx_rows_prospect
  on acquisition_import_rows(acquisition_prospect_id, created_at);

-- ============================================================================
-- PART 7: DATA Interface Views
-- ============================================================================

-- View of all prospects with enrichment context
create or replace view public.data_prospect_records with (security_invoker=true) as
select
  p.id,
  p.business_name,
  p.website_url,
  p.phone,
  p.normalized_phone,
  p.email,
  p.normalized_email,
  p.address,
  p.city,
  p.state,
  p.zip,
  p.industry,
  p.source_kind,
  p.provider,
  p.enrichment_status,
  p.google_place_id,
  p.domain,
  p.batch_id,
  p.filename,
  p.row_number,
  b.filename as batch_filename,
  p.created_at,
  p.updated_at,
  p.enriched_at,
  (case
    when p.normalized_email is not null and p.normalized_email != '' then true
    else false
  end) as has_email,
  (case
    when p.normalized_phone is not null and p.normalized_phone != '' then true
    else false
  end) as has_phone
from acquisition_prospects p
left join acquisition_import_batches b on p.batch_id = b.id;

-- ============================================================================
-- PART 8: Audit Note
-- ============================================================================

-- Document canonical migration structure for future maintainers
comment on table acquisition_prospects is 'DATA prospects from acquisition (AI) or manual upload. Never creates leads automatically. Schema documented in migration 0045_consolidate_data_schema.sql.';

comment on table acquisition_import_rows is 'Uploaded CSV/XLSX rows with research tracking. Schema documented in migration 0045_consolidate_data_schema.sql.';

comment on table acquisition_import_batches is 'Batch metadata for uploaded files. Schema documented in migration 0045_consolidate_data_schema.sql.';
