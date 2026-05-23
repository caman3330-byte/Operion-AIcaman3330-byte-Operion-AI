import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { getLaunchMonitoringSnapshot } from "@/lib/operations/monitoring";
import { operatorQueueSchema } from "@/lib/operations/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const query = operatorQueueSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return NextResponse.json({
      data: await getLaunchMonitoringSnapshot({
        staleThresholdHours: query.staleThresholdHours,
        limit: query.limit
      })
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
