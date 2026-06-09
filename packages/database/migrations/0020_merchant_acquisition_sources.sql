do $$ begin
  create type merchant_source_type as enum ('chamber', 'association', 'directory', 'contractor_listing', 'company_seed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type merchant_source_health_status as enum ('active', 'degraded', 'blocked', 'disabled');
exception when duplicate_object then null;
end $$;

create table if not exists merchant_acquisition_sources (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique,
  source_name text not null,
  source_type merchant_source_type not null,
  industry text not null,
  state text,
  active boolean not null default true,
  health_status merchant_source_health_status not null default 'active',
  last_scanned_at timestamptz,
  success_rate numeric(5,2) not null default 0 check (success_rate >= 0 and success_rate <= 100),
  scan_success_count integer not null default 0 check (scan_success_count >= 0),
  scan_failure_count integer not null default 0 check (scan_failure_count >= 0),
  robots_blocked_count integer not null default 0 check (robots_blocked_count >= 0),
  extracted_business_count integer not null default 0 check (extracted_business_count >= 0),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_merchant_acquisition_sources_updated_at on merchant_acquisition_sources;
create trigger set_merchant_acquisition_sources_updated_at
before update on merchant_acquisition_sources
for each row execute function set_updated_at();

create index if not exists idx_merchant_acquisition_sources_active on merchant_acquisition_sources(active);
create index if not exists idx_merchant_acquisition_sources_health on merchant_acquisition_sources(health_status);
create index if not exists idx_merchant_acquisition_sources_industry on merchant_acquisition_sources(lower(industry));
create index if not exists idx_merchant_acquisition_sources_last_scanned on merchant_acquisition_sources(last_scanned_at);

create table if not exists merchant_acquisition_source_scans (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references merchant_acquisition_sources(id) on delete cascade,
  status acquisition_job_status not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  extracted_businesses integer not null default 0 check (extracted_businesses >= 0),
  verified_businesses integer not null default 0 check (verified_businesses >= 0),
  rejected_businesses integer not null default 0 check (rejected_businesses >= 0),
  duplicate_businesses integer not null default 0 check (duplicate_businesses >= 0),
  robots_blocked boolean not null default false,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_merchant_source_scans_source on merchant_acquisition_source_scans(source_id, started_at desc);
create index if not exists idx_merchant_source_scans_status on merchant_acquisition_source_scans(status);

insert into merchant_acquisition_sources (source_url, source_name, source_type, industry, state, metadata)
values
  ('https://www.nrca.net/Members', 'NRCA Member Directory', 'association', 'roofing', null, '{"starter":true}'::jsonb),
  ('https://www.nationalroofingdirectory.org/', 'National Roofing Directory', 'directory', 'roofing', null, '{"starter":true}'::jsonb),
  ('https://www.chamberofcommerce.com/business-directory/texas/dallas/roofing-contractor', 'Dallas Roofing Contractors - Chamber', 'directory', 'roofing', 'TX', '{"starter":true}'::jsonb),
  ('https://www.chamberofcommerce.com/business-directory/texas/houston/roofing-contractor', 'Houston Roofing Contractors - Chamber', 'directory', 'roofing', 'TX', '{"starter":true}'::jsonb),
  ('https://www.chamberofcommerce.com/business-directory/florida/tampa/roofing-contractor', 'Tampa Roofing Contractors - Chamber', 'directory', 'roofing', 'FL', '{"starter":true}'::jsonb),
  ('https://www.acca.org/directories/', 'ACCA Directories', 'association', 'hvac', null, '{"starter":true}'::jsonb),
  ('https://hvac-contractors.acca.org/acca-at-home', 'ACCA Contractor Locator', 'association', 'hvac', null, '{"starter":true}'::jsonb),
  ('https://www.tacca.org/page/MemberDirectory', 'TACCA Member Directory', 'association', 'hvac', 'TX', '{"starter":true}'::jsonb),
  ('https://www.miacca.org/Contractor-Directory', 'MIACCA Contractor Directory', 'association', 'hvac', 'MI', '{"starter":true}'::jsonb),
  ('https://www.chamberofcommerce.com/business-directory/florida/tampa/hvac-contractor', 'Tampa HVAC Contractors - Chamber', 'directory', 'hvac', 'FL', '{"starter":true}'::jsonb),
  ('https://www.phccsd.org/find-a-contractor', 'PHCC San Diego Find a Contractor', 'association', 'plumbing', 'CA', '{"starter":true}'::jsonb),
  ('https://mapic.org/', 'MAPIC Plumbing and Mechanical Contractors', 'association', 'plumbing', 'OH', '{"starter":true}'::jsonb),
  ('https://www.chamberofcommerce.com/business-directory/texas/houston/plumber', 'Houston Plumbers - Chamber', 'directory', 'plumbing', 'TX', '{"starter":true}'::jsonb),
  ('https://www.chamberofcommerce.com/business-directory/florida/tampa/plumber', 'Tampa Plumbers - Chamber', 'directory', 'plumbing', 'FL', '{"starter":true}'::jsonb),
  ('https://www.chamberofcommerce.com/business-directory/georgia/atlanta/plumber', 'Atlanta Plumbers - Chamber', 'directory', 'plumbing', 'GA', '{"starter":true}'::jsonb),
  ('https://www.necanet.org/about-neca/directories', 'NECA Member Directories', 'association', 'electrical', null, '{"starter":true}'::jsonb),
  ('https://www.usaec.org/', 'USAEC Accredited Electrical Contractors', 'association', 'electrical', null, '{"starter":true}'::jsonb),
  ('https://locate.eap.org/', 'Electrical Association of Philadelphia Locator', 'association', 'electrical', 'PA', '{"starter":true}'::jsonb),
  ('https://iecfwtc.org/membership/member-directory/', 'IEC Fort Worth Member Directory', 'association', 'electrical', 'TX', '{"starter":true}'::jsonb),
  ('https://www.chamberofcommerce.com/business-directory/georgia/atlanta/electrician', 'Atlanta Electricians - Chamber', 'directory', 'electrical', 'GA', '{"starter":true}'::jsonb),
  ('https://members.texasbuilders.org/associate-directory', 'Texas Builders Associate Directory', 'association', 'construction', 'TX', '{"starter":true}'::jsonb),
  ('https://asahouston.org/membership/member-directory/', 'ASA Houston Member Directory', 'association', 'construction', 'TX', '{"starter":true}'::jsonb),
  ('https://www.houstoncontractors.org/search/', 'Houston Contractors Association Search', 'association', 'construction', 'TX', '{"starter":true}'::jsonb),
  ('https://www.jcbassociation.org/', 'Johnson County Builders Association', 'association', 'construction', 'TX', '{"starter":true}'::jsonb),
  ('https://www.chamberofcommerce.com/business-directory/georgia/atlanta/trucking-company', 'Atlanta Trucking Companies - Chamber', 'directory', 'trucking', 'GA', '{"starter":true}'::jsonb)
on conflict (source_url) do update set
  source_name = excluded.source_name,
  source_type = excluded.source_type,
  industry = excluded.industry,
  state = excluded.state,
  metadata = merchant_acquisition_sources.metadata || excluded.metadata,
  active = true,
  updated_at = now();
