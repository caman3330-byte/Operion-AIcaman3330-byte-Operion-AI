#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function verifyAcquisitionSystem() {
  console.log('🔍 ACQUISITION SYSTEM DIAGNOSTIC\n');

  try {
    // 1. Check scheduler runs
    console.log('1️⃣  Checking acquisition history (scheduler runs)...');
    const { data: history, error: historyErr } = await supabase
      .from('acquisition_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (historyErr) {
      console.error(`   ❌ Error: ${historyErr.message}`);
    } else {
      console.log(`   ✅ Found ${history?.length || 0} runs`);
      if (history?.length > 0) {
        const latest = history[0];
        console.log(`   📊 Latest run: ${latest.created_at}`);
        console.log(`   🔎 Discovered: ${latest.metrics?.businesses_discovered || 0}`);
        console.log(`   ➕ Inserted: ${latest.metrics?.new_businesses_inserted || 0}`);
        console.log(`   ⏭️  Skipped (duplicates): ${latest.metrics?.duplicates_skipped || 0}`);
        console.log(`   ❌ Errors: ${latest.metrics?.errors?.length || 0}`);
      }
    }

    // 2. Check total Google Places acquisitions
    console.log('\n2️⃣  Checking total Google Places acquisitions...');
    const { count: totalGooglePlaces, error: countErr } = await supabase
      .from('acquisition_prospects')
      .select('*', { count: 'exact', head: true })
      .eq('provider', 'google_places')
      .eq('source_kind', 'ai');

    if (countErr) {
      console.error(`   ❌ Error: ${countErr.message}`);
    } else {
      console.log(`   ✅ Total: ${totalGooglePlaces || 0} businesses`);
    }

    // 3. Check enrichment status
    console.log('\n3️⃣  Checking enrichment status...');
    const { data: enrichmentStatus, error: enrichErr } = await supabase
      .from('acquisition_prospects')
      .select('enrichment_status')
      .eq('provider', 'google_places');

    if (enrichErr) {
      console.error(`   ❌ Error: ${enrichErr.message}`);
    } else {
      const statuses = enrichmentStatus?.reduce((acc, r) => {
        acc[r.enrichment_status] = (acc[r.enrichment_status] || 0) + 1;
        return acc;
      }, {}) || {};
      console.log(`   ✅ Status breakdown:`);
      Object.entries(statuses).forEach(([status, count]) => {
        console.log(`      ${status}: ${count}`);
      });
    }

    // 4. Check data_prospect_records view
    console.log('\n4️⃣  Checking data_prospect_records view...');
    const { data: prospects, count: prospectCount, error: viewErr } = await supabase
      .from('data_prospect_records')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'ai');

    if (viewErr) {
      console.error(`   ❌ Error: ${viewErr.message}`);
    } else {
      console.log(`   ✅ Total records accessible: ${prospectCount || 0}`);
    }

    // 5. Sample records
    console.log('\n5️⃣  Sample acquired businesses...');
    const { data: samples, error: sampleErr } = await supabase
      .from('acquisition_prospects')
      .select('id, business_name, city, state, provider, created_at')
      .eq('provider', 'google_places')
      .order('created_at', { ascending: false })
      .limit(3);

    if (sampleErr) {
      console.error(`   ❌ Error: ${sampleErr.message}`);
    } else if (samples && samples.length > 0) {
      console.log(`   ✅ Sample records:`);
      samples.forEach(r => {
        console.log(`      - ${r.business_name} (${r.city}, ${r.state})`);
      });
    } else {
      console.log('   ⚠️  No sample records found');
    }

    // 6. Check import batches
    console.log('\n6️⃣  Checking import batches...');
    const { data: batches, error: batchErr } = await supabase
      .from('acquisition_import_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (batchErr) {
      console.error(`   ❌ Error: ${batchErr.message}`);
    } else {
      console.log(`   ✅ Found ${batches?.length || 0} batches`);
      batches?.slice(0, 3).forEach(b => {
        console.log(`      - ${b.source_kind}/${b.provider}: ${b.created_at}`);
      });
    }

    console.log('\n✅ Diagnostic complete');

  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  }
}

verifyAcquisitionSystem();
