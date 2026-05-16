-- Operion Capital Phase 1 MVP public funding platform schema

create type application_status as enum (
  'draft',
  'submitted',
  'ai_review',
  'qualified',
  'needs_review',
  'matched',
  'funded',
  'declined',
  'withdrawn'
);

create type credit_score_range as enum (
  'under_550',
  '550_599',
  '600_649',
  '650_699',
  '700_plus',
  'unknown'
);

create type funding_product_type as enum ('mca', 'business_loan', 'line_of_credit', 'equipment_financing', 'unknown');

create table if not exists users (
  id uuid primary key,
  email text not null unique,
  full_name text null,
  phone text null,
  role text not null default 'applicant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references users(id) on delete set null,
  business_name text not null,
  industry text not null,
  website_url text null,
  state text null,
  annual_revenue numeric(14, 2) null,
  monthly_deposits numeric(14, 2) null,
  time_in_business_months integer null,
  tax_id_last4 text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references users(id) on delete set null,
  business_id uuid not null references businesses(id) on delete cascade,
  lead_id uuid null references leads(id) on delete set null,
  status application_status not null default 'submitted',
  product_type funding_product_type not null default 'mca',
  requested_amount numeric(14, 2) not null check (requested_amount > 0),
  monthly_revenue numeric(14, 2) null,
  monthly_deposits numeric(14, 2) not null check (monthly_deposits >= 0),
  credit_score_range credit_score_range not null default 'unknown',
  owner_name text not null,
  contact_email text not null,
  contact_phone text not null,
  funding_purpose text null,
  consent_to_contact boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_qualification_logs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid null references applications(id) on delete cascade,
  lead_id uuid null references leads(id) on delete set null,
  provider text not null default 'openai',
  model text null,
  score integer null check (score is null or (score >= 0 and score <= 100)),
  tier lead_tier null,
  decision text null,
  reason text null,
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  latency_ms integer null,
  created_at timestamptz not null default now()
);

alter table lenders add column if not exists lender_type text null default 'mca';
alter table lenders add column if not exists minimum_time_in_business_months integer null;
alter table lenders add column if not exists minimum_monthly_deposits numeric(14, 2) null;

create index if not exists idx_users_email on users(email);
create index if not exists idx_businesses_user_id on businesses(user_id);
create index if not exists idx_applications_user_status on applications(user_id, status, created_at desc);
create index if not exists idx_applications_business_id on applications(business_id);
create index if not exists idx_applications_lead_id on applications(lead_id) where lead_id is not null;
create index if not exists idx_ai_qualification_logs_application_id on ai_qualification_logs(application_id, created_at desc);
create index if not exists idx_ai_qualification_logs_lead_id on ai_qualification_logs(lead_id, created_at desc);

drop trigger if exists users_set_updated_at on users;
create trigger users_set_updated_at
before update on users
for each row execute function set_updated_at();

drop trigger if exists businesses_set_updated_at on businesses;
create trigger businesses_set_updated_at
before update on businesses
for each row execute function set_updated_at();

drop trigger if exists applications_set_updated_at on applications;
create trigger applications_set_updated_at
before update on applications
for each row execute function set_updated_at();

alter table users enable row level security;
alter table businesses enable row level security;
alter table applications enable row level security;
alter table ai_qualification_logs enable row level security;
