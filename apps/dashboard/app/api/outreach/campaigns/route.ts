import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError } from "@/lib/errors";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { outreachCampaignCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 100);
    const campaigns = await acquisitionRepository.listCampaigns(limit);
    return NextResponse.json({ data: campaigns });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = outreachCampaignCreateSchema.parse(await request.json());
    const campaign = await acquisitionRepository.createCampaign({
      ...payload,
      audience_filter: payload.audience_filter as Json,
      created_by: actor.email
    });

    await writeAuditLog({
      eventType: "outreach_campaign_created",
      actorType: actor.role === "workflow" ? "n8n_workflow" : "founder",
      actorId: actor.email,
      entityType: "campaign",
      entityId: campaign.id,
      metadata: {
        status: campaign.status
      } as Json
    });

    return NextResponse.json({ data: campaign }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
