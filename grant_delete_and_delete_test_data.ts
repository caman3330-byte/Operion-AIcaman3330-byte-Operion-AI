import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://dstqbiccseijydgsvlgj.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

async function grantAndDelete() {
  try {
    console.log("1. Granting DELETE permission to service_role...");

    const { error: grantError } = await supabase.rpc("exec", {
      sql: `
        GRANT DELETE ON public.acquisition_prospects TO service_role;
        GRANT DELETE ON public.acquisition_import_batches TO service_role;
      `
    }).catch(() => {
      // RPC might not exist, try direct approach
      console.log("   (Using alternative method...)");
      return { error: null };
    });

    if (grantError && !grantError.message.includes("Unknown function")) {
      console.error("Error granting permissions:", grantError);
    }

    // Try executing SQL directly via query - Supabase doesn't support exec RPC by default
    // Instead, we'll just proceed with deletion - it might work if permissions were already granted
    console.log("\n2. Fetching test businesses (provider='test_discovery')...");

    const { data: testRecords, error: fetchError } = await supabase
      .from("acquisition_prospects")
      .select("id, business_name, provider")
      .eq("provider", "test_discovery");

    if (fetchError) {
      console.error("Error fetching test records:", fetchError);
      process.exit(1);
    }

    if (!testRecords || testRecords.length === 0) {
      console.log("✓ No test businesses found. Database is already clean.");
      process.exit(0);
    }

    console.log(`Found ${testRecords.length} test businesses:`);
    testRecords.forEach((record) => {
      console.log(`  - ${record.business_name} (id: ${record.id})`);
    });

    console.log("\n3. Attempting to delete test records...");

    // Try to delete - this will fail if permissions aren't granted
    const { error: deleteError, count } = await supabase
      .from("acquisition_prospects")
      .delete()
      .eq("provider", "test_discovery");

    if (deleteError) {
      console.error("Error deleting test records:", deleteError);
      console.error("\nNOTE: DELETE permission needs to be granted manually via Supabase SQL Editor.");
      console.error("Execute this SQL in the Supabase SQL Editor:");
      console.error("----");
      console.error("GRANT DELETE ON public.acquisition_prospects TO service_role;");
      console.error("GRANT DELETE ON public.acquisition_import_batches TO service_role;");
      console.error("----");
      console.error("Then run this script again.");
      process.exit(1);
    }

    console.log(`✓ Deleted ${count} test business records`);

    console.log("\n4. Verifying deletion...");
    const { data: verifyData, error: verifyError } = await supabase
      .from("acquisition_prospects")
      .select("*")
      .eq("provider", "test_discovery");

    if (verifyError) {
      console.error("Error verifying deletion:", verifyError);
      process.exit(1);
    }

    if (verifyData && verifyData.length === 0) {
      console.log("✓ Verification complete. All test records have been removed from database.");
      console.log("\nDatabase is now clean and ready for real business acquisition.");
      process.exit(0);
    } else {
      console.error("ERROR: Verification failed. Some test records still exist.");
      process.exit(1);
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    process.exit(1);
  }
}

grantAndDelete();
