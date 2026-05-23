import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { getProductionSupervisorSummary } from "@/lib/data/supervisor-command";
import { getOperatorDashboardSummary } from "@/lib/operator-dashboard/service";
import { getLaunchMonitoringSnapshot } from "@/lib/operations/monitoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireInternalUser(request);
    const [production, operator, monitoring] = await Promise.all([
      getProductionSupervisorSummary(),
      getOperatorDashboardSummary({ limit: 25 }),
      getLaunchMonitoringSnapshot({ limit: 100 })
    ]);

    return NextResponse.json({
      status: monitoring.health,
      production,
      operator: {
        health: operator.health,
        risks: operator.risks,
        underwriting: operator.underwriting.metrics,
        ai: operator.ai.metrics,
        workflows: operator.workflows.metrics,
        lenders: operator.lenders.metrics,
        analytics: operator.analytics.productivity
      },
      monitoring
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
