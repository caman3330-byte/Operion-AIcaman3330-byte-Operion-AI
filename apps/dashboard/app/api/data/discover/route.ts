import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { freeFirstSourceKeys } from "@/lib/acquisition/adapters/types";
import { runFreeFirstAcquisition } from "@/lib/acquisition/free-first-runner";
import { handleRouteError, ValidationError } from "@/lib/errors";

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
    const payload = schema.parse(await request.json());

    // Run acquisition discovery WITHOUT creating leads/jobs
    // This bypasses the lead_acquisition_outreach migration requirement
    const result = await runFreeFirstAcquisition({
      sourceKeys: [payload.source],
      query: payload.query,
      location: payload.location,
      urls: payload.urls,
      limit: payload.limit,
      dryRun: false,
      requestedBy: actor.id
    });

    if (result.counts.discovered === 0 && result.counts.failed > 0) {
      throw new ValidationError(
        result.source_results.flatMap((source) => source.errors).join("; ") ||
          "Acquisition source is unavailable"
      );
    }

    return NextResponse.json(
      {
        message: `Discovered ${result.counts.discovered} businesses`,
        data: {
          discovered: result.counts.discovered,
          imported: result.counts.imported,
          duplicates: result.counts.duplicates,
          failed: result.counts.failed,
          preview: result.preview.slice(0, 10)
        },
        sources: result.source_results
      },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
