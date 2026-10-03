-- Completed cycles retain a durable cooldown across runtime restarts.
create or replace function claim_company_cycle(p_token uuid) returns setof company_cycles
language plpgsql security definer set search_path=public as $$
declare s company_operating_state; c company_cycles;
begin
  select * into s from company_operating_state where company_key='operion' for update;
  if s.status <> 'OPERATIONAL' or s.emergency_stop then raise exception 'Company is not OPERATIONAL'; end if;
  select * into c from company_cycles where company_key='operion' and status='active' for update;
  if found then
    if c.lease_until > now() or c.next_wake_at > now() then return; end if;
  else
    if exists(select 1 from company_cycles where company_key='operion' and next_wake_at>now()) then return; end if;
    insert into company_cycles(company_key) values ('operion') returning * into c;
  end if;
  return query update company_cycles set lease_token=p_token,lease_until=now()+interval '10 minutes',
    attempts=attempts+1,updated_at=now() where id=c.id returning *;
end $$;
revoke all on function claim_company_cycle(uuid) from public,anon,authenticated;
grant execute on function claim_company_cycle(uuid) to service_role;
notify pgrst,'reload schema';
