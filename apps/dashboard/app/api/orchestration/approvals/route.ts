import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { orchestrationRepository } from "@/lib/repositories/orchestration";

export const dynamic = "force-dynamic";

const createApprovalSchema = z.object({
  task_id: z.string().uuid().optional().nullable(),
  approval_type: z.string().min(1),
  requested_by_agent_key: z.string().min(1),
  assigned_to: z.string().min(1).optional().nullable(),
  title: z.string().min(1),
  details: z.unknown(),
  expires_at: z.string().datetime().optional().nullable()
});

const updateApprovalSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "rejected", "expired"]),
  decision_reason: z.string().min(1).optional().nullable()
});

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const status = request.nextUrl.searchParams.get("status") as never;
    const approvals = await orchestrationRepository.listApprovals({
      limit: Number(request.nextUrl.searchParams.get("limit") ?? 100),
      status: status ?? undefined
    });

    return NextResponse.json({ data: approvals });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = createApprovalSchema.parse(await request.json());
    const approval = await orchestrationRepository.createApproval({
      ...payload,
      details: payload.details as Json,
      status: "pending"
    });

    return NextResponse.json({ data: approval }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = updateApprovalSchema.parse(await request.json());
    const approval = await orchestrationRepository.updateApproval(payload.id, {
      status: payload.status,
      decision_reason: payload.decision_reason ?? null,
      decided_by: actor.email,
      decided_at: new Date().toISOString()
    });

    if (approval.task_id) {
      await orchestrationRepository.updateTask(approval.task_id, {
        status: payload.status === "approved" ? "queued" : "cancelled"
      });
    }

    await writeAuditLog({
      eventType: "agent_approval_decided",
      actorType: actor.role === "workflow" ? "n8n_workflow" : "founder",
      actorId: actor.email,
      entityType: "manager_agent",
      entityId: approval.id,
      metadata: {
        approval_type: approval.approval_type,
        status: approval.status,
        task_id: approval.task_id
      } as Json
    });

    return NextResponse.json({ data: approval });
  } catch (error) {
    return handleRouteError(error);
  }
}
