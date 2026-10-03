-- The public route invokes this single RPC with a token hash and validated payload.
-- Row locking and the function transaction make concurrent first submissions converge.
create or replace function public.submit_acquisition_application(
  p_token_hash text,
  p_application jsonb,
  p_lead jsonb
) returns table(application_id uuid, lead_id uuid, replayed boolean)
language plpgsql security definer set search_path = public as $$
declare s acquisition_application_sessions; a business_applications; l leads;
begin
  select * into s from acquisition_application_sessions
  where token_hash=p_token_hash and expires_at > now() for update;
  if not found then raise exception 'invalid or expired application session'; end if;
  if s.application_id is not null and s.lead_id is not null then
    return query select s.application_id,s.lead_id,true; return;
  end if;
  if s.application_id is not null or s.lead_id is not null then
    raise exception 'incomplete acquisition session requires operator recovery';
  end if;
  insert into business_applications (
    acquisition_prospect_id, status, business_name, industry, state, website_url,
    annual_revenue, monthly_revenue, monthly_deposits, requested_amount, product_type,
    credit_score_range, owner_name, contact_email, contact_phone, consent_to_contact, metadata
  ) values (
    s.acquisition_prospect_id, 'submitted', p_application->>'business_name', p_application->>'industry',
    nullif(p_application->>'state',''), nullif(p_application->>'website_url',''),
    nullif(p_application->>'annual_revenue','')::numeric, nullif(p_application->>'monthly_revenue','')::numeric,
    (p_application->>'monthly_deposits')::numeric, (p_application->>'requested_amount')::numeric,
    coalesce((p_application->>'product_type')::funding_product_type,'mca'),
    coalesce((p_application->>'credit_score_range')::credit_score_range,'unknown'),
    p_application->>'owner_name', p_application->>'contact_email', p_application->>'contact_phone', true, p_application
  ) returning * into a;
  insert into leads (business_name,contact_name,email,phone,industry,state,status,business_application_id,acquisition_prospect_id)
  values (p_lead->>'business_name',nullif(p_lead->>'contact_name',''),nullif(p_lead->>'email',''),nullif(p_lead->>'phone',''),nullif(p_lead->>'industry',''),nullif(p_lead->>'state',''),'submitted',a.id,s.acquisition_prospect_id)
  returning * into l;
  update business_applications set lead_id=l.id where id=a.id;
  update acquisition_application_sessions set application_id=a.id,lead_id=l.id,submitted_at=now() where id=s.id;
  update acquisition_prospects set business_application_id=a.id,lead_id=l.id,state_key='application_submitted' where id=s.acquisition_prospect_id;
  return query select a.id,l.id,false;
end $$;
revoke all on function public.submit_acquisition_application(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_acquisition_application(text,jsonb,jsonb) to service_role;
