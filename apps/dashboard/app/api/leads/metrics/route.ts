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

    // Email + Phone (both present, email-ready)
    const { count: emailPlusPhoneCount } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .not("email", "is", null)
      .not("phone", "is", null)
      .eq("status", "raw")
      .is("blacklisted", null);

    // Phone Only (phone but no email)
    const { count: phoneOnlyCount } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .is("email", null)
      .not("phone", "is", null)
      .eq("status", "raw")
      .is("blacklisted", null);

    // Needs Email (has phone, no email)
    const { count: needsEmailCount } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .is("email", null)
      .not("phone", "is", null)
      .eq("status", "raw");

    // Active businesses - cast to any to handle new fields not yet in type
    const { count: activeCount } = await (supabase as any)
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("status", "raw")
      .eq("business_status", "active");

    // Needs Research (unknown/unverified status)
    const { count: needsResearchCount } = await (supabase as any)
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("status", "raw")
      .in("business_status", ["unknown", "unable_to_verify"]);

    return NextResponse.json({
      total: totalCount ?? 0,
      email_ready: emailReadyCount ?? 0,
      email_and_phone: emailPlusPhoneCount ?? 0,
      phone_only: phoneOnlyCount ?? 0,
      needs_email: needsEmailCount ?? 0,
      active: activeCount ?? 0,
      needs_research: needsResearchCount ?? 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
