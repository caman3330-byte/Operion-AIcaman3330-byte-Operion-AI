do $$ begin
  create type merchant_source_recommendation as enum ('promote', 'monitor', 'degrade', 'retire', 'needs_review');
exception when duplicate_object then null;
end $$;

alter table merchant_acquisition_sources
  add column if not exists source_quality_score integer not null default 0 check (source_quality_score >= 0 and source_quality_score <= 100),
  add column if not exists estimated_merchant_count integer check (estimated_merchant_count is null or estimated_merchant_count >= 0),
  add column if not exists robots_accessible boolean,
  add column if not exists extraction_compatibility_score integer not null default 0 check (extraction_compatibility_score >= 0 and extraction_compatibility_score <= 100),
  add column if not exists confidence_score integer not null default 0 check (confidence_score >= 0 and confidence_score <= 100),
  add column if not exists acquisition_yield_score integer not null default 0 check (acquisition_yield_score >= 0 and acquisition_yield_score <= 100),
  add column if not exists recommendation merchant_source_recommendation not null default 'needs_review',
  add column if not exists last_tested_at timestamptz,
  add column if not exists test_businesses_discovered integer not null default 0 check (test_businesses_discovered >= 0),
  add column if not exists test_businesses_validated integer not null default 0 check (test_businesses_validated >= 0),
  add column if not exists test_duplicate_rate numeric(5,2) not null default 0 check (test_duplicate_rate >= 0 and test_duplicate_rate <= 100);

create table if not exists merchant_source_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  status acquisition_job_status not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  target_industries text[] not null default '{}'::text[],
  candidate_sources_found integer not null default 0 check (candidate_sources_found >= 0),
  candidate_sources_stored integer not null default 0 check (candidate_sources_stored >= 0),
  duplicates integer not null default 0 check (duplicates >= 0),
  blocked_or_unreachable integer not null default 0 check (blocked_or_unreachable >= 0),
  errors text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_merchant_sources_quality on merchant_acquisition_sources(source_quality_score desc);
create index if not exists idx_merchant_sources_recommendation on merchant_acquisition_sources(recommendation);
create index if not exists idx_merchant_sources_last_tested on merchant_acquisition_sources(last_tested_at);
create index if not exists idx_merchant_discovery_runs_started on merchant_source_discovery_runs(started_at desc);
