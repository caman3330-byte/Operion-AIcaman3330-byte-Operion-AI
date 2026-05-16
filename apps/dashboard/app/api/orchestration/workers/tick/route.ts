import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runWorkerTick } from "@/lib/agent-runtime/worker-runtime";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const workerTickSchema = z.object({
  worker_id: z.string().min(1).default("operion-worker"),
  limit: z.number().int().min(1).max(25).default(5),
  include_assigned: z.boolean().default(true)
});

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = workerTickSchema.parse(await request.json().catch(() => ({})));
    const result = await runWorkerTick({
      workerId: payload.worker_id,
      limit: payload.limit,
      includeAssigned: payload.include_assigned
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
