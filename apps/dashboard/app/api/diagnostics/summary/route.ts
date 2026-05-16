import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { collectDiagnosticsSnapshot } from "@/lib/diagnostics/summary";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const summary = await collectDiagnosticsSnapshot();
    return NextResponse.json({ data: summary });
  } catch (error) {
    return handleRouteError(error);
  }
}
