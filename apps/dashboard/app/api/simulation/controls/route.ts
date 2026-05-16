import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { simulationRepository } from "@/lib/repositories/simulation";
import { updateWorkerControl } from "@/lib/testing/controls";
import { workerControlSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const controls = await simulationRepository.getWorkerControls();
    return NextResponse.json({ data: controls });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = workerControlSchema.parse(await request.json());
    const input: Parameters<typeof updateWorkerControl>[0] = {
      action: payload.action,
      reason: payload.reason,
      updatedBy: actor.email
    };
    if ("enabled" in payload) {
      input.enabled = payload.enabled;
    }
    const controls = await updateWorkerControl(input);
    return NextResponse.json({ data: controls });
  } catch (error) {
    return handleRouteError(error);
  }
}
