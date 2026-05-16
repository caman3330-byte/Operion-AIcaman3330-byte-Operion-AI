import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { simulationRepository } from "@/lib/repositories/simulation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
    const runs = await simulationRepository.listRuns(limit);
    return NextResponse.json({ data: runs });
  } catch (error) {
    return handleRouteError(error);
  }
}
