-- Migration 0016: Merchant workflow status refinement + Lender Discovery system
-- Production-safe and re-runnable. Preserves all existing records.

-- ============================================================
-- 1. Add refined merchant workflow status values
-- ============================================================
do $$ begin
  alter type business_application_status add value if not exists 'application_submitted';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type business_application_status add value if not exists 'awaiting_documents';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type business_application_status add value if not exists 'documents_uploaded';
exception when duplicate_object then null;
end $$;

-- ============================================================
-- 2. Lender Discovery Queue
-- ============================================================
create table if not exists lender_discovery_queue (
  id                    uuid primary key default gen_random_uuid(),
  company_name          text not null,
  website_url           text null,
  contact_page_url      text null,
  contact_email         text null,
  contact_phone         text null,
  states_served         text[] null default '{}',
  industries_served     text[] null default '{}',
  funding_range_min     numeric null,
  funding_range_max     numeric null,
  qualification_summary text null,
  intelligence_summary  text null,
  confidence_score      numeric null check (confidence_score >= 0 and confidence_score <= 1),
  discovery_source      text not null default 'manual'
                          check (discovery_source in ('manual', 'web_search', 'referral', 'directory', 'import')),
  status                text not null default 'pending_review'
                          check (status in ('pending_review', 'approved', 'rejected', 'outreach_ready')),
  founder_notes         text null,
  reviewed_by           text null,
  reviewed_at           timestamptz null,
  duplicate_of          uuid null references lender_discovery_queue(id) on delete set null,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_lender_discovery_status     on lender_discovery_queue(status, created_at desc);
create index if not exists idx_lender_discovery_confidence on lender_discovery_queue(confidence_score desc nulls last);
create index if not exists idx_lender_discovery_source     on lender_discovery_queue(discovery_source);

drop trigger if exists lender_discovery_queue_set_updated_at on lender_discovery_queue;
create trigger lender_discovery_queue_set_updated_at
  before update on lender_discovery_queue
  for each row execute function set_updated_at();

-- ============================================================
-- 3. RLS — founder/operator read/write, no public access
-- ============================================================
alter table lender_discovery_queue enable row level security;

drop policy if exists "lender_discovery_internal_read"  on lender_discovery_queue;
drop policy if exists "lender_discovery_internal_write" on lender_discovery_queue;
drop policy if exists "lender_discovery_service_all"    on lender_discovery_queue;

create policy "lender_discovery_service_all" on lender_discovery_queue
  for all
  using (true)
  with check (true);
