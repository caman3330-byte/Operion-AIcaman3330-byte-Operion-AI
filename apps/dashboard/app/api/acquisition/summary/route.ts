import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { acquisitionRepository } from "@/lib/repositories/acquisition";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const summary = await acquisitionRepository.summary();
    return NextResponse.json({ data: summary });
  } catch (error) {
    return handleRouteError(error);
  }
}
