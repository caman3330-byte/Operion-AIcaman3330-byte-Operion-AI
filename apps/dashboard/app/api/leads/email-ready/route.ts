import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { leadsRepository } from "@/lib/repositories/leads";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") ?? "25", 10);
    const search = searchParams.get("search") ?? undefined;

    const result = await leadsRepository.getEmailOutreachReadyLeads({
      page,
      pageSize,
      search
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
