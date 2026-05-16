import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError } from "@/lib/errors";
import { leadsRepository } from "@/lib/repositories/leads";
import { leadPatchSchema, uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireFounder(request);
    const params = await context.params;
    const id = uuidSchema.parse(params.id);
    const detail = await leadsRepository.getDetail(id);
    return NextResponse.json({ data: detail });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireFounder(request);
    const params = await context.params;
    const id = uuidSchema.parse(params.id);
    const payload = leadPatchSchema.parse(await request.json());
    const before = await leadsRepository.getById(id);

    await writeAuditLog({
      eventType: "lead_status_changed",
      actorType: "founder",
      actorId: actor.email,
      entityType: "lead",
      entityId: id,
      beforeState: before,
      metadata: { patch: payload }
    });

    const updated = await leadsRepository.update(id, payload);
    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}
