import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { leadsRepository } from "@/lib/repositories/leads";
import { leadCreateSchema } from "@/lib/validation";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const searchParams = request.nextUrl.searchParams;
    const result = await leadsRepository.list({
      page: Number(searchParams.get("page") ?? 1),
      pageSize: Number(searchParams.get("pageSize") ?? 25),
      status: searchParams.get("status") as never,
      tier: searchParams.get("tier") as never,
      search: searchParams.get("search") ?? undefined
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = leadCreateSchema.parse(await request.json());

    await writeAuditLog({
      eventType: "manual_action",
      actorType: "founder",
      actorId: actor.email,
      entityType: "lead",
      metadata: { action: "create_lead", business_name: payload.business_name }
    });

    const lead = await leadsRepository.create(payload);
    return NextResponse.json({ data: lead }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
