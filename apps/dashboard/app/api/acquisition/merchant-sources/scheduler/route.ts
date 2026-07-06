import { NextRequest, NextResponse } from "next/server";
import { requireScheduler } from "@/lib/auth";
import { scanMerchantAcquisitionSources } from "@/lib/acquisition/merchant-source-scanner";
import { handleRouteError } from "@/lib/errors";
import { withSchedulerRun } from "@/lib/operations/worker-observability";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const actor = await requireScheduler(request);
    const schedulerEnabled = process.env.ACQUISITION_SCHEDULER_ENABLED === "true";
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 25);
    const sourceLimit = Number(request.nextUrl.searchParams.get("source_limit") ?? 5);

    const data = await withSchedulerRun<Record<string, unknown>>({
      schedulerKey: "merchant_source_scanner",
      routePath: "/api/acquisition/merchant-sources/scheduler",
      cronSchedule: "45 10 * * *",
      workerName: "merchant_source_scanner",
      department: "merchant_acquisition",
      queueName: "merchant_acquisition_sources",
      environmentFlag: "ACQUISITION_SCHEDULER_ENABLED",
      environmentFlagEnabled: schedulerEnabled
    }, async () => {
      if (!schedulerEnabled) {
        return {
          value: {
            status: "disabled",
            reason: "Set ACQUISITION_SCHEDULER_ENABLED=true to enable scheduled source scans.",
            imported: 0
          },
          status: "disabled",
          success: true,
          metadata: { limit, source_limit: sourceLimit }
        };
      }

      const value = await scanMerchantAcquisitionSources({
        limit,
        sourceLimit,
        importVerified: false,
        requestedBy: actor.email
      });
      return {
        value: { ...value, imported: 0 },
        queueAffected: value.scanned,
        success: value.results.every((item) => item.status !== "failed"),
        metadata: { limit, source_limit: sourceLimit, verified: value.verified }
      };
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
