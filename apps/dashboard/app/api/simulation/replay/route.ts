import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { simulationRepository } from "@/lib/repositories/simulation";
import { runSimulation } from "@/lib/testing/simulation-runner";
import { replayWorkflowSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireInternalUser(request);
    const payload = replayWorkflowSchema.parse(await request.json());
    const run = await simulationRepository.getRun(payload.simulation_run_id);
    const input: Parameters<typeof runSimulation>[0] = {
      batchSize: run.batch_size,
      industries: run.industries as never,
      mode: "replay",
      requestedBy: actor.email,
      seed: String((run.config as Record<string, unknown>).seed ?? run.run_key)
    };
    if (payload.pipeline_limit !== undefined) input.pipelineLimit = payload.pipeline_limit;
    const result = await runSimulation(input);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
