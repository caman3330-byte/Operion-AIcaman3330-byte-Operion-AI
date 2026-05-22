import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { getAnalyticsExecutionDashboard } from "@/lib/operator-dashboard/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireInternalUser(request);
    return NextResponse.json({ data: await getAnalyticsExecutionDashboard() });
  } catch (error) {
    return handleRouteError(error);
  }
}
