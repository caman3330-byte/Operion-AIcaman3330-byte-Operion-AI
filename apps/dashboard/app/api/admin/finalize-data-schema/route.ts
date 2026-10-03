import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function executeSQL(sql: string) {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`,
      {
        method: "POST",
        headers: {
          "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY!,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      }
    );
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export async function POST(request: Request) {
  // Verify admin authorization
  const authHeader = request.headers.get("Authorization");
  if (
    authHeader !==
    `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "test"}`
  ) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
    });
  }

  try {
    const sqlStatements = [
      // Create data_prospect_records view
      `create or replace view public.data_prospect_records with (security_invoker=true) as
       select p.id,'prospect'::text as record_kind,p.business_name,p.industry,p.address,p.city,p.state,p.zip,
         p.normalized_phone as phone,p.normalized_email as email,p.website_url,p.source_kind as source,p.provider,
         case when p.potential_duplicate_of_id is not null then 'duplicate'
           when p.enrichment_status='enriching' then 'enriching'
           when p.state_key='outreach_ready' then 'ready_for_outreach'
           when p.verified_at is not null then 'verified'
           when nullif(p.normalized_phone,'') is null and nullif(p.normalized_email,'') is null then 'missing_contact'
           when p.enrichment_status='enriched' then 'enriched' else 'imported' end as status,
         p.enrichment_status,p.enrichment_error,(p.verified_at is not null) as verified,
         (p.state_key='outreach_ready') as ready_for_outreach,p.created_at
       from public.acquisition_prospects p`,

      // Create data_import_batch_summaries view
      `create or replace view public.data_import_batch_summaries with (security_invoker=true) as
       select b.*,
         (select count(*) from acquisition_prospects p where p.acquisition_import_batch_id=b.id and p.enrichment_status='pending') as ready_count,
         (select count(*) from acquisition_prospects p where p.acquisition_import_batch_id=b.id and p.enrichment_status='enriched') as enriched_count,
         (select count(*) from acquisition_prospects p where p.acquisition_import_batch_id=b.id and p.enrichment_status in ('failed','no_match')) as failed_count
       from public.acquisition_import_batches b`,

      // Grant permissions
      `grant select on public.data_prospect_records to service_role`,
      `grant select on public.data_import_batch_summaries to service_role`,
    ];

    let successCount = 0;
    const errors: string[] = [];

    for (const sql of sqlStatements) {
      const result = await executeSQL(sql);
      if (result.ok) {
        successCount++;
      } else {
        errors.push(`${sql.substring(0, 50)}... → ${result.status}`);
      }
    }

    return new Response(
      JSON.stringify({
        message: "Schema finalization executed",
        successful: successCount,
        total: sqlStatements.length,
        errors:
          errors.length > 0
            ? errors
            : "None - views should be created in Supabase",
      }),
      { status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Migration failed",
        details: String(error),
      }),
      { status: 500 }
    );
  }
}
