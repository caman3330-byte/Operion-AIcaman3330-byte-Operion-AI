do $$ begin
  create type merchant_candidate_enrichment_status as enum ('queued', 'running', 'completed', 'failed', 'rejected');
exception when duplicate_object then null;
end $$;

create table if not exists merchant_acquisition_candidates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references merchant_acquisition_sources(id) on delete cascade,
  business_name text not null,
  website_url text not null,
  domain text not null,
  industry text not null,
  state text,
  source_phone text,
  business_phone text,
  business_email text,
  contact_page_url text,
  company_description text,
  website_verified boolean not null default false,
  phone_verified boolean not null default false,
  email_found boolean not null default false,
  identity_match boolean not null default false,
  enrichment_status merchant_candidate_enrichment_status not null default 'queued',
  quality_score integer not null default 0 check (quality_score >= 0 and quality_score <= 100),
  rejection_reason text,
  last_enriched_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_merchant_acquisition_candidates_updated_at on merchant_acquisition_candidates;
create trigger set_merchant_acquisition_candidates_updated_at
before update on merchant_acquisition_candidates
for each row execute function set_updated_at();

create unique index if not exists idx_merchant_candidates_source_domain_unique
on merchant_acquisition_candidates(source_id, lower(domain));
create index if not exists idx_merchant_candidates_status on merchant_acquisition_candidates(enrichment_status);
create index if not exists idx_merchant_candidates_source on merchant_acquisition_candidates(source_id);
create index if not exists idx_merchant_candidates_quality on merchant_acquisition_candidates(quality_score desc);
create index if not exists idx_merchant_candidates_verified on merchant_acquisition_candidates(website_verified, phone_verified, identity_match);
