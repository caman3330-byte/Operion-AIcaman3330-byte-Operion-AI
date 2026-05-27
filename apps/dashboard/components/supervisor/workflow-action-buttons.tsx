"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  type FounderWorkflowActionState,
  updateFounderWorkflowState
} from "@/app/(dashboard)/supervisor/actions";

const initialState: FounderWorkflowActionState = {
  status: "idle",
  message: null
};

export function WorkflowActionButtons({
  taskId,
  scope,
  status
}: {
  taskId: string;
  scope: "live" | "qa";
  status: string | undefined;
}) {
  const [state, formAction] = useActionState(updateFounderWorkflowState, initialState);
  const canResolve = status !== "cancelled" && status !== "completed";
  const canReopen = status === "cancelled" || status === "completed" || status === "failed";

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="taskId" value={taskId} />
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {scope === "qa" ? <WorkflowButton action="archive_qa" label="Archive QA" tone="warning" /> : null}
        {scope === "qa" ? (
          <WorkflowButton action="mark_live" label="Mark live" />
        ) : (
          <WorkflowButton action="mark_qa" label="Mark QA" />
        )}
        {canResolve ? <WorkflowButton action="resolve_stale" label="Resolve stale" /> : null}
        {canReopen ? <WorkflowButton action="reopen_review" label="Reopen review" /> : null}
      </div>
      {state.message ? (
        <p className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-primary"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function WorkflowButton({
  action,
  label,
  tone = "default"
}: {
  action: string;
  label: string;
  tone?: "default" | "warning";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      name="action"
      value={action}
      disabled={pending}
      className={
        tone === "warning"
          ? "min-h-9 rounded-md border border-warning px-2 py-1 text-xs text-warning-foreground disabled:opacity-60"
          : "min-h-9 rounded-md border px-2 py-1 text-xs text-muted-foreground disabled:opacity-60"
      }
    >
      {pending ? "Working..." : label}
    </button>
  );
}
