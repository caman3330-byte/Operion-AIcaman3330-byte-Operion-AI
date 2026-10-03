import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireFounder(request);
    const { id } = await params;
    const supabase = await getSupabaseAdmin();

    const { data, error } = await (supabase
      .from("acquisition_prospects" as any)
      .update({ enrichment_status: "enriching", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single() as any);

    if (error) throw new Error(error.message);

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
