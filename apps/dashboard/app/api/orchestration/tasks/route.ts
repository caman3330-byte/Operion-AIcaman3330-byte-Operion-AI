import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { orchestrationRepository } from "@/lib/repositories/orchestration";
import type { AgentQueueStatus } from "@operion/shared";

export const dynamic = "force-dynamic";

const createTaskSchema = z.object({
  workflow_key: z.string().min(1).optional().nullable(),
  parent_task_id: z.string().uuid().optional().nullable(),
  assigned_agent_key: z.string().min(1),
  department_key: z.string().min(1),
  title: z.string().min(1),
  instructions: z.string().min(1),
  context: z.unknown().optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  status: z.enum(["queued", "assigned", "running", "blocked", "completed", "failed", "cancelled"]).default("queued"),
  requires_approval: z.boolean().default(false),
  due_at: z.string().datetime().optional().nullable()
});

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const searchParams = request.nextUrl.searchParams;
    const options: {
      limit: number;
      status?: AgentQueueStatus;
      assignedAgentKey?: string;
      departmentKey?: string;
    } = { limit: Number(searchParams.get("limit") ?? 100) };
    const status = searchParams.get("status");
    const assignedAgentKey = searchParams.get("assignedAgentKey");
    const departmentKey = searchParams.get("departmentKey");

    if (status) {
      options.status = status as AgentQueueStatus;
    }

    if (assignedAgentKey) {
      options.assignedAgentKey = assignedAgentKey;
    }

    if (departmentKey) {
      options.departmentKey = departmentKey;
    }

    const tasks = await orchestrationRepository.listTasks(options);

    return NextResponse.json({ data: tasks });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = createTaskSchema.parse(await request.json());
    const task = await orchestrationRepository.createTask({
      ...payload,
      context: (payload.context ?? null) as Json | null,
      created_by: actor.email
    });

    return NextResponse.json({ data: task }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
