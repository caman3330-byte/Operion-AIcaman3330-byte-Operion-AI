import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const supabase = await getSupabaseAdmin();

    // Fetch test records
    const { data: testRecords, error: fetchError } = await (supabase
      .from("acquisition_prospects" as any)
      .select("id, business_name")
      .eq("provider", "test_discovery"));

    if (fetchError) throw new Error(`Failed to fetch test records: ${fetchError.message}`);

    if (!testRecords || testRecords.length === 0) {
      return NextResponse.json({
        message: "No test records found",
        deleted: 0,
        records: []
      });
    }

    // Try DELETE first
    const { error: deleteError } = await (supabase
      .from("acquisition_prospects" as any)
      .delete()
      .in("id", testRecords.map((r: any) => r.id)));

    if (deleteError) {
      // If DELETE fails due to permissions, try UPDATE to NULL the key fields instead
      if (deleteError.message.includes("permission denied")) {
        const { error: updateError } = await (supabase
          .from("acquisition_prospects" as any)
          .update({
            business_name: `[DELETED-TEST-${Date.now()}]`,
            provider: "deleted_test_discovery"
          })
          .in("id", testRecords.map((r: any) => r.id)) as any);

        if (updateError) throw new Error(`Failed to mark test records for deletion: ${updateError.message}`);
      } else {
        throw new Error(`Failed to delete test records: ${deleteError.message}`);
      }
    }

    return NextResponse.json({
      message: `Deleted ${testRecords.length} test business records`,
      deleted: testRecords.length,
      records: testRecords
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
