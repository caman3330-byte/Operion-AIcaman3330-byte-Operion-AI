do $$ begin
  create type merchant_source_shard_status as enum ('queued', 'running', 'completed', 'partial', 'failed', 'empty');
exception when duplicate_object then null;
end $$;

create table if not exists merchant_acquisition_source_shards (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references merchant_acquisition_sources(id) on delete cascade,
  shard_key text not null,
  shard_url text not null,
  page_number integer,
  offset_value integer,
  status merchant_source_shard_status not null default 'queued',
  discovered_count integer not null default 0 check (discovered_count >= 0),
  processed_count integer not null default 0 check (processed_count >= 0),
  verified_count integer not null default 0 check (verified_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  last_processed_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_id, shard_key)
);

drop trigger if exists set_merchant_acquisition_source_shards_updated_at on merchant_acquisition_source_shards;
create trigger set_merchant_acquisition_source_shards_updated_at
before update on merchant_acquisition_source_shards
for each row execute function set_updated_at();

create index if not exists idx_merchant_source_shards_next
on merchant_acquisition_source_shards(source_id, status, offset_value nulls first, page_number nulls first, created_at);

create index if not exists idx_merchant_source_shards_status
on merchant_acquisition_source_shards(status, last_processed_at desc nulls last);

alter table merchant_acquisition_candidates
  add column if not exists failure_reason_code text,
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_error text,
  add column if not exists source_shard_id uuid references merchant_acquisition_source_shards(id) on delete set null;

create index if not exists idx_merchant_candidates_retry_due
on merchant_acquisition_candidates(enrichment_status, next_retry_at)
where enrichment_status = 'failed' and next_retry_at is not null;

create index if not exists idx_merchant_candidates_failure_reason
on merchant_acquisition_candidates(failure_reason_code);

create index if not exists idx_merchant_candidates_source_shard
on merchant_acquisition_candidates(source_shard_id);
