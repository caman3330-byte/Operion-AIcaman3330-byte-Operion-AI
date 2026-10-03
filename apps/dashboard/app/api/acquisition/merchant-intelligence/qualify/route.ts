import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { qualifyMerchantSourceBatch } from "@/lib/acquisition/source-qualification";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  limit: z.number().int().min(1).max(40).default(20),
  sample_limit: z.number().int().min(1).max(10).default(8),
  approved_only: z.boolean().default(false)
});

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = requestSchema.parse(await request.json().catch(() => ({})));
    const data = await qualifyMerchantSourceBatch({
      limit: payload.limit,
      sampleLimit: payload.sample_limit,
      approvedOnly: payload.approved_only
    });
    return NextResponse.json({ data, imported: false, outreach: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
