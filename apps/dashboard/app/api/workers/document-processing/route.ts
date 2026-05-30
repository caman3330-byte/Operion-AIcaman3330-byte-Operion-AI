import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { runDocumentProcessingWorker } from "@/lib/workers/document-processing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const tickSchema = z.object({
  limit: z.number().int().min(1).max(25).default(15)
});

export async function POST(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const payload = tickSchema.parse(await request.json().catch(() => ({})));
    const result = await runDocumentProcessingWorker(payload.limit);
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
