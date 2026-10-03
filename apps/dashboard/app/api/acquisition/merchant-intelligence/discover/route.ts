import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { runMerchantSourceDiscovery } from "@/lib/acquisition/merchant-intelligence";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  limit: z.number().int().min(1).max(150).default(20),
  offset: z.number().int().min(0).default(0),
  time_budget_ms: z.number().int().min(10_000).max(55_000).default(45_000),
  industries: z.array(z.string().trim().min(1)).max(12).optional()
});

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = requestSchema.parse(await request.json().catch(() => ({})));
    const data = await runMerchantSourceDiscovery({
      limit: payload.limit,
      offset: payload.offset,
      timeBudgetMs: payload.time_budget_ms,
      ...(payload.industries ? { industries: payload.industries } : {})
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
