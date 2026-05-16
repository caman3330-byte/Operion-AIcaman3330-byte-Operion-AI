import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { alertsRepository } from "@/lib/repositories/alerts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
    const data = await alertsRepository.listUnresolved(limit);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
