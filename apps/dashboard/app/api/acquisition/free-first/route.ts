import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { freeFirstSourceKeys } from "@/lib/acquisition/adapters/types";
import { runFreeFirstAcquisition } from "@/lib/acquisition/free-first-runner";
import { requireFounder } from "@/lib/auth";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  source_keys: z.array(z.enum(freeFirstSourceKeys)).min(1).max(freeFirstSourceKeys.length),
  query: z.string().trim().max(200).optional(),
  category: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  urls: z.array(z.string().trim().url()).max(25).optional(),
  limit: z.number().int().min(1).max(50).default(25),
  dry_run: z.boolean().default(true),
  confirm_production_import: z.boolean().default(false)
});

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit({ key: rateLimitKey(request, "free_first_acquisition"), limit: 3, windowMs: 60_000 });
    const actor = await requireFounder(request);
    const payload = requestSchema.parse(await request.json());
    const configuredMaximum = Math.min(50, Math.max(1, Number(process.env.ACQUISITION_MAX_URLS_PER_RUN ?? 25)));
    if (payload.limit > configuredMaximum) {
      throw new ValidationError(`Acquisition limit exceeds configured maximum of ${configuredMaximum}`);
    }
    if (!payload.dry_run && !payload.confirm_production_import) {
      throw new ValidationError("Production acquisition requires explicit confirm_production_import=true");
    }

    const result = await runFreeFirstAcquisition({
      sourceKeys: payload.source_keys,
      query: payload.query,
      category: payload.category,
      location: payload.location,
      urls: payload.urls,
      limit: payload.limit,
      dryRun: payload.dry_run,
      requestedBy: actor.email
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
