import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScheduler } from "@/lib/auth";
import { enrichMerchantWebsitesForSource } from "@/lib/acquisition/merchant-website-enrichment";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  source_name: z.string().trim().min(1).default("IEC Fort Worth Member Directory"),
  limit: z.number().int().min(1).max(75).default(50)
});

export async function POST(request: NextRequest) {
  try {
    await requireScheduler(request);
    const payload = requestSchema.parse(await request.json().catch(() => ({})));
    const data = await enrichMerchantWebsitesForSource(payload.source_name, payload.limit);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
