import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalUser, requireScheduler } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { withSchedulerRun } from "@/lib/operations/worker-observability";
import { runLeadQualificationWorker } from "@/lib/workers/lead-qualification";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const tickSchema = z.object({
  limit: z.number().int().min(1).max(25).default(10)
});

export async function POST(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const payload = tickSchema.parse(await request.json().catch(() => ({})));
    const result = await runLeadQualificationWorker(payload.limit);
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireScheduler(request);
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") ?? "10"), 1), 25);
    const result = await withSchedulerRun({
      schedulerKey: "lead_qualification",
      routePath: "/api/workers/lead-qualification",
      cronSchedule: "15 10 * * *",
      workerName: "lead_qualification_worker",
      department: "underwriting",
      queueName: "ai_tasks:lead_qualification"
    }, async () => {
      const value = await runLeadQualificationWorker(limit);
      return {
        value,
        queueAffected: value.processed + value.skipped + value.failed,
        success: value.failed === 0,
        metadata: { limit }
      };
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
