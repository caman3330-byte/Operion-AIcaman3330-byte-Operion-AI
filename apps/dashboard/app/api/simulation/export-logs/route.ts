import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { exportSimulationLogs } from "@/lib/testing/controls";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 500);
    const logs = await exportSimulationLogs(limit);
    return NextResponse.json({ data: logs });
  } catch (error) {
    return handleRouteError(error);
  }
}
