import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { orchestrationRepository } from "@/lib/repositories/orchestration";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const activeOnly = request.nextUrl.searchParams.get("active") !== "false";
    const routes = await orchestrationRepository.listWorkflowRoutes(activeOnly);

    return NextResponse.json({ data: routes });
  } catch (error) {
    return handleRouteError(error);
  }
}
