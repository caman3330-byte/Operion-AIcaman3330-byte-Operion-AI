-- Migration 0017: Real acquisition lead validation.
-- Production-safe and re-runnable. Adds evidence-based validation fields to leads.

alter table leads add column if not exists website_verified boolean not null default false;
alter table leads add column if not exists email_verified boolean not null default false;
alter table leads add column if not exists phone_verified boolean not null default false;
alter table leads add column if not exists business_verified boolean not null default false;
alter table leads add column if not exists validation_score integer not null default 0 check (validation_score >= 0 and validation_score <= 100);
alter table leads add column if not exists validation_reason text null;
alter table leads add column if not exists validation_timestamp timestamptz null;

create index if not exists idx_leads_validation_score on leads(validation_score desc);
create index if not exists idx_leads_business_verified on leads(business_verified, created_at desc);
create index if not exists idx_leads_website_verified on leads(website_verified, created_at desc);
