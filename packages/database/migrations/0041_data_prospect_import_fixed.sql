-- DATA extends the existing acquisition foundation. No lead/outreach writes occur here.
-- This version includes necessary auth functions as prerequisites for RLS policies

-- Ensure app_role enum exists (from 0008)
do $$ begin
  create type app_role as enum ('customer', 'staff', 'supervisor', 'founder', 'admin', 'operator', 'analyst', 'super_admin');
exception
  when duplicate_object then null;
end $$;

-- Create current_app_role() function if it doesn't exist (from 0008)
-- This is required by the RLS policies below
create or replace function public.current_app_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'customer'::app_role)
$$;

-- Create is_internal_user() function if it doesn't exist (from 0008)
create or replace function public.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('staff', 'supervisor', 'founder')
$$;

-- Grant execute on these functions to authenticated users
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_internal_user() to authenticated;

-- Now apply the DATA-specific schema changes

alter table public.acquisition_import_batches
  add column if not exists source_kind text not null default 'manual' check (source_kind in ('manual','ai')),
  add column if not exists provider text not null default 'manual_upload';

alter table public.acquisition_prospects
  add column if not exists source_kind text not null default 'manual' check (source_kind in ('manual','ai')),
  add column if not exists provider text not null default 'manual_upload',
  add column if not exists industry text,
  add column if not exists enrichment_status text not null default 'pending' check (enrichment_status in ('pending','enriching','enriched','no_match','failed')),
  add column if not exists enrichment_error text,
  add column if not exists enriched_at timestamptz,
  add column if not exists verified_at timestamptz;

alter table public.acquisition_import_rows
  add column if not exists acquisition_prospect_id uuid references public.acquisition_prospects(id) on delete set null,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

create index if not exists idx_data_rows_prospect on public.acquisition_import_rows(acquisition_prospect_id,created_at);
create index if not exists idx_data_batches_content on public.acquisition_import_batches(source_kind,provider,content_sha256);
create index if not exists idx_data_prospects_source_created on public.acquisition_prospects(source_kind,created_at desc,id);
create index if not exists idx_data_prospects_enrichment on public.acquisition_prospects(enrichment_status,created_at);

-- API guards and direct table access both require a founder/admin role.
drop policy if exists "internal_manage_acquisition_import_batches" on public.acquisition_import_batches;
drop policy if exists "internal_manage_acquisition_import_rows" on public.acquisition_import_rows;
drop policy if exists "internal_manage_acquisition_prospects" on public.acquisition_prospects;
drop policy if exists "founder_manage_data_batches" on public.acquisition_import_batches;
create policy "founder_manage_data_batches" on public.acquisition_import_batches for all to authenticated
  using (public.current_app_role()::text in ('founder','admin','super_admin'))
  with check (public.current_app_role()::text in ('founder','admin','super_admin'));
drop policy if exists "founder_manage_data_rows" on public.acquisition_import_rows;
create policy "founder_manage_data_rows" on public.acquisition_import_rows for all to authenticated
  using (public.current_app_role()::text in ('founder','admin','super_admin'))
  with check (public.current_app_role()::text in ('founder','admin','super_admin'));
drop policy if exists "founder_manage_data_prospects" on public.acquisition_prospects;
create policy "founder_manage_data_prospects" on public.acquisition_prospects for all to authenticated
  using (public.current_app_role()::text in ('founder','admin','super_admin'))
  with check (public.current_app_role()::text in ('founder','admin','super_admin'));

create or replace function public.data_import_result(p_batch_id uuid, p_replayed boolean default false)
returns jsonb language sql stable security invoker set search_path=public as $$
  select jsonb_build_object(
    'batch_id', b.id, 'batch_code', b.batch_code, 'replayed', p_replayed,
    'counts', jsonb_build_object('total',b.total_rows,'imported',b.valid_rows,'duplicate',b.duplicate_rows,
      'invalid',b.invalid_rows,'missing_email',b.missing_email_rows,'missing_phone',b.missing_phone_rows),
    'enrichment', jsonb_build_object(
      'ready',(select count(*) from acquisition_prospects p where p.acquisition_import_batch_id=b.id and p.enrichment_status='pending'),
      'enriched',(select count(*) from acquisition_prospects p where p.acquisition_import_batch_id=b.id and p.enrichment_status='enriched'),
      'failed',(select count(*) from acquisition_prospects p where p.acquisition_import_batch_id=b.id and p.enrichment_status in ('failed','no_match'))),
    'rows',coalesce((select jsonb_agg(jsonb_build_object('row_number',r.row_number,'status',r.status,
      'acquisition_prospect_id',r.acquisition_prospect_id,'errors',r.validation_errors) order by r.row_number)
      from acquisition_import_rows r where r.batch_id=b.id),'[]'::jsonb))
  from acquisition_import_batches b where b.id=p_batch_id;
$$;

-- One transaction persists the batch, ALL raw rows (including invalid/duplicate rows),
-- and new prospects. A repeated request returns its original result.
create or replace function public.import_data_prospects(
  p_filename text, p_content_sha256 text, p_source_kind text, p_provider text,
  p_uploaded_by uuid, p_rows jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_batch acquisition_import_batches;
  v_row jsonb;
  v_id uuid;
  v_key text;
  v_status text;
  v_total integer := 0;
  v_imported integer := 0;
  v_duplicate integer := 0;
  v_invalid integer := 0;
  v_missing_email integer := 0;
  v_missing_phone integer := 0;
begin
  if p_source_kind not in ('manual','ai') or p_source_kind is null
    or nullif(btrim(p_provider),'') is null or nullif(btrim(p_filename),'') is null
    or p_content_sha256 is null or p_content_sha256 !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_rows) is distinct from 'array'
  then raise exception 'invalid DATA import request'; end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 5000
  then raise exception 'DATA import must contain between 1 and 5000 rows'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_source_kind||'|'||p_provider||'|'||p_content_sha256,0));
  select * into v_batch from acquisition_import_batches
    where source_kind=p_source_kind and provider=p_provider and content_sha256=p_content_sha256
      and status='confirmed' order by created_at limit 1;
  if found then return public.data_import_result(v_batch.id,true); end if;

  insert into acquisition_import_batches(batch_code,uploaded_by,original_filename,content_sha256,source_kind,provider,status)
    values('DATA-'||to_char(now(),'YYYYMMDD')||'-'||substr(gen_random_uuid()::text,1,8),p_uploaded_by,
      p_filename,p_content_sha256,p_source_kind,p_provider,'previewed') returning * into v_batch;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_total := v_total + 1;
    v_id := null;
    if nullif(v_row->>'email','') is null then v_missing_email := v_missing_email+1; end if;
    if nullif(v_row->>'phone','') is null then v_missing_phone := v_missing_phone+1; end if;
    if coalesce(v_row->>'status','invalid')='invalid' or nullif(btrim(v_row->>'business_name'),'') is null then
      v_status := 'invalid'; v_invalid := v_invalid+1;
    else
      -- An absent location gets a row-specific identity, never a shared email/domain identity.
      v_key := coalesce(nullif(v_row->>'identity_key',''),'unresolved:'||v_batch.id::text||':'||(v_row->>'row_number'));
      insert into acquisition_prospects(identity_key,acquisition_import_batch_id,source_row_number,
        normalized_business_name,normalized_address,normalized_city,normalized_state,normalized_zip,
        normalized_email,normalized_phone,domain,business_name,address,city,state,zip,website_url,
        industry,source_kind,provider,source_payload,state_key)
      values(v_key,v_batch.id,(v_row->>'row_number')::integer,
        v_row->>'normalized_business_name',coalesce(v_row->>'normalized_address',''),coalesce(v_row->>'normalized_city',''),
        coalesce(v_row->>'normalized_state',''),coalesce(v_row->>'normalized_zip',''),
        nullif(v_row->>'email',''),nullif(v_row->>'phone',''),nullif(v_row->>'domain',''),v_row->>'business_name',
        nullif(v_row->>'address',''),nullif(v_row->>'city',''),nullif(v_row->>'state',''),nullif(v_row->>'zip',''),
        nullif(v_row->>'website_url',''),nullif(v_row->>'industry',''),p_source_kind,p_provider,
        coalesce(v_row->'raw_payload','{}'::jsonb),'prospect')
      on conflict(identity_key) do nothing returning id into v_id;
      if v_id is null then
        select id into strict v_id from acquisition_prospects where identity_key=v_key;
        v_status := 'duplicate'; v_duplicate := v_duplicate+1;
      else
        v_status := 'imported'; v_imported := v_imported+1;
      end if;
    end if;
    insert into acquisition_import_rows(batch_id,row_number,status,duplicate_reason,validation_errors,
      normalized_payload,raw_payload,acquisition_prospect_id)
    values(v_batch.id,(v_row->>'row_number')::integer,v_status,
      case when v_status='duplicate' then coalesce(v_row->>'duplicate_reason','business_location: existing prospect') else null end,
      coalesce(v_row->'errors','[]'::jsonb),v_row - 'raw_payload',coalesce(v_row->'raw_payload','{}'::jsonb),v_id);
  end loop;
  update acquisition_import_batches set status='confirmed',imported_at=now(),total_rows=v_total,valid_rows=v_imported,
    duplicate_rows=v_duplicate,invalid_rows=v_invalid,missing_email_rows=v_missing_email,missing_phone_rows=v_missing_phone
    where id=v_batch.id;
  return public.data_import_result(v_batch.id,false);
end $$;

revoke all on function public.import_data_prospects(text,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.import_data_prospects(text,text,text,text,uuid,jsonb) to service_role;
revoke all on function public.data_import_result(uuid,boolean) from public,anon,authenticated;
grant execute on function public.data_import_result(uuid,boolean) to service_role;

-- This server-only read model supports one ordered, counted and filtered result across
-- canonical prospects and the existing provider candidates without copying old data.
create or replace view public.data_prospect_records with (security_invoker=true) as
select p.id,'prospect'::text as record_kind,p.business_name,p.industry,p.address,p.city,p.state,p.zip,
  p.normalized_phone as phone,p.normalized_email as email,p.website_url,p.source_kind as source,p.provider,
  case when p.potential_duplicate_of_id is not null then 'duplicate'
    when p.enrichment_status='enriching' then 'enriching'
    when p.state_key='outreach_ready' then 'ready_for_outreach'
    when p.verified_at is not null then 'verified'
    when nullif(p.normalized_phone,'') is null and nullif(p.normalized_email,'') is null then 'missing_contact'
    when p.enrichment_status='enriched' then 'enriched' else 'imported' end as status,
  p.enrichment_status,p.enrichment_error,(p.verified_at is not null) as verified,
  (p.state_key='outreach_ready') as ready_for_outreach,p.created_at,
  array(select distinct source_kind from (
    select p.source_kind union all select b.source_kind from acquisition_import_rows r
    join acquisition_import_batches b on b.id=r.batch_id where r.acquisition_prospect_id=p.id
  ) sources) as sources,
  jsonb_build_array(jsonb_build_object('source',p.source_kind,'provider',p.provider,'batch_code',b.batch_code,
    'original_filename',b.original_filename,'row_number',p.source_row_number,'created_at',p.created_at)) as provenance
from public.acquisition_prospects p join public.acquisition_import_batches b on b.id=p.acquisition_import_batch_id
union all
select c.id,'candidate'::text,c.business_name,nullif(c.industry,''),nullif(c.raw_payload->>'address',''),
  nullif(c.raw_payload->>'city',''),c.state,nullif(c.raw_payload->>'zip',''),
  nullif(coalesce(nullif(c.business_phone,''),c.source_phone),''),nullif(c.business_email,''),c.website_url,
  'ai'::text,s.source_name,
  case when c.enrichment_status='running' then 'enriching'
    when c.identity_match and c.website_verified then 'verified'
    when nullif(c.business_email,'') is null and nullif(coalesce(nullif(c.business_phone,''),c.source_phone),'') is null then 'missing_contact'
    when c.enrichment_status='completed' then 'enriched' else 'imported' end,
  c.enrichment_status::text,c.rejection_reason,(c.identity_match and c.website_verified),false,c.created_at,
  array['ai']::text[],
  jsonb_build_array(jsonb_build_object('source','ai','provider',s.source_name,'batch_code',null,
    'original_filename',null,'row_number',null,'created_at',c.created_at))
from public.merchant_acquisition_candidates c join public.merchant_acquisition_sources s on s.id=c.source_id;

revoke all on public.data_prospect_records from public,anon,authenticated;
grant select on public.data_prospect_records to service_role;

create or replace view public.data_import_batch_summaries with (security_invoker=true) as
select b.*,jsonb_build_object(
  'ready',count(p.id) filter(where p.enrichment_status='pending'),
  'enriched',count(p.id) filter(where p.enrichment_status='enriched'),
  'failed',count(p.id) filter(where p.enrichment_status in ('failed','no_match'))
) as enrichment
from public.acquisition_import_batches b left join public.acquisition_prospects p on p.acquisition_import_batch_id=b.id
group by b.id;
revoke all on public.data_import_batch_summaries from public,anon,authenticated;
grant select on public.data_import_batch_summaries to service_role;
