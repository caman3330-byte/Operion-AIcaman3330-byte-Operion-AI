import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { validateAiProviders } from "@/lib/ai/execution-validation";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { aiExecutionTestSchema } from "@/lib/operations/schemas";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit({ key: rateLimitKey(request, "operations_ai_execution_test"), limit: 10, windowMs: 60_000 });
    await requireInternalUser(request);
    const payload = aiExecutionTestSchema.parse(await readJsonBody(request));
    const result = await validateAiProviders(payload);
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
