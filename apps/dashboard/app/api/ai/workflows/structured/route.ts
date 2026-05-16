import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Json } from "@operion/shared";
import { routeAiWorkflow } from "@/lib/ai/router";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const structuredWorkflowSchema = z.object({
  workflow: z.enum([
    "lead_extraction",
    "underwriting_summary",
    "lender_recommendation",
    "outreach_generation",
    "crm_activity_generation",
    "customer_support",
    "executive_summary",
    "funding_fit_analysis"
  ]),
  provider: z.enum(["openai", "claude"]).optional(),
  input: z.record(z.unknown())
});

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit({
      key: rateLimitKey(request, "structured_ai_workflow"),
      limit: 30,
      windowMs: 60_000
    });
    await requireInternalUser(request);
    const payload = structuredWorkflowSchema.parse(await readJsonBody(request));
    const workflowInput = {
      workflow: payload.workflow,
      input: payload.input as Json,
      ...(payload.provider ? { preferredProvider: payload.provider } : {})
    };
    const result = await routeAiWorkflow(workflowInput);

    return NextResponse.json({ data: result });
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
