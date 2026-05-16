import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError } from "@/lib/errors";
import { leadsRepository } from "@/lib/repositories/leads";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireFounder(request);
    const params = await context.params;
    const id = uuidSchema.parse(params.id);
    const before = await leadsRepository.getById(id);
    const approvedAt = new Date().toISOString();

    await writeAuditLog({
      eventType: "distribution_approved",
      actorType: "founder",
      actorId: actor.email,
      entityType: "lead",
      entityId: id,
      beforeState: before,
      metadata: { approved_at: approvedAt }
    });

    const updated = await leadsRepository.update(id, {
      status: "pending_approval",
      distribution_approved_at: approvedAt
    });

    // TODO: Trigger n8n 09_distribution_approval webhook when N8N_WEBHOOK_BASE_URL is configured.
    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}
