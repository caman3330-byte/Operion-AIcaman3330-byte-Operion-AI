import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { enrichDataProspect } from "@/lib/data-prospects/enrichment";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireFounder(request);
    const { id } = await params;
    const data = await enrichDataProspect(id);
    return NextResponse.json({ data, message: "DATA prospect enrichment completed." });
  } catch (error) {
    return handleRouteError(error);
  }
}
