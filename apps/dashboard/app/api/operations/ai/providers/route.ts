import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { operionAi } from "@/lib/ai/gateway";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const check = request.nextUrl.searchParams.get("check") === "true";
    const providers = check ? await operionAi.checkProviderHealth() : operionAi.getProviderStatuses();

    return NextResponse.json({
      data: {
        providers,
        routing: operionAi.getRoutingPlan(),
        policy: operionAi.getPolicyFoundation()
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
