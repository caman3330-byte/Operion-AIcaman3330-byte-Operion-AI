import { NextRequest, NextResponse } from "next/server";
import type { Json } from "@operion/shared";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { createManagerAgentRun } from "@/lib/manager-agent/orchestrator";
import { managerAgentRepository } from "@/lib/repositories/manager-agent";
import { managerRunCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const runs = await managerAgentRepository.listRuns(50);
    const data = await Promise.all(
      runs.map(async (run) => ({
        run,
        tasks: await managerAgentRepository.listTasks(run.id)
      }))
    );

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = managerRunCreateSchema.parse(await request.json());
    const result = await createManagerAgentRun({
      objective: payload.objective,
      context: (payload.context ?? null) as Json | null,
      requestedBy: actor.email
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
