import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { prepareSdrOutreach } from "@/lib/outreach/sequence-engine";
import { sdrPrepareSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = sdrPrepareSchema.parse(await request.json());
    const input: Parameters<typeof prepareSdrOutreach>[0] = {
      leadId: payload.lead_id,
      requestedBy: actor.email
    };
    if (payload.campaign_id) {
      input.campaignId = payload.campaign_id;
    }
    if (payload.created_by_agent_key) {
      input.createdByAgentKey = payload.created_by_agent_key;
    }

    const result = await prepareSdrOutreach(input);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
