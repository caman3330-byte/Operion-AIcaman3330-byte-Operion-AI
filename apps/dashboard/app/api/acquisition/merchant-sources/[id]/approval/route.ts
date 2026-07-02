import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(500).optional()
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireFounder(request);
    const { id } = await context.params;
    const payload = requestSchema.parse(await request.json().catch(() => ({})));
    const approved = payload.decision === "approved";
    const data = await acquisitionRepository.updateMerchantSource(id, {
      approval_status: payload.decision,
      active: approved,
      health_status: approved ? "active" : "disabled",
      approved_at: approved ? new Date().toISOString() : null,
      approved_by: approved ? actor.email : null,
      disabled_reason: approved ? null : payload.reason ?? "Rejected by founder",
      last_error: null,
      failure_streak: approved ? 0 : undefined
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
