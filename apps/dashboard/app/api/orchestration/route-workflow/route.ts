import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { routeWorkflow } from "@/lib/agent-orchestration/orchestrator";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const routeWorkflowSchema = z.object({
  workflow_key: z.string().min(1),
  title: z.string().min(1),
  instructions: z.string().min(1),
  context: z.unknown().optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium")
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = routeWorkflowSchema.parse(await request.json());
    const result = await routeWorkflow({
      workflowKey: payload.workflow_key,
      title: payload.title,
      instructions: payload.instructions,
      context: (payload.context ?? null) as Json | null,
      priority: payload.priority,
      createdBy: actor.email
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
