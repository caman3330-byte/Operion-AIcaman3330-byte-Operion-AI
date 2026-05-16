alter type entity_type add value if not exists 'manager_agent';

create table if not exists manager_agent_runs (
  id uuid primary key default gen_random_uuid(),
  objective text not null,
  context jsonb,
  status text not null check (status in ('queued','running','completed','failed')) default 'queued',
  manager_model text,
  final_summary text,
  error_message text,
  requested_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

drop trigger if exists manager_agent_runs_set_updated_at on manager_agent_runs;
create trigger manager_agent_runs_set_updated_at
before update on manager_agent_runs
for each row execute function set_updated_at();

create table if not exists manager_agent_tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references manager_agent_runs(id) on delete cascade,
  agent_id text not null,
  agent_name text not null,
  title text not null,
  instructions text not null,
  priority text not null check (priority in ('low','medium','high','urgent')) default 'medium',
  status text not null check (status in ('assigned','in_progress','completed','failed','cancelled')) default 'assigned',
  result_summary text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

drop trigger if exists manager_agent_tasks_set_updated_at on manager_agent_tasks;
create trigger manager_agent_tasks_set_updated_at
before update on manager_agent_tasks
for each row execute function set_updated_at();

create index if not exists manager_agent_runs_status_created_idx on manager_agent_runs (status, created_at desc);
create index if not exists manager_agent_tasks_run_idx on manager_agent_tasks (run_id, created_at asc);
create index if not exists manager_agent_tasks_agent_status_idx on manager_agent_tasks (agent_id, status, created_at desc);

alter table manager_agent_runs enable row level security;
alter table manager_agent_tasks enable row level security;

-- RLS remains deny-by-default. Server-side API routes use SUPABASE_SERVICE_ROLE_KEY.
