import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const supabase = await getSupabaseAdmin();

    // Total leads count
    const { count: totalCount } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true });

    // Email-ready leads count (email NOT NULL, status=raw, not blacklisted)
    const { count: emailReadyCount } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .not("email", "is", null)
      .eq("status", "raw")
      .is("blacklisted", null);

    // Not email-ready (no email OR phone only)
    const notEmailReady = (totalCount ?? 0) - (emailReadyCount ?? 0);

    return NextResponse.json({
      total: totalCount ?? 0,
      email_ready: emailReadyCount ?? 0,
      not_email_ready: Math.max(0, notEmailReady),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
