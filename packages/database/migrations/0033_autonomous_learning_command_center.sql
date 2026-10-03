create table if not exists agent_evaluations (
  id uuid primary key default gen_random_uuid(),
  evaluation_key text not null unique,
  window_start timestamptz not null,
  window_end timestamptz not null,
  source_id uuid references merchant_acquisition_sources(id) on delete set null,
  agent_key text references agent_definitions(agent_key) on delete set null,
  task_id uuid references agent_task_queue(id) on delete set null,
  evaluation_type text not null check (evaluation_type in ('source_performance','agent_performance','ai_performance','failure')),
  metrics jsonb not null default '{}'::jsonb,
  outcome text not null check (outcome in ('positive','neutral','negative','insufficient_evidence')),
  evidence jsonb not null default '{}'::jsonb,
  evaluator text not null default 'autonomous_evaluator',
  created_at timestamptz not null default now()
);

create table if not exists agent_lessons (
  id uuid primary key default gen_random_uuid(),
  lesson_key text not null unique,
  evaluation_id uuid references agent_evaluations(id) on delete cascade,
  source_id uuid references merchant_acquisition_sources(id) on delete set null,
  agent_key text references agent_definitions(agent_key) on delete set null,
  task_id uuid references agent_task_queue(id) on delete set null,
  lesson_type text not null check (lesson_type in ('source_priority','source_cooldown','task_priority','agent_selection','extraction_strategy','ai_model_routing')),
  conclusion text not null,
  confidence numeric(5,4) not null default 0 check (confidence >= 0 and confidence <= 1),
  evidence jsonb not null default '{}'::jsonb,
  created_by text not null default 'autonomous_evaluator',
  created_at timestamptz not null default now()
);

create table if not exists agent_strategy_updates (
  id uuid primary key default gen_random_uuid(),
  strategy_key text not null unique,
  lesson_id uuid references agent_lessons(id) on delete cascade,
  source_id uuid references merchant_acquisition_sources(id) on delete set null,
  agent_key text references agent_definitions(agent_key) on delete set null,
  task_id uuid references agent_task_queue(id) on delete set null,
  strategy_type text not null check (strategy_type in ('source_priority','source_cooldown','task_priority','agent_selection','extraction_strategy','ai_model_routing')),
  previous_value jsonb,
  new_value jsonb not null,
  reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  applied boolean not null default false,
  applied_at timestamptz,
  created_by text not null default 'autonomous_evaluator',
  created_at timestamptz not null default now()
);

create index if not exists agent_evaluations_source_time_idx on agent_evaluations (source_id, created_at desc);
create index if not exists agent_evaluations_agent_time_idx on agent_evaluations (agent_key, created_at desc);
create index if not exists agent_lessons_source_time_idx on agent_lessons (source_id, created_at desc);
create index if not exists agent_strategy_updates_source_time_idx on agent_strategy_updates (source_id, created_at desc);
create index if not exists agent_strategy_updates_type_applied_idx on agent_strategy_updates (strategy_type, applied, created_at desc);

alter table agent_evaluations enable row level security;
alter table agent_lessons enable row level security;
alter table agent_strategy_updates enable row level security;
