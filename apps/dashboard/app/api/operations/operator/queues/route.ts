import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { getOperatorExecutionDashboard } from "@/lib/operations/operator-services";
import { operatorQueueSchema } from "@/lib/operations/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const query = operatorQueueSchema.parse({
      staleThresholdHours: request.nextUrl.searchParams.get("staleThresholdHours") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined
    });
    const data = await getOperatorExecutionDashboard(query);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
