-- Atomic prospect promotion to Lead
-- Prevents orphan Leads and duplicate promotion under concurrent access

create or replace function public.promote_prospect_to_lead(
  p_prospect_id uuid,
  p_business_name text,
  p_contact_name text default null,
  p_email text default null,
  p_phone text default null,
  p_industry text default null,
  p_state text default null
)
returns table(
  lead_id uuid,
  replayed boolean,
  success boolean,
  error_message text
) language plpgsql security definer set search_path=public as $$
declare
  v_lead_id uuid;
  v_existing_lead_id uuid;
  v_error_msg text;
begin
  -- Check if already promoted
  select lead_id into v_existing_lead_id
  from acquisition_prospects
  where id = p_prospect_id;

  if v_existing_lead_id is not null then
    return query select v_existing_lead_id::uuid, true::boolean, true::boolean, null::text;
    return;
  end if;

  -- Atomically create lead and link prospect
  -- This prevents orphan leads by ensuring both operations succeed or both fail
  begin
    insert into leads (
      business_name,
      contact_name,
      email,
      phone,
      industry,
      state,
      status
    ) values (
      p_business_name,
      p_contact_name,
      p_email,
      p_phone,
      p_industry,
      p_state,
      'raw'
    ) returning leads.id into v_lead_id;

    -- Link prospect - this update is inside the same transaction
    update acquisition_prospects
    set lead_id = v_lead_id,
        state_key = 'outreach_ready',
        updated_at = now()
    where id = p_prospect_id
      and lead_id is null;

    if not found then
      -- Lost race - another request already linked this prospect
      -- Clean up the orphan lead we just created
      delete from leads where id = v_lead_id;

      -- Get the winning lead
      select lead_id into v_existing_lead_id
      from acquisition_prospects
      where id = p_prospect_id;

      return query select v_existing_lead_id::uuid, true::boolean, true::boolean, null::text;
      return;
    end if;

    return query select v_lead_id::uuid, false::boolean, true::boolean, null::text;
  exception when others then
    v_error_msg := sqlerrm;
    return query select null::uuid, false::boolean, false::boolean, v_error_msg;
  end;
end
$$;

comment on function public.promote_prospect_to_lead is
  'Atomically promotes a prospect to a Lead. Prevents duplicate Leads and orphans. Returns (lead_id, replayed, success, error_message). Replayed=true means the prospect was already promoted or another request won the race.';
