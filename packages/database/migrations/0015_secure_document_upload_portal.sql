-- Secure merchant document upload portal foundation.
-- Additive only: preserves existing document rows and legacy application data.

alter type ai_task_type add value if not exists 'document_processing';

alter table documents
  add column if not exists storage_bucket text not null default 'merchant-documents',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists uploaded_by_role text null,
  add column if not exists processing_status text not null default 'pending',
  add column if not exists processing_requested_at timestamptz null;

create table if not exists merchant_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  business_application_id uuid not null references business_applications(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_used_at timestamptz null,
  revoked_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_documents_storage_bucket_path on documents(storage_bucket, storage_path)
  where storage_path is not null;
create index if not exists idx_documents_processing_status on documents(processing_status, created_at desc);
create index if not exists idx_merchant_upload_sessions_application on merchant_upload_sessions(business_application_id, expires_at desc);
create index if not exists idx_merchant_upload_sessions_token_hash on merchant_upload_sessions(token_hash)
  where revoked_at is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'merchant-documents',
    'merchant-documents',
    false,
    52428800,
    array['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[]
  ),
  (
    'underwriting-documents',
    'underwriting-documents',
    false,
    52428800,
    array['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[]
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "internal_manage_merchant_document_objects" on storage.objects;
create policy "internal_manage_merchant_document_objects" on storage.objects
for all to authenticated
using (bucket_id in ('merchant-documents', 'underwriting-documents') and public.is_internal_user())
with check (bucket_id in ('merchant-documents', 'underwriting-documents') and public.is_internal_user());

alter table merchant_upload_sessions enable row level security;

drop policy if exists "internal_read_merchant_upload_sessions" on merchant_upload_sessions;
create policy "internal_read_merchant_upload_sessions" on merchant_upload_sessions
for select to authenticated
using (public.is_internal_user());
