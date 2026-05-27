import { NextRequest } from "next/server";
import { getSupervisorSummary } from "@/lib/agent-orchestration/orchestrator";
import { requireFounder } from "@/lib/auth";
import { getProductionSupervisorSummary } from "@/lib/data/supervisor-command";
import { handleRouteError } from "@/lib/errors";
import { startRouteTiming, timedJson } from "@/lib/runtime/route-timing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const timing = startRouteTiming();
  try {
    await requireFounder(request);
    const [summary, production] = await Promise.all([getSupervisorSummary(), getProductionSupervisorSummary()]);

    return timedJson({ data: { ...summary, production } }, timing);
  } catch (error) {
    return handleRouteError(error);
  }
}
