import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { distributeLead } from "@/lib/distribution";
import { handleRouteError } from "@/lib/errors";
import { leadsRepository } from "@/lib/repositories/leads";
import { distributeSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = distributeSchema.parse(await request.json());
    const lead = await leadsRepository.getById(payload.lead_id);
    const distributions = await distributeLead({
      lead,
      lenderIds: payload.lender_ids,
      actorId: actor.email
    });

    return NextResponse.json({ data: distributions }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
