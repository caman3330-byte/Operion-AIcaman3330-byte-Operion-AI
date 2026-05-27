"use server";

import type { AgentQueueStatus, Json } from "@operion/shared";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getInternalPageAccess } from "@/components/layout/protected-page";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type FounderWorkflowAction = "archive_qa" | "mark_live" | "mark_qa" | "resolve_stale" | "reopen_review";
export type FounderWorkflowActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export async function updateFounderWorkflowState(
  _state: FounderWorkflowActionState,
  formData: FormData
): Promise<FounderWorkflowActionState> {
  try {
    const access = await getInternalPageAccess();
    if (!access.allowed) {
      return { status: "error", message: "Internal operator session required." };
    }

    const taskId = stringValue(formData.get("taskId"));
    const action = stringValue(formData.get("action")) as FounderWorkflowAction;
    if (!taskId || !isFounderWorkflowAction(action)) {
      return { status: "error", message: "Invalid workflow action." };
    }

    const supabase = getSupabaseAdmin();
    const { data: task, error } = await supabase.from("agent_task_queue").select("*").eq("id", taskId).maybeSingle();
    if (error) throw error;
    if (!task) return { status: "error", message: "Workflow task not found." };

    const context = asRecord(task.context);
    const now = new Date().toISOString();
    const payload = buildWorkflowUpdate(action, task, context, now);

    const { data: updated, error: updateError } = await supabase
      .from("agent_task_queue")
      .update(payload)
      .eq("id", task.id)
      .eq("status", task.status)
      .select("*")
      .single();

    if (updateError) throw updateError;

    await writeAuditLog({
      eventType: `founder_workflow_${action}`,
      actorType: "founder",
      actorId: access.user.email ?? null,
      entityType: "manager_agent",
      entityId: task.id,
      beforeState: task as Json,
      afterState: updated as Json,
      metadata: {
        action,
        workflow_key: task.workflow_key,
        previous_status: task.status,
        next_status: updated.status
      } as Json
    });

    revalidatePath("/supervisor");
    return { status: "success", message: successMessage(action) };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Workflow action failed."
    };
  }
}

function buildWorkflowUpdate(
  action: FounderWorkflowAction,
  task: { status: AgentQueueStatus; context: Json | null; error_message: string | null; result_summary: string | null },
  context: Record<string, unknown>,
  now: string
) {
  if (action === "archive_qa") {
    if (classifyOperationalScope(task).scope !== "qa") {
      throw new Error("Only QA-classified workflow artifacts can be archived by this action.");
    }
    return {
      status: "cancelled" as AgentQueueStatus,
      context: withScope(context, "qa", now, "archive_qa"),
      error_message: appendNote(task.error_message, "Founder archived QA workflow artifact."),
      completed_at: now,
      updated_at: now
    };
  }

  if (action === "mark_live") {
    return {
      context: withScope(context, "live", now, "mark_live"),
      error_message: appendNote(task.error_message, "Founder marked workflow as live."),
      updated_at: now
    };
  }

  if (action === "mark_qa") {
    return {
      context: withScope(context, "qa", now, "mark_qa"),
      error_message: appendNote(task.error_message, "Founder marked workflow as QA."),
      updated_at: now
    };
  }

  if (action === "resolve_stale") {
    return {
      status: "cancelled" as AgentQueueStatus,
      context: withFounderAction(context, now, "resolve_stale"),
      result_summary: appendNote(task.result_summary, "Founder resolved stale workflow without execution."),
      completed_at: now,
      updated_at: now
    };
  }

  return {
    status: "blocked" as AgentQueueStatus,
    context: withFounderAction(context, now, "reopen_review"),
    error_message: appendNote(task.error_message, "Founder reopened workflow for manual review."),
    started_at: null,
    completed_at: null,
    updated_at: now
  };
}

function withScope(context: Record<string, unknown>, scope: "live" | "qa", now: string, action: FounderWorkflowAction) {
  return {
    ...context,
    operational_scope: scope,
    is_test_data: scope === "qa",
    test_mode: scope === "qa",
    founder_supervised: true,
    founder_last_action: action,
    founder_last_action_at: now
  } as Json;
}

function withFounderAction(context: Record<string, unknown>, now: string, action: FounderWorkflowAction) {
  return {
    ...context,
    founder_supervised: true,
    founder_last_action: action,
    founder_last_action_at: now
  } as Json;
}

function appendNote(existing: string | null, note: string) {
  return existing ? `${existing}\n${note}` : note;
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : null;
}

function isFounderWorkflowAction(value: string | null): value is FounderWorkflowAction {
  return value === "archive_qa" || value === "mark_live" || value === "mark_qa" || value === "resolve_stale" || value === "reopen_review";
}

function successMessage(action: FounderWorkflowAction) {
  if (action === "archive_qa") return "QA artifact archived.";
  if (action === "mark_live") return "Workflow marked live.";
  if (action === "mark_qa") return "Workflow marked QA.";
  if (action === "resolve_stale") return "Stale workflow resolved.";
  return "Workflow reopened for manual review.";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } as Record<string, unknown> : {};
}

function classifyOperationalScope(record: unknown): { scope: "live" | "qa" } {
  const text = JSON.stringify(record ?? {}).toLowerCase();
  return text.includes('"is_test_data":true') ||
    text.includes('"test_mode":true') ||
    text.includes('"operational_scope":"qa"') ||
    text.includes('"simulation":true') ||
    text.includes("simulation") ||
    text.includes("operion-e2e") ||
    text.includes("live-verification") ||
    text.includes("approval verification") ||
    text.includes(".test.operion.ai")
    ? { scope: "qa" }
    : { scope: "live" };
}
