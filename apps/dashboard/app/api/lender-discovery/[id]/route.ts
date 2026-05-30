import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const reviewSchema = z.object({
  status: z.enum(["pending_review", "approved", "rejected", "outreach_ready"]),
  founder_notes: z.string().optional().nullable()
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireInternalUser(request);
    const { id } = await params;
    const payload = reviewSchema.parse(await request.json());

    const { data, error } = await (getSupabaseAdmin() as any)
      .from("lender_discovery_queue")
      .update({
        status: payload.status,
        founder_notes: payload.founder_notes ?? null,
        reviewed_by: actor.email,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
