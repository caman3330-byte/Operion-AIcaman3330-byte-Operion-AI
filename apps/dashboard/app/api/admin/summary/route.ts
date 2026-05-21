import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { handleRouteError } from "@/lib/errors";
import { requireInternalUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireInternalUser(request);
    const admin = getSupabaseAdmin();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Attempt a resilient read of the main applications table. If the table
    // isn't present, return sentinel values and allow the UI to show degraded state.
    const summary: any = {
      status: "ok",
      totalToday: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      sent: 0,
      fundingVolume: 0
    };

    const { data, error } = await admin
      .from("applications")
      .select("id,created_at,status,funded_amount")
      .gte("created_at", todayStart.toISOString());

    if (error) {
      summary.status = "degraded";
      return NextResponse.json(summary);
    }

    for (const row of data ?? []) {
      summary.totalToday += 1;
      const status = (row as any).status ?? "";
      const amt = Number((row as any).funded_amount ?? 0) || 0;
      summary.fundingVolume += amt;
      if (status === "pending" || status === "reviewing") summary.pending += 1;
      if (status === "approved") summary.approved += 1;
      if (status === "rejected") summary.rejected += 1;
      if (status === "sent") summary.sent += 1;
    }

    summary.fundingVolume = Math.round(summary.fundingVolume * 100) / 100;

    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ status: "error", message: (err as any)?.message ?? String(err) }, { status: 500 });
  }
}
