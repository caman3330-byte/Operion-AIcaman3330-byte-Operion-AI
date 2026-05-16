import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { apiUsageRepository } from "@/lib/repositories/api-usage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const days = Number(request.nextUrl.searchParams.get("days") ?? 30);
    const data = await apiUsageRepository.summary(days);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
