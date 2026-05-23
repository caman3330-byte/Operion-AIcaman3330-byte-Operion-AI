import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { transitionMerchantLifecycle } from "@/lib/crm/lifecycle";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { lifecycleTransitionSchema } from "@/lib/operations/schemas";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit({ key: rateLimitKey(request, "operations_crm_lifecycle"), limit: 60, windowMs: 60_000 });
    const actor = await requireInternalUser(request);
    const payload = lifecycleTransitionSchema.parse(await readJsonBody(request));
    const result = await transitionMerchantLifecycle({
      applicationId: payload.applicationId,
      toStatus: payload.toStatus,
      actorId: actor.id,
      ...(payload.reason ? { reason: payload.reason } : {})
    });

    return NextResponse.json({ data: result }, { status: result.success ? 200 : 400 });
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
