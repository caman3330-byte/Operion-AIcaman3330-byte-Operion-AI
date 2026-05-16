import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { enrichExistingLead } from "@/lib/acquisition/pipeline";
import { handleRouteError } from "@/lib/errors";
import { leadEnrichmentRunSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = leadEnrichmentRunSchema.parse(await request.json());
    const result = await enrichExistingLead(payload.lead_id, payload.requested_by ?? actor.email);
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
