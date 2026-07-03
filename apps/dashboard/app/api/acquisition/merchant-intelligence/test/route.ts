import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { testMerchantSource } from "@/lib/acquisition/merchant-intelligence";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  source_id: z.string().uuid(),
  limit: z.number().int().min(1).max(10).default(10)
});

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = requestSchema.parse(await request.json());
    const data = await testMerchantSource(payload.source_id, payload.limit);
    return NextResponse.json({ data, imported: false, outreach: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
