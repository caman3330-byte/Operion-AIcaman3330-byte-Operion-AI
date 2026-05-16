import type { OutreachEmailStatus } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { acquisitionRepository } from "@/lib/repositories/acquisition";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 100);
    const status = request.nextUrl.searchParams.get("status") as OutreachEmailStatus | null;
    const queue = await acquisitionRepository.listEmailQueue(limit, status ?? undefined);
    return NextResponse.json({ data: queue });
  } catch (error) {
    return handleRouteError(error);
  }
}
