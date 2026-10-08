import { getSupabaseAdmin } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { NextRequest } from "next/server";

const TEST_MARKERS = [
  "RPC Test",
  "FINAL-TEST",
  "Cleanup Test",
  "LEADS-CONCURRENT",
  "LEADS-TEST",
  "Concurrent Test",
  "Audit Test Corp",
  "Sync Canonical",
  "Suppression Test",
  "Search Sort Filter",
  "Email Ready",
  "Metrics Test",
];

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const supabase = await getSupabaseAdmin();

    let prospectCount = 0;
    let leadCount = 0;

    // Clean up prospect fixtures
    for (const marker of TEST_MARKERS) {
      const { count: pCount, error: pError } = await (supabase as any)
        .from("acquisition_prospects")
        .delete({ count: "exact" })
        .or(
          `business_name.ilike.%${marker}%,owner_name.ilike.%${marker}%`
        );

      if (!pError && pCount) {
        prospectCount += pCount;
      }
    }

    // Clean up lead fixtures
    for (const marker of TEST_MARKERS) {
      const { count: lCount, error: lError } = await supabase
        .from("leads")
        .delete({ count: "exact" })
        .or(
          `business_name.ilike.%${marker}%,contact_name.ilike.%${marker}%`
        );

      if (!lError && lCount) {
        leadCount += lCount;
      }
    }

    return NextResponse.json({
      success: true,
      cleaned: {
        prospects: prospectCount,
        leads: leadCount,
      },
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
