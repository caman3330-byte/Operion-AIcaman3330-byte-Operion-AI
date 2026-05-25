import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { runSimulation } from "@/lib/testing/simulation-runner";
import { simulationRunSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireInternalUser(request);
    const payload = simulationRunSchema.parse(await request.json());
    const input: Parameters<typeof runSimulation>[0] = {
      batchSize: payload.batch_size,
      mode: payload.mode,
      requestedBy: actor.email
    };
    if (payload.industries) input.industries = payload.industries;
    if (payload.seed) input.seed = payload.seed;
    if (payload.pipeline_limit !== undefined) input.pipelineLimit = payload.pipeline_limit;
    const result = await runSimulation(input);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
