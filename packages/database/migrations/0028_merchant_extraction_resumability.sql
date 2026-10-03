alter table merchant_acquisition_source_scans
  add column if not exists extraction_status text not null default 'queued',
  add column if not exists source_cursor text,
  add column if not exists page_number integer not null default 1 check (page_number >= 1),
  add column if not exists page_url text,
  add column if not exists detail_url_cursor text,
  add column if not exists last_processed_candidate text,
  add column if not exists last_successful_extraction_at timestamptz,
  add column if not exists runtime_ms integer not null default 0 check (runtime_ms >= 0),
  add column if not exists timed_out boolean not null default false,
  add column if not exists resumable boolean not null default false;

create index if not exists idx_merchant_source_scans_resumable
on merchant_acquisition_source_scans(source_id, resumable, started_at desc)
where resumable = true;

create index if not exists idx_merchant_source_scans_extraction_status
on merchant_acquisition_source_scans(extraction_status, started_at desc);
