import type { Json } from "@operion/shared";
import { AuthorizationError } from "@/lib/errors";
import { autonomousRepository } from "@/lib/autonomous-company/repository";
import type { ToolPermission } from "@/lib/autonomous-company/types";

export class ToolPermissionError extends AuthorizationError {
  constructor(message: string, readonly permission: ToolPermission) {
    super(message);
  }
}

export async function assertCompanyCanOperate(mode: "create_tasks" | "execute_tasks") {
  const state = await autonomousRepository.getCompanyState();
  if (state.emergency_stop || state.status === "EMERGENCY_STOP") {
    await autonomousRepository.recordEvent({
      eventType: "COMPANY_STOPPED",
      actorAgentId: "operations_manager_agent",
      department: "merchant_acquisition",
      payload: { reason: state.reason ?? "Emergency stop is active" },
      severity: "CRITICAL"
    });
    throw new AuthorizationError("Autonomous execution blocked by emergency stop");
  }

  if (state.status !== "OPERATIONAL") {
    await autonomousRepository.pauseAcquisitionAgents(state.reason ?? "Company operating state is paused");
    throw new AuthorizationError(`Company is ${state.status}; autonomous ${mode} is blocked`);
  }

  return state;
}

export async function assertBudgetAvailable(scopeKey: string, estimatedCostUsd: number) {
  const state = await autonomousRepository.getCompanyState();
  const budget = await autonomousRepository.todaysBudget("company", "operion", Number(state.company_daily_ai_budget ?? 0));
  const spent = Number(budget.spent_usd ?? 0);
  const limit = Number(budget.budget_usd ?? state.company_daily_ai_budget ?? 0);
  if (limit > 0 && spent + estimatedCostUsd > limit) {
    await autonomousRepository.createIncident({
      incidentType: "BUDGET_EXCEEDED",
      severity: "WARN",
      title: "AI budget threshold reached",
      description: `Task budget request for ${scopeKey} would exceed the daily AI budget.`,
      actorAgentId: scopeKey,
      department: "merchant_acquisition",
      payload: {
        spent,
        limit,
        estimated_cost_usd: estimatedCostUsd
      } satisfies Json
    });
    await autonomousRepository.upsertRuntimeState(scopeKey, {
      status: "REQUIRES_APPROVAL",
      last_error: "Daily AI budget threshold reached"
    });
    throw new AuthorizationError("Daily AI budget threshold reached");
  }
}

export async function startToolRun(input: {
  toolKey: string;
  agentKey: string;
  taskId?: string | null;
  payload?: Json;
}) {
  await assertCompanyCanOperate("execute_tasks");
  const protectedTools = new Set(["FOUNDER_REVIEW", "CRM_IMPORT", "SEND_EMAIL", "LENDER_ACTION", "UNDERWRITING_DECISION"]);
  if (protectedTools.has(input.toolKey)) throw new ToolPermissionError(`Protected action ${input.toolKey} is unavailable to autonomous workers`, "DENIED");
  const tool = await autonomousRepository.getTool(input.toolKey);
  const permission = !tool || !tool.enabled ? "DENIED" : tool.permission;
  const run = await autonomousRepository.createToolRun(
    {
      toolKey: input.toolKey,
      agentKey: input.agentKey,
      taskId: input.taskId ?? null,
      input: input.payload ?? {}
    },
    permission
  );

  if (permission === "DENIED") {
    await autonomousRepository.recordEvent({
      eventType: "APPROVAL_REJECTED",
      actorAgentId: input.agentKey,
      department: "merchant_acquisition",
      taskId: input.taskId ?? null,
      payload: { tool_key: input.toolKey, reason: "Tool permission denied" },
      severity: "ERROR"
    });
    throw new ToolPermissionError(`Tool ${input.toolKey} is denied for autonomous execution`, permission);
  }

  if (permission === "APPROVAL_REQUIRED") {
    await autonomousRepository.recordEvent({
      eventType: "APPROVAL_REQUESTED",
      actorAgentId: input.agentKey,
      department: "merchant_acquisition",
      taskId: input.taskId ?? null,
      payload: { tool_key: input.toolKey },
      severity: "WARN"
    });
    throw new ToolPermissionError(`Tool ${input.toolKey} requires founder approval`, permission);
  }

  return { runId: run.id, tool, permission };
}


export async function completeToolRun(runId: string, output: Json, startedAt: number, estimatedCost = 0) {
  return autonomousRepository.completeToolRun(runId, "completed", {
    output,
    latencyMs: Date.now() - startedAt,
    estimatedCost
  });
}

export async function failToolRun(runId: string, error: unknown, startedAt: number) {
  const message = error instanceof Error ? error.message : String(error || "Unknown tool execution error");
  return autonomousRepository.completeToolRun(runId, "failed", {
    errorMessage: message,
    latencyMs: Date.now() - startedAt
  });
}
