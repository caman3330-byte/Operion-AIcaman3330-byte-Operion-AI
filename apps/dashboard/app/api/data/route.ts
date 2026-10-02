import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { listDataRecords, parseDataFilters } from "@/lib/data-prospects/repository";
import { handleRouteError, ValidationError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);

    const filters = parseDataFilters(request.nextUrl.searchParams);
    const result = await listDataRecords(filters);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleRouteError(error);
  }
}
