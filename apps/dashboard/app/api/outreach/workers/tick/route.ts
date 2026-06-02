import { NextRequest, NextResponse } from "next/server";
import { requireFounder, requireScheduler } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { runOutreachWorkerTick } from "@/lib/outreach/sequence-engine";
import { workerTickSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

export async function GET(request: NextRequest) {
  try {
    await requireScheduler(request);
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") ?? "10"), 1), 25);
    const result = await runOutreachWorkerTick({
      workerId: "email_lifecycle_scheduler",
      limit,
      lifecycleOnly: true
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
