import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://dstqbiccseijydgsvlgj.supabase.co";
const supabaseServiceKey = "sb_secret_FF2EyUoPonIx37ZWrvRoCQ_SZ55mZ13";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function executeSQL() {
  const sql = `
    GRANT SELECT ON public.acquisition_prospects TO service_role;
    GRANT SELECT ON public.data_prospect_records TO service_role;
    GRANT SELECT ON public.data_import_batch_summaries TO service_role;
  `;

  try {
    const { data, error } = await supabase
      .from("_migrations")
      .select()
      .eq("name", "test")
      .limit(1);

    if (error) {
      console.error("Test query error:", error);
      return;
    }

    // Try to execute raw SQL via a different method
    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          apikey: supabaseServiceKey,
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    const result = await response.json();
    console.log("Response:", result);
  } catch (err) {
    console.error("Error:", err);
  }
}

executeSQL();
