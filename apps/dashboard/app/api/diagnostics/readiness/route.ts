import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { generateProductionReadinessReport } from "@/lib/diagnostics/summary";
import { handleRouteError } from "@/lib/errors";
import { readinessReportSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = readinessReportSchema.parse(await request.json().catch(() => ({})));
    const report = await generateProductionReadinessReport(actor.email, payload.simulation_run_id);
    return NextResponse.json({ data: report }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
