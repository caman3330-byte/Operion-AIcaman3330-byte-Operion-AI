import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { importApprovedMerchantCandidates } from "@/lib/acquisition/merchant-candidate-import";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  candidate_ids: z.array(z.string().uuid()).max(100).optional()
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = requestSchema.parse(await request.json().catch(() => ({})));
    const result = await importApprovedMerchantCandidates({
      ...(payload.candidate_ids?.length ? { candidateIds: payload.candidate_ids } : {}),
      requestedBy: actor.email
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
