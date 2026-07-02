import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { discoverMerchantAcquisitionSourceCandidates } from "@/lib/acquisition/merchant-source-discovery";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  limit: z.number().int().min(1).max(15).default(10)
});

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = requestSchema.parse(await request.json().catch(() => ({})));
    const data = await discoverMerchantAcquisitionSourceCandidates(payload.limit);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
