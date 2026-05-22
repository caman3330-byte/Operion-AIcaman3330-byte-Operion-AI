import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { executeAiUnderwritingPipeline } from "@/lib/ai/underwriting-pipeline";
import { handleRouteError, NotFoundError, ValidationError } from "@/lib/errors";
import { underwritingExecutionSchema } from "@/lib/operations/schemas";
import { toJson } from "@/lib/operations/normalizers";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { MonthlyBankPeriod } from "@/lib/underwriting/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit({ key: rateLimitKey(request, "operations_underwriting"), limit: 20, windowMs: 60_000 });
    const actor = await requireInternalUser(request);
    const payload = underwritingExecutionSchema.parse(await readJsonBody(request));
    const supabase = await getSupabaseAdmin();
    const { data: application, error } = await supabase
      .from("business_applications")
      .select("*")
      .eq("id", payload.businessApplicationId)
      .single();

    if (error || !application) throw new NotFoundError("Business application not found");

    const result = await executeAiUnderwritingPipeline({
      businessApplicationId: application.id,
      requestedBy: actor.id,
      profile: {
        businessName: application.business_name,
        industry: application.industry,
        ...(application.state ? { state: application.state } : {}),
        requestedAmount: application.requested_amount,
        monthlyDeposits: application.monthly_deposits,
        ...(application.monthly_revenue ? { monthlyRevenue: application.monthly_revenue } : {}),
        creditScoreRange: application.credit_score_range,
        ...(payload.bankPeriods ? { bankPeriods: payload.bankPeriods.map(toBankPeriod) } : {})
      },
      ...(payload.lenderContext ? { lenderContext: toJson(payload.lenderContext) } : {}),
      ...(payload.fraudContext ? { fraudContext: toJson(payload.fraudContext) } : {})
    });

    return NextResponse.json({ data: result }, { status: result.success ? 200 : 502 });
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

function toBankPeriod(period: {
  period: string;
  deposits: number;
  withdrawals?: number | undefined;
  nsfCount?: number | undefined;
  averageDailyBalance?: number | undefined;
  transferInCount?: number | undefined;
  transferOutCount?: number | undefined;
}): MonthlyBankPeriod {
  return {
    period: period.period,
    deposits: period.deposits,
    ...(period.withdrawals !== undefined ? { withdrawals: period.withdrawals } : {}),
    ...(period.nsfCount !== undefined ? { nsfCount: period.nsfCount } : {}),
    ...(period.averageDailyBalance !== undefined ? { averageDailyBalance: period.averageDailyBalance } : {}),
    ...(period.transferInCount !== undefined ? { transferInCount: period.transferInCount } : {}),
    ...(period.transferOutCount !== undefined ? { transferOutCount: period.transferOutCount } : {})
  };
}
