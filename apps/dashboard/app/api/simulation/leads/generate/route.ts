import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { generateSimulationLeadPreview } from "@/lib/testing/simulation-runner";
import { simulationLeadGenerateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = simulationLeadGenerateSchema.parse(await request.json());
    const input: Parameters<typeof generateSimulationLeadPreview>[0] = {
      batchSize: payload.batch_size,
    };
    if (payload.industries) input.industries = payload.industries;
    if (payload.seed) input.seed = payload.seed;
    const result = await generateSimulationLeadPreview(input);
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
