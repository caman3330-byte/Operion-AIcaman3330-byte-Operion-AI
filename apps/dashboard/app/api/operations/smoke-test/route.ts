import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { normalizeMerchantSubmissionPayload } from "@/lib/operations/normalizers";
import { runOperationalSupabaseSmokeTest } from "@/lib/operations/supabase-smoke";
import { smokeTestSchema } from "@/lib/operations/schemas";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit({ key: rateLimitKey(request, "operations_smoke_test"), limit: 5, windowMs: 60_000 });
    await requireInternalUser(request);
    const payload = smokeTestSchema.parse(await readJsonBody(request));
    const result = await runOperationalSupabaseSmokeTest({
      executeWrites: payload.executeWrites,
      ...(payload.merchant ? { merchant: normalizeMerchantSubmissionPayload(payload.merchant) } : {})
    });
    return NextResponse.json({ data: result }, { status: result.success ? 200 : 500 });
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
