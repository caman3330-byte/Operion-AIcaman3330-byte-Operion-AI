const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://dstqbiccseijydgsvlgj.supabase.co';
const supabaseServiceKey = 'sb_secret_FF2EyUoPonIx37ZWrvRoCQ_SZ55mZ13';

const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function grantPermissions() {
  const sqls = [
    'GRANT SELECT ON public.acquisition_prospects TO service_role;',
    'GRANT SELECT ON public.data_prospect_records TO service_role;',
    'GRANT SELECT ON public.data_import_batch_summaries TO service_role;'
  ];

  for (const sql of sqls) {
    const { data, error } = await admin.rpc("query", {
      query: sql,
    });

    if (error) {
      console.error('Error:', error.message);
    } else {
      console.log('Executed:', sql.substring(0, 50) + '...');
    }
  }
}

grantPermissions();
