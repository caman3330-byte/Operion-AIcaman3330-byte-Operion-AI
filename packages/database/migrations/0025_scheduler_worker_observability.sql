create table if not exists scheduler_execution_runs (
  id uuid primary key default gen_random_uuid(),
  scheduler_key text not null,
  route_path text not null,
  cron_schedule text null,
  status text not null check (status in ('started', 'completed', 'failed', 'skipped', 'disabled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  duration_ms integer null check (duration_ms is null or duration_ms >= 0),
  worker_name text null,
  queue_name text null,
  queue_affected integer not null default 0 check (queue_affected >= 0),
  success boolean null,
  error_message text null,
  environment_flag text null,
  environment_flag_enabled boolean null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists worker_heartbeats (
  worker_name text primary key,
  department text not null,
  status text not null check (status in ('online', 'offline', 'running', 'idle', 'failed')),
  queue_name text null,
  queue_size integer not null default 0 check (queue_size >= 0),
  current_task text null,
  last_completed_task text null,
  last_heartbeat_at timestamptz not null default now(),
  last_started_at timestamptz null,
  last_completed_at timestamptz null,
  average_execution_ms integer null check (average_execution_ms is null or average_execution_ms >= 0),
  last_duration_ms integer null check (last_duration_ms is null or last_duration_ms >= 0),
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_scheduler_execution_runs_key_started
  on scheduler_execution_runs(scheduler_key, started_at desc);

create index if not exists idx_scheduler_execution_runs_status_started
  on scheduler_execution_runs(status, started_at desc);

create index if not exists idx_worker_heartbeats_status
  on worker_heartbeats(status, last_heartbeat_at desc);

alter table scheduler_execution_runs enable row level security;
alter table worker_heartbeats enable row level security;

drop policy if exists "internal_read_scheduler_execution_runs" on scheduler_execution_runs;
create policy "internal_read_scheduler_execution_runs"
  on scheduler_execution_runs for select to authenticated using (public.is_internal_user());

drop policy if exists "internal_read_worker_heartbeats" on worker_heartbeats;
create policy "internal_read_worker_heartbeats"
  on worker_heartbeats for select to authenticated using (public.is_internal_user());
