-- Lender intelligence and acquisition foundation.
-- This extends the existing lenders table for founder-reviewed lender acquisition.
-- No autonomous outreach, deal submission, or background worker behavior is introduced.

alter table lenders add column if not exists website_url text null;
alter table lenders add column if not exists contact_page_url text null;
alter table lenders add column if not exists broker_program_url text null;
alter table lenders add column if not exists funding_products text[] not null default '{}';
alter table lenders add column if not exists funding_range_min numeric(14, 2) null;
alter table lenders add column if not exists funding_range_max numeric(14, 2) null;
alter table lenders add column if not exists industries_served text[] not null default '{}';
alter table lenders add column if not exists states_served text[] not null default '{}';
alter table lenders add column if not exists minimum_requirements jsonb not null default '{}'::jsonb;
alter table lenders add column if not exists public_contact_methods jsonb not null default '{}'::jsonb;
alter table lenders add column if not exists intelligence_summary text null;
alter table lenders add column if not exists funding_criteria_summary text null;
alter table lenders add column if not exists target_merchant_profile text null;
alter table lenders add column if not exists risk_level text not null default 'unknown';
alter table lenders add column if not exists estimated_responsiveness text not null default 'unknown';
alter table lenders add column if not exists intelligence_notes text null;
alter table lenders add column if not exists lender_tier text not null default 'C';
alter table lenders add column if not exists acquisition_stage text not null default 'Discovered';
alter table lenders add column if not exists approval_status text not null default 'pending_review';
alter table lenders add column if not exists first_discovered_at timestamptz not null default now();
alter table lenders add column if not exists last_intelligence_update_at timestamptz null;
alter table lenders add column if not exists outreach_history jsonb not null default '[]'::jsonb;
alter table lenders add column if not exists outreach_drafts jsonb not null default '[]'::jsonb;
alter table lenders add column if not exists min_monthly_revenue numeric(14, 2) null;
alter table lenders add column if not exists min_months_in_business integer null;
alter table lenders add column if not exists min_fico integer null;
alter table lenders add column if not exists max_funding numeric(14, 2) null;
alter table lenders add column if not exists industry_restrictions text[] not null default '{}';
alter table lenders add column if not exists state_restrictions text[] not null default '{}';
alter table lenders add column if not exists archived_at timestamptz null;

do $$
begin
  alter table lenders add constraint lenders_lender_tier_check check (lender_tier in ('A', 'B', 'C'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table lenders add constraint lenders_acquisition_stage_check check (
    acquisition_stage in (
      'Discovered',
      'Enriched',
      'Pending Review',
      'Approved',
      'Outreach Ready',
      'Contacted',
      'Responded',
      'Partnered',
      'Inactive'
    )
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table lenders add constraint lenders_approval_status_check check (approval_status in ('pending_review', 'approved', 'rejected', 'archived'));
exception
  when duplicate_object then null;
end $$;

create index if not exists lenders_acquisition_stage_idx on lenders (acquisition_stage, created_at desc);
create index if not exists lenders_lender_tier_idx on lenders (lender_tier, created_at desc);
create index if not exists lenders_approval_status_idx on lenders (approval_status, created_at desc);
create index if not exists lenders_website_url_idx on lenders (website_url);
