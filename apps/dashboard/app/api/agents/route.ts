import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { getSupervisorSummary } from "@/lib/agent-orchestration/orchestrator";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const summary = await getSupervisorSummary();

    return NextResponse.json({
      data: {
        agents: summary.agents,
        departments: summary.departments,
        source: summary.source,
        migration_required: summary.migration_required,
        migration_path: summary.migration_path
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
