import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalUser, requireScheduler } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { withSchedulerRun } from "@/lib/operations/worker-observability";
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

export async function GET(request: NextRequest) {
  try {
    await requireScheduler(request);
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") ?? "15"), 1), 25);
    const result = await withSchedulerRun({
      schedulerKey: "document_processing",
      routePath: "/api/workers/document-processing",
      cronSchedule: "0 10 * * *",
      workerName: "document_processing_worker",
      department: "underwriting",
      queueName: "ai_tasks:document_processing"
    }, async () => {
      const value = await runDocumentProcessingWorker(limit);
      return {
        value,
        queueAffected: value.processed + value.skipped + value.failed,
        success: value.failed === 0,
        metadata: { transitioned: value.transitioned, limit }
      };
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
