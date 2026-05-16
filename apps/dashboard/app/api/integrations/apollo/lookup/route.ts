import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { lookupCompanyInApollo } from "@/lib/integrations/apollo";

export const dynamic = "force-dynamic";

const apolloLookupSchema = z.object({
  businessName: z.string().min(2).max(180),
  domain: z.string().min(3).max(240).optional().nullable()
});

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = apolloLookupSchema.parse(await request.json());
    const data = await lookupCompanyInApollo({
      businessName: payload.businessName,
      domain: payload.domain ?? null
    });

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
