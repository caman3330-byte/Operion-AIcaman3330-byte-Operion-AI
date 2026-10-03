do $$ begin
  create type acquisition_import_status as enum ('previewed', 'confirmed', 'failed', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists acquisition_import_batches (
  id uuid primary key default gen_random_uuid(),
  batch_code text not null unique,
  source_id uuid references lead_sources(id) on delete set null,
  uploaded_by uuid references auth.users(id) on delete set null,
  original_filename text not null,
  content_sha256 text not null,
  status acquisition_import_status not null default 'previewed',
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  missing_email_rows integer not null default 0 check (missing_email_rows >= 0),
  missing_phone_rows integer not null default 0 check (missing_phone_rows >= 0),
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_acquisition_import_batches_updated_at on acquisition_import_batches;
create trigger set_acquisition_import_batches_updated_at
before update on acquisition_import_batches for each row execute function set_updated_at();

create table if not exists acquisition_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references acquisition_import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  status text not null check (status in ('valid', 'duplicate', 'invalid', 'imported')),
  duplicate_reason text,
  validation_errors jsonb not null default '[]'::jsonb,
  normalized_payload jsonb not null,
  lead_id uuid references leads(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(batch_id, row_number)
);

alter table leads add column if not exists acquisition_import_batch_id uuid references acquisition_import_batches(id) on delete set null;
create index if not exists idx_acquisition_import_batches_status_created on acquisition_import_batches(status, created_at desc);
create index if not exists idx_acquisition_import_rows_batch_status on acquisition_import_rows(batch_id, status, row_number);
create index if not exists idx_leads_acquisition_import_batch on leads(acquisition_import_batch_id);

alter table acquisition_import_batches enable row level security;
alter table acquisition_import_rows enable row level security;

create policy "internal_manage_acquisition_import_batches" on acquisition_import_batches
for all to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

create policy "internal_manage_acquisition_import_rows" on acquisition_import_rows
for all to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());
