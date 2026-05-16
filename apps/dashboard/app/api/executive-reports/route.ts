import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateExecutiveReport } from "@/lib/agent-orchestration/orchestrator";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { orchestrationRepository } from "@/lib/repositories/orchestration";
import type { ExecutiveReportType } from "@operion/shared";

export const dynamic = "force-dynamic";

const generateReportSchema = z.object({
  report_type: z.enum(["daily", "weekly", "incident", "manual"]).default("daily"),
  period_start: z.string().datetime().optional(),
  period_end: z.string().datetime().optional()
});

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const reports = await orchestrationRepository.listExecutiveReports(Number(request.nextUrl.searchParams.get("limit") ?? 30));

    return NextResponse.json({ data: reports });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = generateReportSchema.parse(await request.json());
    const reportInput: {
      reportType: ExecutiveReportType;
      requestedBy: string;
      periodStart?: string;
      periodEnd?: string;
    } = {
      reportType: payload.report_type,
      requestedBy: actor.email
    };

    if (payload.period_start) {
      reportInput.periodStart = payload.period_start;
    }

    if (payload.period_end) {
      reportInput.periodEnd = payload.period_end;
    }

    const report = await generateExecutiveReport(reportInput);

    return NextResponse.json({ data: report }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
