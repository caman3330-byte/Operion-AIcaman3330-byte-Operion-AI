import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log("\n=== VERIFYING 0048 ATOMIC PROMOTION RPC ===\n");

// 1. Check if the function exists in information_schema
console.log("1. Checking if promote_prospect_to_lead() exists in database...");
const { data: functions, error: funcError } = await supabase.rpc("information_schema_tables");

if (funcError) {
  console.log("   (Could not query information_schema directly)");
  console.log("   Attempting alternative check via function call...");
} else {
  console.log("   ✓ Database query accessible");
}

// 2. Try calling the RPC with test data
console.log("\n2. Testing RPC with synthetic data...");

// First, create a test prospect
const testProspectId = "test-" + Date.now();
const { data: prospect, error: prospectError } = await supabase
  .from("acquisition_prospects")
  .insert({
    id: testProspectId,
    business_name: "Test RPC Verification",
    owner_name: "Test Owner",
    normalized_email: "test-rpc@test.test",
    normalized_phone: "(555) 123-4567",
    enrichment_status: "enriched",
    state_key: "prospect",
    source_kind: "manual",
    provider: "test_verification"
  })
  .select("id")
  .single();

if (prospectError) {
  console.error("   ❌ Failed to create test prospect:", prospectError.message);
  process.exit(1);
}

console.log("   ✓ Test prospect created:", testProspectId);

// 3. Now try calling the RPC
console.log("\n3. Calling promote_prospect_to_lead() RPC...");
const { data: result, error: rpcError } = await supabase.rpc("promote_prospect_to_lead", {
  p_prospect_id: testProspectId,
  p_business_name: "Test RPC Verification",
  p_contact_name: "Test Owner",
  p_email: "test-rpc@test.test",
  p_phone: "(555) 123-4567",
  p_industry: "Technology",
  p_state: "CA"
});

if (rpcError) {
  console.error("   ❌ RPC DOES NOT EXIST or failed:", rpcError.message);
  console.error("   Error code:", rpcError.code);

  // Clean up test prospect
  await supabase.from("acquisition_prospects").delete().eq("id", testProspectId);

  console.log("\n   ACTION REQUIRED: Apply 0048_atomic_promotion.sql to Supabase SQL editor");
  process.exit(1);
} else {
  console.log("   ✓ RPC EXISTS and returned result:");
  console.log("     lead_id:", result?.[0]?.lead_id);
  console.log("     replayed:", result?.[0]?.replayed);
  console.log("     success:", result?.[0]?.success);
  console.log("     error_message:", result?.[0]?.error_message);

  // Verify the result
  if (result?.[0]?.success && result?.[0]?.lead_id) {
    console.log("\n   ✓✓ RPC VERIFIED IN ACTIVE DATABASE");

    // Clean up
    const leadId = result[0].lead_id;
    await supabase.from("leads").delete().eq("id", leadId);
    await supabase.from("acquisition_prospects").delete().eq("id", testProspectId);
    console.log("   ✓ Test data cleaned up");
  } else {
    console.log("   ⚠ RPC returned but with unexpected result");
  }
}

console.log("\n=== END VERIFICATION ===\n");
