import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError } from "@/lib/errors";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { outreachSequenceCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const campaignId = request.nextUrl.searchParams.get("campaignId") ?? undefined;
    const sequences = await acquisitionRepository.listSequences(campaignId);
    return NextResponse.json({ data: sequences });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = outreachSequenceCreateSchema.parse(await request.json());
    const sequence = await acquisitionRepository.createSequence({
      ...payload,
      send_window: payload.send_window as Json
    });

    await writeAuditLog({
      eventType: "outreach_sequence_created",
      actorType: actor.role === "workflow" ? "n8n_workflow" : "founder",
      actorId: actor.email,
      entityType: "campaign",
      entityId: sequence.campaign_id,
      metadata: {
        sequence_id: sequence.id,
        step_number: sequence.step_number,
        requires_approval: sequence.requires_approval
      } as Json
    });

    return NextResponse.json({ data: sequence }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
