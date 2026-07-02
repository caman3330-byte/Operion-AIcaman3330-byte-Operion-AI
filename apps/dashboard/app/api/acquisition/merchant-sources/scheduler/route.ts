import { NextRequest, NextResponse } from "next/server";
import { requireScheduler } from "@/lib/auth";
import { scanMerchantAcquisitionSources } from "@/lib/acquisition/merchant-source-scanner";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const actor = await requireScheduler(request);
    if (process.env.ACQUISITION_SCHEDULER_ENABLED !== "true") {
      return NextResponse.json({
        data: {
          status: "disabled",
          reason: "Set ACQUISITION_SCHEDULER_ENABLED=true to enable scheduled source scans.",
          imported: 0
        }
      });
    }

    const data = await scanMerchantAcquisitionSources({
      limit: Number(request.nextUrl.searchParams.get("limit") ?? 25),
      sourceLimit: Number(request.nextUrl.searchParams.get("source_limit") ?? 5),
      importVerified: false,
      requestedBy: actor.email
    });
    return NextResponse.json({ data: { ...data, imported: 0 } });
  } catch (error) {
    return handleRouteError(error);
  }
}
