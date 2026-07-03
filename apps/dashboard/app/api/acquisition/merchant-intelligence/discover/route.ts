import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { runMerchantSourceDiscovery } from "@/lib/acquisition/merchant-intelligence";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  industries: z.array(z.string().trim().min(1)).max(12).optional()
});

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = requestSchema.parse(await request.json().catch(() => ({})));
    const data = await runMerchantSourceDiscovery({
      limit: payload.limit,
      ...(payload.industries ? { industries: payload.industries } : {})
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
