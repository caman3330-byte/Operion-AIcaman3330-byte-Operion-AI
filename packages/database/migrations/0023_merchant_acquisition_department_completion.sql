do $$ begin
  create type merchant_source_approval_status as enum ('pending_review', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type merchant_candidate_import_review_status as enum ('pending_review', 'approved', 'rejected', 'imported');
exception when duplicate_object then null;
end $$;

alter table merchant_acquisition_sources
  add column if not exists approval_status merchant_source_approval_status not null default 'approved',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists disabled_reason text,
  add column if not exists failure_streak integer not null default 0 check (failure_streak >= 0);

alter table merchant_acquisition_candidates
  add column if not exists import_review_status merchant_candidate_import_review_status not null default 'pending_review',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text,
  add column if not exists review_notes text;

update merchant_acquisition_sources
set approved_at = coalesce(approved_at, created_at)
where approval_status = 'approved';

create index if not exists idx_merchant_sources_approval
on merchant_acquisition_sources(approval_status, active);

create index if not exists idx_merchant_sources_failure_streak
on merchant_acquisition_sources(failure_streak);

create index if not exists idx_merchant_candidates_import_review
on merchant_acquisition_candidates(import_review_status, enrichment_status, quality_score desc);
