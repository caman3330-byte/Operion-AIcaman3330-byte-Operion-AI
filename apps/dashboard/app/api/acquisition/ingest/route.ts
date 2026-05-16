import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { ingestLeadBatch } from "@/lib/acquisition/pipeline";
import { handleRouteError } from "@/lib/errors";
import { acquisitionIngestSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = acquisitionIngestSchema.parse(await request.json());
    const input: Parameters<typeof ingestLeadBatch>[0] = {
      sourceKey: payload.source_key,
      records: payload.records,
      requestedBy: actor.email
    };
    if (payload.job_id !== undefined) {
      input.jobId = payload.job_id;
    }

    const result = await ingestLeadBatch(input);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
