import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  candidate_ids: z.array(z.string().uuid()).min(1).max(100),
  decision: z.enum(["approved", "rejected"]),
  notes: z.string().trim().max(1000).optional()
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = requestSchema.parse(await request.json().catch(() => ({})));
    const reviewedAt = new Date().toISOString();
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("merchant_acquisition_candidates")
      .update({
        import_review_status: payload.decision,
        reviewed_at: reviewedAt,
        reviewed_by: actor.email,
        review_notes: payload.notes ?? null
      })
      .in("id", payload.candidate_ids)
      .eq("import_review_status", "pending_review")
      .select("id,business_name,import_review_status");

    if (error) throw error;

    await writeAuditLog({
      eventType: payload.decision === "approved" ? "merchant_candidates_batch_approved" : "merchant_candidates_batch_rejected",
      actorType: "founder",
      actorId: actor.email,
      entityType: "acquisition",
      metadata: {
        candidate_ids: payload.candidate_ids,
        updated_count: data?.length ?? 0,
        decision: payload.decision,
        reviewed_at: reviewedAt
      }
    });

    return NextResponse.json({
      data: data ?? [],
      updated: data?.length ?? 0,
      requested: payload.candidate_ids.length,
      imported: false
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
