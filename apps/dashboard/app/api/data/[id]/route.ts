import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { handleRouteError } from "@/lib/errors";
import type { DataDetail } from "@/lib/data-prospects/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireFounder(request);
    const { id } = await params;
    const supabase = await getSupabaseAdmin();

    const { data, error } = await (supabase
      .from("acquisition_prospects" as any)
      .select("*")
      .eq("id", id)
      .single() as any);

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      data: data as DataDetail,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
