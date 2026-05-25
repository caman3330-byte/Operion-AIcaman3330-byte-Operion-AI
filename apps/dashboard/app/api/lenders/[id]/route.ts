import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError } from "@/lib/errors";
import { lendersRepository } from "@/lib/repositories/lenders";
import { lenderUpdateSchema, uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const routeParamsSchema = z.object({
  id: uuidSchema
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireInternalUser(request);
    const { id } = routeParamsSchema.parse(await context.params);
    return NextResponse.json({ data: await lendersRepository.getById(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireInternalUser(request);
    const { id } = routeParamsSchema.parse(await context.params);
    const payload = lenderUpdateSchema.parse(await request.json());
    const lender = await lendersRepository.update(id, payload);

    await writeAuditLog({
      eventType: "manual_action",
      actorType: "founder",
      actorId: actor.email,
      entityType: "lender",
      entityId: id,
      metadata: {
        action: "update_lender",
        fields: Object.keys(payload)
      }
    });

    return NextResponse.json({ data: lender });
  } catch (error) {
    return handleRouteError(error);
  }
}
