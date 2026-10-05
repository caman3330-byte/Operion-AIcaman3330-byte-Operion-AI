-- Preserve an owner name supplied by a manual file or found during research.
-- This remains DATA-only; it does not create leads or send outreach.

alter table public.acquisition_prospects
  add column if not exists owner_name text;

create index if not exists idx_acquisition_prospects_owner_name
  on public.acquisition_prospects(owner_name)
  where owner_name is not null;

comment on column public.acquisition_prospects.owner_name is
  'Owner or principal name supplied by the source file or verified during research.';

drop view if exists public.data_prospect_records;

-- Staging may intentionally contain only the DATA foundation. Build the
-- optional AI-candidate union only when its source tables exist.
do $$
begin
  if to_regclass('public.merchant_acquisition_candidates') is not null
     and to_regclass('public.merchant_acquisition_sources') is not null then
    execute $view$
      create view public.data_prospect_records with (security_invoker = true) as
      select
        p.id, 'prospect'::text as record_kind, p.business_name, p.owner_name,
        p.industry, p.address, p.city, p.state, p.zip,
        p.normalized_phone as phone, p.normalized_email as email, p.website_url,
        p.source_kind as source, p.provider,
        case when p.verified_at is not null then 'verified'
             when p.enrichment_status = 'enriched' then 'enriched'
             when p.normalized_email is null and p.normalized_phone is null then 'missing_contact'
             else 'imported' end as status,
        p.enrichment_status, p.enrichment_error,
        (p.verified_at is not null) as verified,
        (p.enrichment_status = 'enriched' and (p.normalized_email is not null or p.normalized_phone is not null)) as ready_for_outreach,
        p.created_at,
        coalesce((select array_agg(distinct b.source_kind order by b.source_kind)
          from public.acquisition_import_rows r
          join public.acquisition_import_batches b on b.id = r.batch_id
          where r.acquisition_prospect_id = p.id), array[p.source_kind]::text[]) as sources,
        jsonb_build_array(jsonb_build_object('source', p.source_kind, 'provider', p.provider,
          'batch_code', (select b.batch_code from public.acquisition_import_batches b where b.id = p.acquisition_import_batch_id),
          'original_filename', (select b.original_filename from public.acquisition_import_batches b where b.id = p.acquisition_import_batch_id),
          'row_number', p.source_row_number, 'created_at', p.created_at)) as provenance
      from public.acquisition_prospects p
      union all
      select c.id, 'candidate'::text, c.business_name, null::text, c.industry,
        c.raw_payload->>'address', c.raw_payload->>'city', c.state, c.raw_payload->>'zip',
        c.business_phone, c.business_email, c.website_url, 'ai'::text, s.source_name,
        case when c.enrichment_status::text in ('completed','verified') then 'verified' else c.enrichment_status::text end,
        c.enrichment_status::text, null::text,
        coalesce(c.website_verified or c.phone_verified or c.email_found, false), false,
        c.created_at, array['ai']::text[],
        jsonb_build_array(jsonb_build_object('source', 'ai', 'provider', s.source_name,
          'batch_code', null, 'original_filename', null, 'row_number', null, 'created_at', c.created_at))
      from public.merchant_acquisition_candidates c
      join public.merchant_acquisition_sources s on s.id = c.source_id
    $view$;
  else
    execute $view$
      create view public.data_prospect_records with (security_invoker = true) as
      select
        p.id, 'prospect'::text as record_kind, p.business_name, p.owner_name,
        p.industry, p.address, p.city, p.state, p.zip,
        p.normalized_phone as phone, p.normalized_email as email, p.website_url,
        p.source_kind as source, p.provider,
        case when p.verified_at is not null then 'verified'
             when p.enrichment_status = 'enriched' then 'enriched'
             when p.normalized_email is null and p.normalized_phone is null then 'missing_contact'
             else 'imported' end as status,
        p.enrichment_status, p.enrichment_error,
        (p.verified_at is not null) as verified,
        (p.enrichment_status = 'enriched' and (p.normalized_email is not null or p.normalized_phone is not null)) as ready_for_outreach,
        p.created_at,
        coalesce((select array_agg(distinct b.source_kind order by b.source_kind)
          from public.acquisition_import_rows r
          join public.acquisition_import_batches b on b.id = r.batch_id
          where r.acquisition_prospect_id = p.id), array[p.source_kind]::text[]) as sources,
        jsonb_build_array(jsonb_build_object('source', p.source_kind, 'provider', p.provider,
          'batch_code', (select b.batch_code from public.acquisition_import_batches b where b.id = p.acquisition_import_batch_id),
          'original_filename', (select b.original_filename from public.acquisition_import_batches b where b.id = p.acquisition_import_batch_id),
          'row_number', p.source_row_number, 'created_at', p.created_at)) as provenance
      from public.acquisition_prospects p
    $view$;
  end if;
end $$;

revoke all on public.data_prospect_records from public, anon, authenticated;
grant select on public.data_prospect_records to service_role;

-- Keep the confirmed upload path atomic and preserve owner/original-data fields.
create or replace function public.import_data_prospects(p_filename text, p_content_sha256 text, p_source_kind text, p_provider text, p_uploaded_by uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_batch_id uuid;
  v_existing_batch record;
  v_row jsonb;
  v_row_number integer;
  v_status text;
  v_identity_key text;
  v_prospect_id uuid;
  v_error_count integer := 0;
  v_duplicate_count integer := 0;
  v_imported_count integer := 0;
  v_missing_email integer := 0;
  v_missing_phone integer := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  if p_filename is null or btrim(p_filename) = '' or p_content_sha256 !~ '^[a-f0-9]{64}$'
     or p_source_kind not in ('manual', 'ai') or p_provider is null or btrim(p_provider) = '' then
    raise exception 'invalid DATA import request';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 5000 then
    raise exception 'DATA import must contain between 1 and 5000 rows';
  end if;

  select b.id, b.batch_code into v_existing_batch
  from acquisition_import_batches b where b.content_sha256 = p_content_sha256 limit 1;
  if found then
    select coalesce(jsonb_agg(jsonb_build_object(
      'row_number', r.row_number,
      'status', case when r.status = 'valid' then 'imported' else r.status end,
      'acquisition_prospect_id', r.acquisition_prospect_id,
      'errors', r.validation_errors
    ) order by r.row_number), '[]'::jsonb) into v_rows
    from acquisition_import_rows r where r.batch_id = v_existing_batch.id;
    return jsonb_build_object(
      'batch_id', v_existing_batch.id,
      'batch_code', v_existing_batch.batch_code,
      'replayed', true,
      'counts', (select jsonb_build_object(
        'total', count(*),
        'imported', count(*) filter (where status = 'imported'),
        'duplicate', count(*) filter (where status = 'duplicate'),
        'invalid', count(*) filter (where status = 'invalid'),
        'missing_email', count(*) filter (where coalesce(normalized_payload->>'email','') = ''),
        'missing_phone', count(*) filter (where coalesce(normalized_payload->>'phone','') = '')
      ) from acquisition_import_rows where batch_id = v_existing_batch.id),
      'enrichment', jsonb_build_object('ready', 0, 'enriched', 0, 'failed', 0),
      'rows', v_rows
    );
  end if;

  insert into acquisition_import_batches(batch_code, uploaded_by, original_filename, content_sha256, source_kind, provider, status, total_rows)
  values('DATA-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 8), p_uploaded_by, p_filename, p_content_sha256, p_source_kind, p_provider, 'confirmed', jsonb_array_length(p_rows))
  returning id into v_batch_id;

  for v_row, v_row_number in
    select value, coalesce(nullif(value->>'row_number','')::integer, ordinality::integer)
    from jsonb_array_elements(p_rows) with ordinality
  loop
    v_status := case when coalesce(jsonb_array_length(v_row->'errors'), 0) > 0 or coalesce(v_row->>'status','') = 'invalid' then 'invalid' else 'valid' end;
    v_identity_key := nullif(v_row->>'identity_key','');
    v_prospect_id := null;

    if v_status = 'valid' and v_identity_key is not null then
      select p.id into v_prospect_id from acquisition_prospects p where p.identity_key = v_identity_key limit 1;
      if v_prospect_id is not null then
        v_status := 'duplicate';
        v_duplicate_count := v_duplicate_count + 1;
      end if;
    end if;

    if v_status = 'valid' then
      insert into acquisition_prospects(
        identity_key, acquisition_import_batch_id, source_row_number,
        normalized_business_name, normalized_address, normalized_city, normalized_state, normalized_zip,
        normalized_email, normalized_phone, domain, business_name, address, city, state, zip, website_url,
        source_payload, owner_name, source_kind, provider, industry, enrichment_status
      ) values (
        coalesce(v_identity_key, 'unresolved-' || v_batch_id::text || '-' || v_row_number::text),
        v_batch_id, v_row_number,
        coalesce(v_row->>'normalized_business_name',''), coalesce(v_row->>'normalized_address',''), coalesce(v_row->>'normalized_city',''), coalesce(v_row->>'normalized_state',''), coalesce(v_row->>'normalized_zip',''),
        nullif(v_row->>'email',''), nullif(v_row->>'phone',''), nullif(v_row->>'domain',''), coalesce(v_row->>'business_name',''), nullif(v_row->>'address',''), nullif(v_row->>'city',''), nullif(v_row->>'state',''), nullif(v_row->>'zip',''), nullif(v_row->>'website_url',''),
        coalesce(v_row->'raw_payload', v_row), nullif(v_row->>'owner_name',''), p_source_kind, p_provider, nullif(v_row->>'industry',''), 'pending'
      ) returning id into v_prospect_id;
      v_imported_count := v_imported_count + 1;
    elsif v_status = 'invalid' then
      v_error_count := v_error_count + 1;
    end if;

    if coalesce(v_row->>'email','') = '' then v_missing_email := v_missing_email + 1; end if;
    if coalesce(v_row->>'phone','') = '' then v_missing_phone := v_missing_phone + 1; end if;

    insert into acquisition_import_rows(batch_id, row_number, status, duplicate_reason, validation_errors, normalized_payload, raw_payload, original_data, acquisition_prospect_id)
    values (
      v_batch_id, v_row_number, v_status,
      case when v_status = 'duplicate' then coalesce(v_row->>'duplicate_reason','business_location: existing prospect') else null end,
      coalesce(v_row->'errors','[]'::jsonb), v_row, coalesce(v_row->'raw_payload', v_row), coalesce(v_row->'raw_payload', v_row), v_prospect_id
    );
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('row_number', v_row_number, 'status', case when v_status = 'valid' then 'imported' else v_status end, 'acquisition_prospect_id', v_prospect_id, 'errors', coalesce(v_row->'errors','[]'::jsonb)));
  end loop;

  update acquisition_import_batches set valid_rows = v_imported_count, duplicate_rows = v_duplicate_count, invalid_rows = v_error_count,
    missing_email_rows = v_missing_email, missing_phone_rows = v_missing_phone, imported_at = now(), updated_at = now()
  where id = v_batch_id;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'batch_code', (select batch_code from acquisition_import_batches where id = v_batch_id),
    'replayed', false,
    'counts', jsonb_build_object('total', jsonb_array_length(p_rows), 'imported', v_imported_count, 'duplicate', v_duplicate_count, 'invalid', v_error_count, 'missing_email', v_missing_email, 'missing_phone', v_missing_phone),
    'enrichment', jsonb_build_object('ready', 0, 'enriched', 0, 'failed', 0),
    'rows', v_rows
  );
end $$;

revoke all on function public.import_data_prospects(text,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.import_data_prospects(text,text,text,text,uuid,jsonb) to service_role;

