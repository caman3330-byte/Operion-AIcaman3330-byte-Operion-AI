import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError } from "@/lib/errors";
import { alertsRepository } from "@/lib/repositories/alerts";
import { alertResolveSchema, uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireFounder(request);
    const params = await context.params;
    const id = uuidSchema.parse(params.id);
    alertResolveSchema.parse(await request.json());

    await writeAuditLog({
      eventType: "manual_action",
      actorType: "founder",
      actorId: actor.email,
      entityType: "outreach",
      metadata: { action: "resolve_alert", alert_id: id }
    });

    const alert = await alertsRepository.resolve(id);
    return NextResponse.json({ data: alert });
  } catch (error) {
    return handleRouteError(error);
  }
}
