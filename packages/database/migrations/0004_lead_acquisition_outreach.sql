do $$ begin
  create type lead_source_type as enum ('apollo', 'google_maps', 'directory', 'website', 'manual_upload', 'n8n', 'api');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type acquisition_job_type as enum ('business_discovery', 'lead_ingestion', 'enrichment', 'contact_extraction', 'deduplication', 'quality_scoring', 'outreach_prep');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type acquisition_job_status as enum ('queued', 'running', 'completed', 'failed', 'blocked', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type enrichment_status as enum ('queued', 'running', 'completed', 'failed', 'skipped');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type outreach_campaign_status as enum ('draft', 'pending_approval', 'active', 'paused', 'completed', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type outreach_email_status as enum ('queued', 'pending_approval', 'sending', 'sent', 'failed', 'cancelled', 'skipped');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type reply_classification as enum ('positive', 'neutral', 'negative', 'question', 'opt_out', 'bounce', 'unknown');
exception when duplicate_object then null;
end $$;

alter type entity_type add value if not exists 'acquisition';
alter type entity_type add value if not exists 'campaign';

create table if not exists lead_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  name text not null,
  source_type lead_source_type not null,
  description text,
  config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_lead_sources_updated_at on lead_sources;
create trigger set_lead_sources_updated_at
before update on lead_sources
for each row execute function set_updated_at();

create table if not exists business_contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  source_id uuid references lead_sources(id) on delete set null,
  full_name text,
  first_name text,
  last_name text,
  title text,
  email text,
  phone text,
  linkedin_url text,
  website_url text,
  confidence_score integer check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 100)),
  is_primary boolean not null default false,
  source_record_id text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_business_contacts_updated_at on business_contacts;
create trigger set_business_contacts_updated_at
before update on business_contacts
for each row execute function set_updated_at();

create unique index if not exists idx_business_contacts_lead_email_unique
on business_contacts (lead_id, lower(email))
where email is not null;
create index if not exists idx_business_contacts_lead_id on business_contacts(lead_id);
create index if not exists idx_business_contacts_email on business_contacts(lower(email)) where email is not null;

create table if not exists lead_enrichment (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  source_id uuid references lead_sources(id) on delete set null,
  status enrichment_status not null default 'queued',
  provider text,
  normalized_business_name text,
  website_url text,
  domain text,
  industry text,
  employee_count integer check (employee_count is null or employee_count >= 0),
  annual_revenue_est numeric(14,2) check (annual_revenue_est is null or annual_revenue_est >= 0),
  funding_signals jsonb not null default '{}'::jsonb,
  contact_confidence_score integer check (contact_confidence_score is null or (contact_confidence_score >= 0 and contact_confidence_score <= 100)),
  quality_score integer check (quality_score is null or (quality_score >= 0 and quality_score <= 100)),
  duplicate_group_key text,
  raw_payload jsonb not null default '{}'::jsonb,
  error_message text,
  enriched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_lead_enrichment_updated_at on lead_enrichment;
create trigger set_lead_enrichment_updated_at
before update on lead_enrichment
for each row execute function set_updated_at();

create index if not exists idx_lead_enrichment_lead_id on lead_enrichment(lead_id);
create index if not exists idx_lead_enrichment_status on lead_enrichment(status);
create index if not exists idx_lead_enrichment_domain on lead_enrichment(lower(domain)) where domain is not null;
create index if not exists idx_lead_enrichment_quality_score on lead_enrichment(quality_score);

create table if not exists acquisition_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references lead_sources(id) on delete set null,
  job_type acquisition_job_type not null,
  status acquisition_job_status not null default 'queued',
  requested_by text,
  assigned_agent_key text,
  approval_id uuid references agent_approval_requests(id) on delete set null,
  parameters jsonb not null default '{}'::jsonb,
  counts jsonb not null default '{}'::jsonb,
  result_summary text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

drop trigger if exists set_acquisition_jobs_updated_at on acquisition_jobs;
create trigger set_acquisition_jobs_updated_at
before update on acquisition_jobs
for each row execute function set_updated_at();

create index if not exists idx_acquisition_jobs_status on acquisition_jobs(status);
create index if not exists idx_acquisition_jobs_type on acquisition_jobs(job_type);
create index if not exists idx_acquisition_jobs_created_at on acquisition_jobs(created_at desc);

create table if not exists outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status outreach_campaign_status not null default 'draft',
  audience_filter jsonb not null default '{}'::jsonb,
  created_by text,
  approved_by text,
  approved_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_outreach_campaigns_updated_at on outreach_campaigns;
create trigger set_outreach_campaigns_updated_at
before update on outreach_campaigns
for each row execute function set_updated_at();

create index if not exists idx_outreach_campaigns_status on outreach_campaigns(status);
create index if not exists idx_outreach_campaigns_created_at on outreach_campaigns(created_at desc);

create table if not exists outreach_sequences (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references outreach_campaigns(id) on delete cascade,
  step_number integer not null check (step_number > 0),
  delay_hours integer not null default 0 check (delay_hours >= 0),
  subject_template text not null,
  body_template text not null,
  channel text not null default 'email',
  send_window jsonb not null default '{}'::jsonb,
  requires_approval boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, step_number)
);

drop trigger if exists set_outreach_sequences_updated_at on outreach_sequences;
create trigger set_outreach_sequences_updated_at
before update on outreach_sequences
for each row execute function set_updated_at();

create index if not exists idx_outreach_sequences_campaign on outreach_sequences(campaign_id, step_number);

create table if not exists outreach_email_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references outreach_campaigns(id) on delete set null,
  sequence_id uuid references outreach_sequences(id) on delete set null,
  lead_id uuid not null references leads(id) on delete cascade,
  contact_id uuid references business_contacts(id) on delete set null,
  to_email text not null,
  subject text not null,
  html_body text not null,
  text_body text,
  status outreach_email_status not null default 'pending_approval',
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  retry_count integer not null default 0 check (retry_count >= 0),
  max_retries integer not null default 3 check (max_retries >= 0),
  last_error text,
  provider_message_id text,
  approval_id uuid references agent_approval_requests(id) on delete set null,
  ai_generated boolean not null default false,
  created_by_agent_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_outreach_email_queue_updated_at on outreach_email_queue;
create trigger set_outreach_email_queue_updated_at
before update on outreach_email_queue
for each row execute function set_updated_at();

create index if not exists idx_outreach_email_queue_status_scheduled on outreach_email_queue(status, scheduled_at);
create index if not exists idx_outreach_email_queue_lead_id on outreach_email_queue(lead_id);
create index if not exists idx_outreach_email_queue_campaign_id on outreach_email_queue(campaign_id);

create table if not exists outreach_replies (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references outreach_campaigns(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  contact_id uuid references business_contacts(id) on delete set null,
  provider_message_id text,
  from_email text not null,
  subject text,
  body_text text,
  body_html text,
  received_at timestamptz not null default now(),
  classification reply_classification not null default 'unknown',
  intent_score integer check (intent_score is null or (intent_score >= 0 and intent_score <= 100)),
  sentiment text,
  requires_follow_up boolean not null default false,
  escalated boolean not null default false,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_outreach_replies_updated_at on outreach_replies;
create trigger set_outreach_replies_updated_at
before update on outreach_replies
for each row execute function set_updated_at();

create index if not exists idx_outreach_replies_received_at on outreach_replies(received_at desc);
create index if not exists idx_outreach_replies_classification on outreach_replies(classification);
create index if not exists idx_outreach_replies_lead_id on outreach_replies(lead_id);

insert into lead_sources (source_key, name, source_type, description, config)
values
  ('apollo', 'Apollo', 'apollo', 'Apollo people and company enrichment connector.', '{"requires_api_key": true}'::jsonb),
  ('google_maps', 'Google Maps Business Discovery', 'google_maps', 'Business directory discovery adapter for local MCA verticals.', '{"requires_connector": true}'::jsonb),
  ('website_extraction', 'Website Contact Extraction', 'website', 'Website parser adapter for contact and domain extraction.', '{"requires_http_fetch": true}'::jsonb),
  ('manual_upload', 'Manual Upload', 'manual_upload', 'Founder or workflow supplied lead imports.', '{}'::jsonb),
  ('n8n_webhook', 'n8n Webhook', 'n8n', 'External workflow ingress for acquisition and outreach events.', '{}'::jsonb)
on conflict (source_key) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  description = excluded.description,
  config = excluded.config,
  active = true,
  updated_at = now();

insert into workflow_routes (workflow_key, name, trigger_type, department_key, primary_agent_key, fallback_agent_key, requires_approval, approval_policy)
values
  ('business_discovery', 'Business Discovery', 'api_or_n8n', 'operations', 'lead_generation_agent', 'operations_manager_agent', false, '{}'::jsonb),
  ('contact_extraction', 'Website Contact Extraction', 'api_or_n8n', 'operations', 'lead_generation_agent', 'operations_manager_agent', false, '{}'::jsonb),
  ('acquisition_enrichment', 'Acquisition Enrichment', 'api_or_n8n', 'operations', 'lead_generation_agent', 'operations_manager_agent', false, '{"dedup_required": true}'::jsonb),
  ('outreach_sdr_prep', 'AI SDR Outreach Prep', 'api_or_n8n', 'operations', 'outreach_agent', 'operations_manager_agent', true, '{"approval_type": "outreach_copy_approval"}'::jsonb),
  ('outreach_follow_up', 'Outreach Follow-up', 'schedule_or_n8n', 'operations', 'outreach_agent', 'operations_manager_agent', false, '{"suppression_check_required": true}'::jsonb),
  ('reply_classification', 'Reply Classification', 'sendgrid_webhook', 'operations', 'outreach_agent', 'operations_manager_agent', false, '{}'::jsonb),
  ('hot_lead_escalation', 'Hot Lead Escalation', 'system', 'sales', 'sales_agent', 'executive_manager_agent', true, '{"approval_type": "hot_lead_review"}'::jsonb)
on conflict (workflow_key) do update set
  name = excluded.name,
  trigger_type = excluded.trigger_type,
  department_key = excluded.department_key,
  primary_agent_key = excluded.primary_agent_key,
  fallback_agent_key = excluded.fallback_agent_key,
  requires_approval = excluded.requires_approval,
  approval_policy = excluded.approval_policy,
  active = true,
  updated_at = now();
