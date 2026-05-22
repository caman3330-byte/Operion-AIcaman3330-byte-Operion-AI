import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { submitMerchantIntake } from "@/lib/intake/service";
import { normalizeMerchantSubmissionPayload } from "@/lib/operations/normalizers";
import { merchantIntakeSchema } from "@/lib/operations/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit({ key: rateLimitKey(request, "operations_intake"), limit: 30, windowMs: 60_000 });
    const actor = await requireInternalUser(request);
    const payload = merchantIntakeSchema.parse(await readJsonBody(request));
    const intakePayload = normalizeMerchantSubmissionPayload(payload, {
      submittedBy: actor.id,
      submittedByEmail: actor.email
    });
    const result = await submitMerchantIntake(intakePayload);

    return NextResponse.json({ data: result }, { status: result.success ? 201 : 400 });
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
