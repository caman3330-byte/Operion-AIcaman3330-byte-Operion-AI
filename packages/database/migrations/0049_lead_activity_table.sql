-- Track all activity for leads: views, contacts, enrichment, qualification, outreach, replies
-- Provides audit trail and timeline for each lead's lifecycle

create table if not exists public.lead_activity (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  action text not null check (action in ('viewed', 'contacted', 'enriched', 'qualified', 'outreach_sent', 'reply_received', 'application_submitted')),
  actor_id uuid references auth.users(id),
  actor_name text,
  details jsonb,
  created_at timestamp with time zone default now()
);

-- Indexes for efficient querying
create index idx_lead_activity_lead_id on public.lead_activity(lead_id);
create index idx_lead_activity_action on public.lead_activity(action);
create index idx_lead_activity_created_at on public.lead_activity(created_at desc);
create index idx_lead_activity_lead_created on public.lead_activity(lead_id, created_at desc);

-- Comments
comment on table public.lead_activity is
  'Audit trail for lead lifecycle events. Tracks who did what and when for each lead.';

comment on column public.lead_activity.action is
  'Type of activity: viewed (UI access), contacted (email/call), enriched (data completion), qualified (marked for outreach), outreach_sent (campaign), reply_received (inbound email), application_submitted (form fill).';

comment on column public.lead_activity.details is
  'JSON object with action-specific details. Examples: { campaign_id, recipients }, { fields_enriched }, { reply_from_email }, etc.';

-- Permissions
revoke all on public.lead_activity from public, anon, authenticated;
grant select, insert on public.lead_activity to service_role;
