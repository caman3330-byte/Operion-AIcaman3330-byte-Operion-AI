alter table merchant_acquisition_sources
  add column if not exists lock_token text,
  add column if not exists locked_at timestamptz,
  add column if not exists lock_expires_at timestamptz;

create index if not exists idx_merchant_sources_lock_expiry
on merchant_acquisition_sources(lock_expires_at)
where lock_token is not null;

alter table merchant_acquisition_source_shards
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists lock_token text,
  add column if not exists locked_at timestamptz,
  add column if not exists lock_expires_at timestamptz;

create index if not exists idx_merchant_source_shards_lock_expiry
on merchant_acquisition_source_shards(lock_expires_at)
where lock_token is not null;
