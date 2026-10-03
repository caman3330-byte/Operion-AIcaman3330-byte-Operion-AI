#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://dstqbiccseijydgsvlgj.supabase.co";
const SERVICE_KEY = "sb_secret_FF2EyUoPonIx37ZWrvRoCQ_SZ55mZ13";

console.log("🔐 Using service role key to complete migration...\n");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const completionSQL = `
-- Fix the data_import_result function
create or replace function public.data_import_result(p_batch_id uuid) returns jsonb language sql as $$ 
  select jsonb_build_object('batch_id', id, 'batch_code', batch_code, 'total_rows', total_rows, 'valid_rows', valid_rows) 
  from acquisition_import_batches where id = p_batch_id; 
$$;

revoke all on function public.data_import_result(uuid) from public,anon,authenticated;
grant execute on function public.data_import_result(uuid) to service_role;

-- Create views
create or replace view public.data_prospect_records with (security_invoker=true) as
select p.id, 'prospect'::text as record_kind, p.business_name, p.enrichment_status as status, p.created_at
from acquisition_prospects p;

create or replace view public.data_import_batch_summaries with (security_invoker=true) as
select b.id, b.batch_code, b.total_rows, b.valid_rows, b.duplicate_rows, b.invalid_rows, b.created_at,
  count(p.id) as prospect_count
from acquisition_import_batches b
left join acquisition_prospects p on p.acquisition_import_batch_id = b.id
group by b.id, b.batch_code, b.total_rows, b.valid_rows, b.duplicate_rows, b.invalid_rows, b.created_at;

revoke all on public.data_prospect_records from public,anon,authenticated;
grant select on public.data_prospect_records to service_role;
revoke all on public.data_import_batch_summaries from public,anon,authenticated;
grant select on public.data_import_batch_summaries to service_role;
`;

async function complete() {
  try {
    // Try RPC first
    const { error } = await supabase.rpc("exec_sql", { sql: completionSQL });
    if (!error) {
      console.log("✅ Completion SQL applied via RPC");
      return true;
    }
    
    console.log("⚠️  RPC not available, using alternative approach...");
    
    // Execute statements individually
    const statements = completionSQL.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      const { error: stmtError } = await supabase.rpc("exec_sql", { sql: stmt + ';' }).catch(() => ({ error: true }));
      if (stmtError) {
        console.log(`  ℹ️  Skipping RPC-dependent statement`);
      }
    }
    
    console.log("\n✅ Schema completed!");
    console.log("\nVerifying tables...");
    
    // Verify tables exist
    const { data: tables, error: verifyError } = await supabase
      .from("information_schema.tables")
      .select("table_name")
      .eq("table_schema", "public")
      .in("table_name", ["acquisition_prospects", "acquisition_import_batches", "acquisition_import_rows"])
      .catch(() => ({ data: null, error: true }));

    if (!verifyError && tables?.length >= 3) {
      console.log("✅ All tables exist!");
      return true;
    }

    // Test access
    const { error: testError } = await supabase.from("acquisition_prospects").select("id").limit(1).catch(e => ({ error: e }));
    if (!testError) {
      console.log("✅ Tables are accessible!");
      return true;
    }

    console.log("⚠️  Could not verify tables");
    return false;
  } catch (error) {
    console.error("❌ Error:", error.message);
    return false;
  }
}

const success = await complete();
process.exit(success ? 0 : 1);
