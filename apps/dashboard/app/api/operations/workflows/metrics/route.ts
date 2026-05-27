import { NextRequest } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { getWorkflowRetryMetrics } from "@/lib/operations/operator-services";
import { operatorQueueSchema } from "@/lib/operations/schemas";
import { startRouteTiming, timedJson } from "@/lib/runtime/route-timing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const timing = startRouteTiming();
  try {
    await requireInternalUser(request);
    const query = operatorQueueSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return timedJson({ data: await getWorkflowRetryMetrics(query) }, timing);
  } catch (error) {
    return handleRouteError(error);
  }
}
