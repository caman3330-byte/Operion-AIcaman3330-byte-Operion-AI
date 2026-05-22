import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { buildLenderDistributionPlan, persistDistributionPlan } from "@/lib/lenders/distribution";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { lenderDistributionSchema } from "@/lib/operations/schemas";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit({ key: rateLimitKey(request, "operations_lender_distribution"), limit: 60, windowMs: 60_000 });
    await requireInternalUser(request);
    const payload = lenderDistributionSchema.parse(await readJsonBody(request));
    const planResult = await buildLenderDistributionPlan({
      merchant: {
        ...(payload.businessApplicationId ? { businessApplicationId: payload.businessApplicationId } : {}),
        ...(payload.leadId ? { leadId: payload.leadId } : {}),
        state: payload.state,
        industry: payload.industry,
        requestedAmount: payload.requestedAmount,
        ...(payload.creditScore ? { creditScore: payload.creditScore } : {}),
        ...(payload.riskScore !== undefined ? { riskScore: payload.riskScore } : {})
      },
      ...(payload.maxDistributions ? { maxDistributions: payload.maxDistributions } : {}),
      ...(payload.minimumScore !== undefined ? { minimumScore: payload.minimumScore } : {})
    });

    const persistence = payload.persist && planResult.plan
      ? await persistDistributionPlan(planResult.plan)
      : { success: true, inserted: 0 };

    return NextResponse.json({ data: { ...planResult, persistence } });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function readJsonBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Invalid JSON request body");
  }
}
