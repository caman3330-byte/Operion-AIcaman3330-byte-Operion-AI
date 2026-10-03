import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runAutonomousAcquisitionCycle } from "@/lib/autonomous-company/acquisition-loop";
import { requireScheduler } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const tickSchema = z.object({
  task_limit: z.number().int().min(1).max(5).default(2),
  worker_limit: z.number().int().min(1).max(5).default(2),
  dry_run: z.boolean().default(false)
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireScheduler(request);
    const payload = tickSchema.parse(await request.json().catch(() => ({})));
    const result = await runAutonomousAcquisitionCycle({
      requestedBy: actor.email,
      taskLimit: payload.task_limit,
      workerLimit: payload.worker_limit,
      dryRun: payload.dry_run
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
