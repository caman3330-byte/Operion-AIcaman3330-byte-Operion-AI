import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { freeFirstSourceKeys } from "@/lib/acquisition/adapters/types";
import { runFreeFirstAcquisition } from "@/lib/acquisition/free-first-runner";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const schema = z.object({
  source: z.enum(freeFirstSourceKeys),
  query: z.string().trim().min(2).max(200),
  location: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(20).default(10),
  urls: z.array(z.string().url()).max(5).optional()
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    enforceRateLimit({ key: rateLimitKey(request, "data_acquire"), limit: 3, windowMs: 60_000 });
    const payload = schema.parse(await request.json());
    const result = await runFreeFirstAcquisition({
      sourceKeys: [payload.source], query: payload.query, location: payload.location,
      urls: payload.urls, limit: payload.limit, dryRun: false, requestedBy: actor.id
    });
    if (result.counts.discovered === 0 && result.counts.failed > 0) {
      throw new ValidationError(result.source_results.flatMap((source) => source.errors).join("; ") || "Acquisition source is unavailable");
    }

    // NOTE: Enrichment is processed asynchronously by the background scheduler at /api/data/enrich-scheduler
    // New prospects are inserted with enrichment_status='pending' and will be processed by the scheduler
    // This ensures enrichment is durable and does not depend on this HTTP request remaining alive

    return NextResponse.json({ data: result, outreach: false }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
