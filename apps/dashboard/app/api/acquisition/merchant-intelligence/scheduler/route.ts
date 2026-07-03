import { NextRequest, NextResponse } from "next/server";
import { requireScheduler } from "@/lib/auth";
import { runMerchantSourceDiscovery } from "@/lib/acquisition/merchant-intelligence";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    await requireScheduler(request);
    if (process.env.MERCHANT_INTELLIGENCE_SCHEDULER_ENABLED !== "true") {
      return NextResponse.json({
        data: {
          status: "disabled",
          reason: "Set MERCHANT_INTELLIGENCE_SCHEDULER_ENABLED=true to enable scheduled source discovery.",
          candidate_sources_stored: 0
        }
      });
    }

    const data = await runMerchantSourceDiscovery({
      limit: Number(request.nextUrl.searchParams.get("limit") ?? 10)
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
