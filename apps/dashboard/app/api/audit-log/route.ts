import { NextRequest, NextResponse } from "next/server";
import type { EntityType } from "@operion/shared";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { auditLogRepository } from "@/lib/repositories/audit-log";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const searchParams = request.nextUrl.searchParams;
    const data = await auditLogRepository.list({
      eventType: searchParams.get("event_type") ?? undefined,
      entityType: toEntityType(searchParams.get("entity_type")),
      limit: Number(searchParams.get("limit") ?? 500)
    });

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

function toEntityType(value: string | null): EntityType | undefined {
  if (
    value === "lead" ||
    value === "lender" ||
    value === "distribution" ||
    value === "prompt" ||
    value === "outreach" ||
    value === "manager_agent"
  ) {
    return value;
  }

  return undefined;
}
