create table company_cycles (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  company_key text not null references company_operating_state(company_key),
  status text not null default 'active' check (status in ('active','completed','failed')),
  phase text not null default 'OBSERVE',
  checkpoint jsonb not null default '{}',
  lease_token uuid,
  lease_until timestamptz,
  next_wake_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index company_one_active_cycle on company_cycles(company_key) where status='active';
alter table company_cycles enable row level security;
grant select,insert,update on company_cycles to service_role;
grant usage,select on sequence company_cycles_sequence_seq to service_role;

alter table agent_task_queue
  add column company_cycle_id uuid references company_cycles(id),
  add column cycle_task_key text,
  add column next_attempt_at timestamptz not null default now(),
  add column execution_attempts integer not null default 0,
  add column execution_token uuid,
  add column execution_lease_until timestamptz;
create unique index company_cycle_task_unique on agent_task_queue(company_cycle_id,cycle_task_key);
alter table agent_budget_windows add column reserved_usd numeric(10,6) not null default 0;

-- All durable mutations serialize on company state. No caller-supplied budget limits.
create function claim_company_cycle(p_token uuid) returns setof company_cycles
language plpgsql security definer set search_path=public as $$
declare s company_operating_state; c company_cycles;
begin
  select * into s from company_operating_state where company_key='operion' for update;
  if s.status <> 'OPERATIONAL' or s.emergency_stop then raise exception 'Company is not OPERATIONAL'; end if;
  select * into c from company_cycles where company_key='operion' and status='active' for update;
  if found then
    if c.lease_until > now() or c.next_wake_at > now() then return; end if;
  else
    insert into company_cycles(company_key) values ('operion') returning * into c;
  end if;
  return query update company_cycles set lease_token=p_token,lease_until=now()+interval '10 minutes',
    attempts=attempts+1,updated_at=now() where id=c.id returning *;
end $$;

create function checkpoint_company_cycle(p_id uuid,p_token uuid,p_phase text,p_patch jsonb,p_status text default 'active',p_delay integer default 0)
returns setof company_cycles language plpgsql security definer set search_path=public as $$
declare s company_operating_state;
begin
  select * into s from company_operating_state where company_key='operion' for update;
  if s.status <> 'OPERATIONAL' or s.emergency_stop then raise exception 'Company is not OPERATIONAL'; end if;
  if p_status not in ('active','completed','failed') or p_delay not between 0 and 86400 then raise exception 'Invalid checkpoint'; end if;
  return query update company_cycles set checkpoint=checkpoint || p_patch,phase=p_phase,status=p_status,
    next_wake_at=now()+make_interval(secs=>p_delay),updated_at=now(),
    completed_at=case when p_status <> 'active' then now() else null end
    where id=p_id and lease_token=p_token and lease_until>now() and status='active' returning *;
  if not found then raise exception 'Cycle lease lost'; end if;
end $$;

create function claim_company_task(p_id uuid,p_token uuid) returns setof agent_task_queue
language plpgsql security definer set search_path=public as $$
declare s company_operating_state; t agent_task_queue; scope_name text; scope_id text; cap numeric; b agent_budget_windows;
begin
  select * into s from company_operating_state where company_key='operion' for update;
  if s.status <> 'OPERATIONAL' or s.emergency_stop then raise exception 'Company is not OPERATIONAL'; end if;
  select * into t from agent_task_queue where id=p_id for update;
  if t.company_cycle_id is null or t.requires_approval or t.department_key <> 'merchant_acquisition'
     or t.workflow_key not in ('merchant_source_scan','merchant_acquisition_monitor')
     or t.assigned_agent_key not in ('source_scanner_agent','acquisition_monitor_agent') then raise exception 'Task policy denied'; end if;
  if not exists(select 1 from company_cycles where id=t.company_cycle_id and lease_token=p_token and lease_until>now() and status='active') then raise exception 'Cycle lease lost'; end if;
  if t.status not in ('queued','assigned','running') or t.next_attempt_at>now() then return; end if;
  if t.status='running' and t.execution_lease_until>now() then return; end if;
  if t.execution_attempts >= least(t.max_retries+1,3) then
    update agent_task_queue set status='failed',error_message='Recovery attempt limit reached',completed_at=now() where id=t.id;
    return;
  end if;
  if s.max_concurrent_tasks<=0 or (select count(*) from agent_task_queue where status='running' and execution_lease_until>now()) >= s.max_concurrent_tasks then return; end if;
  if t.budget_limit_usd < coalesce(t.cost_estimate_usd,0) or coalesce(t.cost_estimate_usd,0)<0 then raise exception 'Task budget exceeded'; end if;
  foreach scope_name in array array['company','department','agent','task'] loop
    scope_id := case scope_name when 'company' then 'operion' when 'department' then t.department_key when 'agent' then t.assigned_agent_key else t.id::text end;
    cap := case scope_name when 'company' then s.company_daily_ai_budget when 'department' then least(s.company_daily_ai_budget,10) when 'agent' then least(s.company_daily_ai_budget,5) else t.budget_limit_usd end;
    insert into agent_budget_windows(scope,scope_key,budget_usd) values(scope_name,scope_id,cap) on conflict(scope,scope_key,window_date) do nothing;
    select * into b from agent_budget_windows where scope=scope_name and scope_key=scope_id and window_date=current_date for update;
    if b.tasks_started >= (case scope_name when 'company' then s.company_daily_task_limit when 'department' then 30 when 'agent' then 20 else 3 end)
       or b.spent_usd+b.reserved_usd+coalesce(t.cost_estimate_usd,0)>least(b.budget_usd,cap) then raise exception 'Budget exceeded for %',scope_name; end if;
    update agent_budget_windows set reserved_usd=reserved_usd+coalesce(t.cost_estimate_usd,0),tasks_started=tasks_started+1 where id=b.id;
  end loop;
  return query update agent_task_queue set status='running',execution_token=p_token,execution_lease_until=now()+interval '2 minutes',
    execution_attempts=execution_attempts+1,started_at=coalesce(started_at,now()) where id=t.id returning *;
end $$;

revoke all on function claim_company_cycle(uuid) from public,anon,authenticated;
revoke all on function checkpoint_company_cycle(uuid,uuid,text,jsonb,text,integer) from public,anon,authenticated;
revoke all on function claim_company_task(uuid,uuid) from public,anon,authenticated;
grant execute on function claim_company_cycle(uuid) to service_role;
grant execute on function checkpoint_company_cycle(uuid,uuid,text,jsonb,text,integer) to service_role;
grant execute on function claim_company_task(uuid,uuid) to service_role;
notify pgrst,'reload schema';
