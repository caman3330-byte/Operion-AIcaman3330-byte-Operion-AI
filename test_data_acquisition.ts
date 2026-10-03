import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://dstqbiccseijydgsvlgj.supabase.co";
const supabaseServiceKey = "sb_secret_FF2EyUoPonIx37ZWrvRoCQ_SZ55mZ13";

const admin = createClient(supabaseUrl, supabaseServiceKey);

// Test businesses to insert
const testBusinesses = [
  {
    business_name: "TechVision Solutions",
    industry: "Software Development",
    address: "123 Tech Street",
    city: "Dallas",
    state: "TX",
    zip: "75001",
    normalized_email: "contact@techvision.com",
    normalized_phone: "+14155551234",
    website_url: "https://techvision.com",
    source_kind: "ai",
    provider: "test_discovery",
    enrichment_status: "enriched",
    state_key: "prospect"
  },
  {
    business_name: "Green Building Corp",
    industry: "Construction",
    address: "456 Build Ave",
    city: "Austin",
    state: "TX",
    zip: "78701",
    normalized_email: "hello@greenbuilding.com",
    normalized_phone: "+15125552345",
    website_url: "https://greenbuilding.com",
    source_kind: "ai",
    provider: "test_discovery",
    enrichment_status: "enriched",
    state_key: "prospect"
  },
  {
    business_name: "Peak Consulting Group",
    industry: "Business Services",
    address: "789 Consulting Blvd",
    city: "Houston",
    state: "TX",
    zip: "77001",
    normalized_email: "info@peakconsulting.com",
    normalized_phone: "+17135553456",
    website_url: "https://peakconsulting.com",
    source_kind: "ai",
    provider: "test_discovery",
    enrichment_status: "enriched",
    state_key: "prospect"
  },
  {
    business_name: "SwiftLogistics Inc",
    industry: "Transportation & Logistics",
    address: "321 Logistics Pkwy",
    city: "San Antonio",
    state: "TX",
    zip: "78201",
    normalized_email: "dispatch@swiftlogistics.com",
    normalized_phone: "+12105554567",
    website_url: "https://swiftlogistics.com",
    source_kind: "ai",
    provider: "test_discovery",
    enrichment_status: "enriched",
    state_key: "prospect"
  },
  {
    business_name: "Elite Marketing Partners",
    industry: "Marketing & Advertising",
    address: "654 Marketing Lane",
    city: "Dallas",
    state: "TX",
    zip: "75202",
    normalized_email: "hello@elitemarketing.com",
    normalized_phone: "+14155555678",
    website_url: "https://elitemarketing.com",
    source_kind: "ai",
    provider: "test_discovery",
    enrichment_status: "enriched",
    state_key: "prospect"
  }
];

async function insertTestBusinesses() {
  console.log("Inserting test businesses...");
  try {
    const { data, error } = await admin
      .from("acquisition_prospects")
      .insert(testBusinesses)
      .select();

    if (error) {
      console.error("Insert error:", error.message);
      return;
    }

    console.log(`Successfully inserted ${data?.length ?? 0} test businesses`);
    console.log("\nInserted businesses:");
    data?.forEach((b) => {
      console.log(`  - ${b.business_name} (${b.city}, ${b.state})`);
    });

    // Verify the data can be queried
    console.log("\nVerifying data in data_prospect_records view...");
    const { data: viewData, error: viewError } = await admin
      .from("data_prospect_records")
      .select("*")
      .eq("source", "ai")
      .limit(10);

    if (viewError) {
      console.error("View query error:", viewError.message);
      return;
    }

    console.log(`Found ${viewData?.length ?? 0} records in view`);
    viewData?.forEach((r) => {
      console.log(`  - ${r.business_name} (Status: ${r.status})`);
    });
  } catch (err) {
    console.error("Error:", err);
  }
}

insertTestBusinesses();
