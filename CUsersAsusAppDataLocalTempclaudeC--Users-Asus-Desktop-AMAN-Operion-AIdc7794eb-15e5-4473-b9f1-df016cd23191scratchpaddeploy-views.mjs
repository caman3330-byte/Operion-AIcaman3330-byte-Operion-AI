import pg from 'pg';

const { Client } = pg;

const client = new Client({
  host: 'db.dstqbiccseijydgsvlgj.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres.dstqbiccseijydgsvlgj',
  password: 'sb_secret_FF2EyUoPonIx37ZWrvRoCQ_SZ55mZ13',
  ssl: 'require'
});

async function deployViews() {
  try {
    console.log("🔗 Connecting to Supabase database...");
    await client.connect();
    console.log("✅ Connected\n");

    // Create views
    console.log("📋 Creating data_prospect_records view...");
    await client.query(`
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
        (p.state_key='outreach_ready') as ready_for_outreach,p.created_at
      from public.acquisition_prospects p
    `);
    console.log("✅ data_prospect_records view created\n");

    console.log("📋 Creating data_import_batch_summaries view...");
    await client.query(`
      create or replace view public.data_import_batch_summaries with (security_invoker=true) as
      select b.*,
        (select count(*) from acquisition_prospects p where p.acquisition_import_batch_id=b.id and p.enrichment_status='pending') as ready_count,
        (select count(*) from acquisition_prospects p where p.acquisition_import_batch_id=b.id and p.enrichment_status='enriched') as enriched_count,
        (select count(*) from acquisition_prospects p where p.acquisition_import_batch_id=b.id and p.enrichment_status in ('failed','no_match')) as failed_count
      from public.acquisition_import_batches b
    `);
    console.log("✅ data_import_batch_summaries view created\n");

    console.log("🔐 Granting permissions...");
    await client.query('grant select on public.data_prospect_records to service_role');
    await client.query('grant select on public.data_import_batch_summaries to service_role');
    console.log("✅ Permissions granted\n");

    // Verify views exist
    console.log("🔍 Verifying views...");
    const { rows } = await client.query(`
      select table_name, table_type from information_schema.tables 
      where table_schema='public' and table_name in ('data_prospect_records','data_import_batch_summaries')
      order by table_name
    `);
    
    if (rows.length === 2) {
      console.log("✅ Both views successfully created:");
      rows.forEach(row => console.log(`   - ${row.table_name}`));
    } else {
      console.log(`⚠️  Found ${rows.length}/2 views`);
      rows.forEach(row => console.log(`   - ${row.table_name}`));
    }

    console.log("\n✨ Migration complete! /data and /data/manual-upload are ready");

    await client.end();
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    if (err.message.includes('connect ECONNREFUSED')) {
      console.error("   Connection refused - network might be blocking PostgreSQL port");
    } else if (err.message.includes('password')) {
      console.error("   Authentication failed");
    }
    await client.end().catch(() => {});
    process.exit(1);
  }
}

await deployViews();
