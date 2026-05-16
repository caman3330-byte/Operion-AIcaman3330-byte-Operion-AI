import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Json } from "@operion/shared";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { productionRepository } from "@/lib/repositories/production";

export const dynamic = "force-dynamic";

const createAiTaskSchema = z.object({
  task_type: z.enum([
    "lead_qualification",
    "lead_extraction",
    "underwriting_summary",
    "lender_recommendation",
    "outreach_preparation",
    "reporting",
    "customer_support",
    "crm_activity",
    "executive_summary"
  ]),
  priority: z.string().min(1).optional().default("normal"),
  lead_id: z.string().uuid().optional().nullable(),
  business_application_id: z.string().uuid().optional().nullable(),
  assigned_agent: z.string().min(1).optional().default("ai_task_dispatcher_agent"),
  input_payload: z.record(z.unknown()).optional().default({}),
  max_attempts: z.number().int().min(1).max(5).optional().default(3)
});

export async function GET(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? 100), 500);
    const status = request.nextUrl.searchParams.get("status");
    const tasks = (await productionRepository.listAiTasks(limit)).filter((task) => !status || task.status === status);

    return NextResponse.json({ data: tasks });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit({
      key: rateLimitKey(request, "ai_task_create"),
      limit: 60,
      windowMs: 60_000
    });
    const actor = await requireInternalUser(request);
    const payload = createAiTaskSchema.parse(await readJsonBody(request));
    const task = await productionRepository.createAiTask({
      ...payload,
      input_payload: payload.input_payload as Json,
      created_by: actor.id === "n8n_workflow" ? null : actor.id
    });

    await productionRepository.createAiTaskLog({
      ai_task_id: task.id,
      status: "queued",
      message: `AI task queued by ${actor.email}`,
      provider: null,
      model: null,
      metadata: {
        actor: actor.email
      } as Json
    });

    return NextResponse.json({ data: task }, { status: 201 });
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
