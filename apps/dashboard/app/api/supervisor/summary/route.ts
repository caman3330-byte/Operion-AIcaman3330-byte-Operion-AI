import { NextRequest, NextResponse } from "next/server";
import { getSupervisorSummary } from "@/lib/agent-orchestration/orchestrator";
import { requireFounder } from "@/lib/auth";
import { getProductionSupervisorSummary } from "@/lib/data/supervisor-command";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const [summary, production] = await Promise.all([getSupervisorSummary(), getProductionSupervisorSummary()]);

    return NextResponse.json({ data: { ...summary, production } });
  } catch (error) {
    return handleRouteError(error);
  }
}
