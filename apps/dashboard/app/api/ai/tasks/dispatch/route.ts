import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runAiTaskDispatcher } from "@/lib/ai/workflows/task-dispatcher";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const dispatchSchema = z.object({
  worker_id: z.string().min(1).optional().default("ai-task-dispatcher"),
  limit: z.number().int().min(1).max(25).optional().default(5),
  task_types: z
    .array(
      z.enum([
        "lead_qualification",
        "lead_extraction",
        "underwriting_summary",
        "lender_recommendation",
        "outreach_preparation",
        "reporting",
        "customer_support",
        "crm_activity",
        "executive_summary",
        "document_processing"
      ])
    )
    .optional()
});

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit({
      key: rateLimitKey(request, "ai_task_dispatch"),
      limit: 30,
      windowMs: 60_000
    });
    await requireInternalUser(request);
    const payload = dispatchSchema.parse(await readJsonBody(request));
    const dispatchInput = {
      workerId: payload.worker_id,
      limit: payload.limit,
      ...(payload.task_types ? { taskTypes: payload.task_types } : {})
    };
    const result = await runAiTaskDispatcher(dispatchInput);

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
