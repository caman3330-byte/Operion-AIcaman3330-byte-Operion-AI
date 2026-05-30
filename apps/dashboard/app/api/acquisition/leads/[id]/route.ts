import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError } from "@/lib/errors";
import { leadsRepository } from "@/lib/repositories/leads";
import { uuidSchema } from "@/lib/validation";
import type { Json } from "@operion/shared";

export const dynamic = "force-dynamic";

const reviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  notes: z.string().max(500).optional().nullable()
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireInternalUser(request);
    const params = await context.params;
    const id = uuidSchema.parse(params.id);
    const payload = reviewSchema.parse(await request.json());

    const before = await leadsRepository.getById(id);
    if (before.status !== "pending_approval") {
      return NextResponse.json({ error: "Lead is not pending approval" }, { status: 409 });
    }

    const newStatus = payload.action === "approve" ? "qualified" : "archived";

    const updated = await leadsRepository.update(id, {
      status: newStatus,
      internal_notes: JSON.stringify({
        ...safeParseNotes(before.internal_notes),
        reviewed_by: actor.email,
        reviewed_at: new Date().toISOString(),
        review_action: payload.action,
        review_notes: payload.notes ?? null
      })
    });

    await writeAuditLog({
      eventType: payload.action === "approve" ? "lead_acquisition_approved" : "lead_acquisition_rejected",
      actorType: "founder",
      actorId: actor.email,
      entityType: "lead",
      entityId: id,
      metadata: {
        business_name: before.business_name,
        previous_status: before.status,
        new_status: newStatus,
        notes: payload.notes ?? null
      } as Json
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}

function safeParseNotes(notes: string | null | undefined): Record<string, unknown> {
  if (!notes) return {};
  try {
    return JSON.parse(notes) as Record<string, unknown>;
  } catch {
    return { raw: notes };
  }
}
