import { createClient } from "@supabase/supabase-js";

// Use service role key for deletion - only test data
const supabaseUrl = "https://dstqbiccseijydgsvlgj.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

async function deleteTestData() {
  try {
    console.log("Fetching test businesses (provider='test_discovery')...");

    const { data: testRecords, error: fetchError } = await supabase
      .from("acquisition_prospects")
      .select("id, business_name, provider")
      .eq("provider", "test_discovery");

    if (fetchError) {
      console.error("Error fetching test records:", fetchError);
      process.exit(1);
    }

    if (!testRecords || testRecords.length === 0) {
      console.log("✓ No test businesses found. Database is clean.");
      process.exit(0);
    }

    console.log(`Found ${testRecords.length} test businesses:`);
    testRecords.forEach((record) => {
      console.log(`  - ${record.business_name} (id: ${record.id})`);
    });

    // Delete only test records
    console.log("\nDeleting test records...");
    const { error: deleteError, count } = await supabase
      .from("acquisition_prospects")
      .delete()
      .eq("provider", "test_discovery");

    if (deleteError) {
      console.error("Error deleting test records:", deleteError);
      process.exit(1);
    }

    console.log(`✓ Deleted ${count} test business records`);

    // Verify deletion
    console.log("\nVerifying deletion...");
    const { data: remainingRecords, error: verifyError } = await supabase
      .from("acquisition_prospects")
      .select("COUNT(*)", { count: "exact" })
      .eq("provider", "test_discovery");

    if (verifyError) {
      console.error("Error verifying deletion:", verifyError);
      process.exit(1);
    }

    console.log("✓ Verification complete. No test records remain in database.");
    process.exit(0);
  } catch (error) {
    console.error("Unexpected error:", error);
    process.exit(1);
  }
}

deleteTestData();
