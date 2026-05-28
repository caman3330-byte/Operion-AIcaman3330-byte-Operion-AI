import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError } from "@/lib/errors";
import { buildLenderIntelligenceProfile } from "@/lib/lenders/intelligence";
import { lendersRepository } from "@/lib/repositories/lenders";
import { lenderCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const activeOnly = request.nextUrl.searchParams.get("active") === "true";
    const data = await lendersRepository.list(activeOnly);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireInternalUser(request);
    const payload = lenderCreateSchema.parse(await request.json());
    const intelligence = buildLenderIntelligenceProfile(payload);

    await writeAuditLog({
      eventType: "manual_action",
      actorType: "founder",
      actorId: actor.email,
      entityType: "lender",
      metadata: { action: "create_lender", company_name: payload.company_name }
    });

    const lender = await lendersRepository.create({
      ...payload,
      ...intelligence,
      active: payload.active ?? false,
      whitelisted: payload.whitelisted ?? false
    });
    return NextResponse.json({ data: lender }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
