import type { MerchantAcquisitionCandidate } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { enrichDataProspect } from "@/lib/data-prospects/enrichment";
import { enrichMerchantAcquisitionCandidate } from "@/lib/acquisition/merchant-website-enrichment";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { handleRouteError, NotFoundError } from "@/lib/errors";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireFounder(request);
    enforceRateLimit({ key: rateLimitKey(request, "data_enrich"), limit: 10, windowMs: 60_000 });
    const { id } = await context.params;
    const parsedId = z.string().uuid().parse(id);
    const kind = z.enum(["prospect", "candidate"]).parse(request.nextUrl.searchParams.get("kind") ?? "prospect");
    if (kind === "candidate") {
      const { data, error } = await getSupabaseAdmin().from("merchant_acquisition_candidates").select("*").eq("id", parsedId).maybeSingle();
      if (error) throw error;
      if (!data) throw new NotFoundError("Business not found");
      const result = await enrichMerchantAcquisitionCandidate(data as MerchantAcquisitionCandidate, { timeoutMs: 15_000 });
      return NextResponse.json({ data: result, outreach: false });
    }
    return NextResponse.json({ data: await enrichDataProspect(parsedId), outreach: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
