create table if not exists acquisition_application_sessions (
  id uuid primary key default gen_random_uuid(),
  acquisition_prospect_id uuid not null unique references acquisition_prospects(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  application_id uuid unique references business_applications(id) on delete set null,
  lead_id uuid unique references leads(id) on delete set null,
  submitted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((submitted_at is null) = (application_id is null))
);

drop trigger if exists set_acquisition_application_sessions_updated_at on acquisition_application_sessions;
create trigger set_acquisition_application_sessions_updated_at
before update on acquisition_application_sessions for each row execute function set_updated_at();

create index if not exists idx_acquisition_application_sessions_active
on acquisition_application_sessions(expires_at) where submitted_at is null;

alter table acquisition_application_sessions enable row level security;
drop policy if exists "internal_manage_acquisition_application_sessions" on acquisition_application_sessions;
create policy "internal_manage_acquisition_application_sessions" on acquisition_application_sessions
for all to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());
