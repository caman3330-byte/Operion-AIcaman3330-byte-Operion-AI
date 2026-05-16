import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { runOutreachWorkerTick } from "@/lib/outreach/sequence-engine";
import { workerTickSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = workerTickSchema.parse(await request.json().catch(() => ({})));
    const result = await runOutreachWorkerTick({
      workerId: payload.worker_id,
      limit: payload.limit
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
