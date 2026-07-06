import { NextRequest, NextResponse } from "next/server";
import { requireScheduler } from "@/lib/auth";
import { runMerchantSourceDiscovery } from "@/lib/acquisition/merchant-intelligence";
import { handleRouteError } from "@/lib/errors";
import { withSchedulerRun } from "@/lib/operations/worker-observability";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    await requireScheduler(request);
    const schedulerEnabled = process.env.MERCHANT_INTELLIGENCE_SCHEDULER_ENABLED === "true";
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 10);

    const data = await withSchedulerRun<Record<string, unknown>>({
      schedulerKey: "merchant_intelligence_discovery",
      routePath: "/api/acquisition/merchant-intelligence/scheduler",
      cronSchedule: "15 11 * * *",
      workerName: "merchant_intelligence_scheduler",
      department: "merchant_intelligence",
      queueName: "merchant_source_candidates",
      environmentFlag: "MERCHANT_INTELLIGENCE_SCHEDULER_ENABLED",
      environmentFlagEnabled: schedulerEnabled
    }, async () => {
      if (!schedulerEnabled) {
        return {
          value: {
            status: "disabled",
            reason: "Set MERCHANT_INTELLIGENCE_SCHEDULER_ENABLED=true to enable scheduled source discovery.",
            candidate_sources_stored: 0
          },
          status: "disabled",
          success: true,
          metadata: { limit }
        };
      }

      const value = await runMerchantSourceDiscovery({ limit });
      return {
        value,
        queueAffected: value.candidate_sources_stored,
        success: value.errors.length === 0,
        metadata: {
          limit,
          candidate_sources_found: value.candidate_sources_found,
          candidate_sources_stored: value.candidate_sources_stored,
          blocked_or_unreachable: value.blocked_or_unreachable
        }
      };
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
