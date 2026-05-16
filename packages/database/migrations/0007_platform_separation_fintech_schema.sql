-- Operion Capital platform separation and enterprise fintech readiness schema

create type notification_channel as enum ('email', 'in_app', 'sms', 'webhook');
create type notification_status as enum ('queued', 'sent', 'failed', 'read', 'archived');
create type crm_activity_type as enum ('note', 'call', 'email', 'status_change', 'document_request', 'lender_update');
create type underwriting_review_status as enum ('queued', 'in_review', 'approved', 'needs_information', 'declined', 'escalated');

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references users(id) on delete set null,
  application_id uuid null references applications(id) on delete cascade,
  channel notification_channel not null default 'in_app',
  status notification_status not null default 'queued',
  title text not null,
  message text not null,
  action_url text null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz null,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crm_activities (
  id uuid primary key default gen_random_uuid(),
  application_id uuid null references applications(id) on delete cascade,
  business_id uuid null references businesses(id) on delete set null,
  lead_id uuid null references leads(id) on delete set null,
  actor_id text null,
  actor_type text not null default 'system',
  activity_type crm_activity_type not null,
  subject text not null,
  body text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists underwriting_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  assigned_to text null,
  status underwriting_review_status not null default 'queued',
  risk_score integer null check (risk_score is null or (risk_score >= 0 and risk_score <= 100)),
  funding_recommendation text null,
  requested_documents jsonb not null default '[]'::jsonb,
  notes text null,
  ai_summary text null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_status on notifications(user_id, status, created_at desc);
create index if not exists idx_notifications_application_id on notifications(application_id, created_at desc);
create index if not exists idx_crm_activities_application_id on crm_activities(application_id, created_at desc);
create index if not exists idx_crm_activities_business_id on crm_activities(business_id, created_at desc);
create index if not exists idx_underwriting_reviews_application_status on underwriting_reviews(application_id, status, created_at desc);

drop trigger if exists notifications_set_updated_at on notifications;
create trigger notifications_set_updated_at
before update on notifications
for each row execute function set_updated_at();

drop trigger if exists underwriting_reviews_set_updated_at on underwriting_reviews;
create trigger underwriting_reviews_set_updated_at
before update on underwriting_reviews
for each row execute function set_updated_at();

alter table notifications enable row level security;
alter table crm_activities enable row level security;
alter table underwriting_reviews enable row level security;
