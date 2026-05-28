import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError } from "@/lib/errors";
import { buildLenderIntelligenceProfile } from "@/lib/lenders/intelligence";
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
    const shouldRefreshIntelligence = [
      "company_name",
      "website_url",
      "contact_email",
      "contact_page_url",
      "broker_program_url",
      "funding_products",
      "funding_range_min",
      "funding_range_max",
      "industries_served",
      "states_served",
      "minimum_requirements",
      "public_contact_methods",
      "min_monthly_revenue",
      "min_months_in_business",
      "min_fico",
      "max_funding"
    ].some((field) => field in payload);
    const existing = shouldRefreshIntelligence ? await lendersRepository.getById(id) : null;
    const intelligenceInput = existing
      ? { ...existing, ...payload, company_name: payload.company_name ?? existing.company_name }
      : null;
    const lender = await lendersRepository.update(id, {
      ...payload,
      ...(intelligenceInput ? buildLenderIntelligenceProfile(intelligenceInput) : {})
    });

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
