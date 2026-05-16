import type { AgentQueueStatus, AgentTaskQueueItem, Json } from "@operion/shared";
import { writeAuditLog } from "@/lib/audit";
import { routeWorkflow } from "@/lib/agent-orchestration/orchestrator";
import { executeAgentTask } from "@/lib/agent-runtime/execution-modules";
import { notifyFounder } from "@/lib/notifications";
import { dispatchN8nWorkflow } from "@/lib/n8n";
import { logger } from "@/lib/logger";
import { orchestrationRepository } from "@/lib/repositories/orchestration";

export interface WorkerTickInput {
  workerId: string;
  limit?: number;
  includeAssigned?: boolean;
}

export interface WorkerTickResult {
  worker_id: string;
  processed: Array<{
    task_id: string;
    assigned_agent_key: string;
    status: AgentQueueStatus;
    summary?: string;
    error?: string;
  }>;
  blocked_escalations: number;
  chained_tasks_created: number;
}

const MAX_ATTEMPTS = 3;
const workflowChains: Record<string, string | undefined> = {
  lead_intake: "lead_enrichment",
  lead_enrichment: "lead_qualification",
  lead_qualification: "lender_matching",
  business_discovery: "contact_extraction",
  contact_extraction: "acquisition_enrichment",
  acquisition_enrichment: "outreach_sdr_prep",
  outreach_sdr_prep: "outreach_follow_up",
  outreach_follow_up: "reply_classification",
  reply_classification: "hot_lead_escalation",
  internal_simulation_run: "diagnostics_snapshot",
  diagnostics_snapshot: "production_readiness_report",
  production_readiness_report: undefined,
  underwriting_review: "fraud_risk_check",
  reporting_automation: undefined
};

export async function runWorkerTick(input: WorkerTickInput): Promise<WorkerTickResult> {
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 25);
  const [queued, assigned] = await Promise.all([
    orchestrationRepository.listTasks({ status: "queued", limit }),
    input.includeAssigned ? orchestrationRepository.listTasks({ status: "assigned", limit }) : Promise.resolve([])
  ]);
  const candidates = [...queued, ...assigned].slice(0, limit);
  const processed: WorkerTickResult["processed"] = [];
  let chainedTasksCreated = 0;

  for (const candidate of candidates) {
    const claimed = await claimTask(candidate, input.workerId);
    if (!claimed) {
      continue;
    }

    const result = await executeClaimedTask(claimed, input.workerId);
    processed.push(result.processed);
    chainedTasksCreated += result.chainedTasksCreated;
  }

  const blockedEscalations = await escalateBlockedTasks(input.workerId);

  return {
    worker_id: input.workerId,
    processed,
    blocked_escalations: blockedEscalations,
    chained_tasks_created: chainedTasksCreated
  };
}

async function claimTask(task: AgentTaskQueueItem, workerId: string) {
  if (task.status !== "queued" && task.status !== "assigned") {
    return null;
  }

  const context = {
    ...asRecord(task.context),
    claimed_by_worker: workerId,
    claimed_at: new Date().toISOString()
  } as Json;

  const claimed = await orchestrationRepository.updateTask(task.id, {
    status: "running",
    started_at: task.started_at ?? new Date().toISOString(),
    context
  });

  await writeAuditLog({
    eventType: "agent_task_claimed",
    actorType: "system",
    actorId: workerId,
    entityType: "manager_agent",
    entityId: claimed.id,
    metadata: {
      assigned_agent_key: claimed.assigned_agent_key,
      workflow_key: claimed.workflow_key
    } as Json
  });

  return claimed;
}

async function executeClaimedTask(task: AgentTaskQueueItem, workerId: string) {
  try {
    const startedAt = Date.now();
    const execution = await executeAgentTask(task);
    const completedAt = new Date().toISOString();
    const output = {
      ...asRecord(task.context),
      worker_id: workerId,
      execution_output: execution.output,
      execution_duration_ms: Date.now() - startedAt,
      completed_at: completedAt
    } as Json;

    const completed = await orchestrationRepository.updateTask(task.id, {
      status: "completed",
      result_summary: execution.summary,
      context: output,
      completed_at: completedAt
    });

    await Promise.all([
      orchestrationRepository.createMessage({
        task_id: completed.id,
        from_agent_key: completed.assigned_agent_key,
        to_agent_key: resolveManagerAgent(completed),
        message_type: "summary",
        subject: `Task completed: ${completed.title}`,
        body: execution.summary,
        context: execution.output
      }),
      orchestrationRepository.upsertMemory({
        scope: "agent",
        scope_key: completed.assigned_agent_key,
        memory_key: "last_completed_task",
        memory_value: {
          task_id: completed.id,
          title: completed.title,
          summary: execution.summary,
          output: execution.output
        } as Json,
        source_task_id: completed.id,
        confidence: 1
      }),
      orchestrationRepository.upsertSharedContext({
        context_key: `task_result:${completed.id}`,
        entity_type: "agent_task_queue",
        entity_id: completed.id,
        payload: {
          assigned_agent_key: completed.assigned_agent_key,
          department_key: completed.department_key,
          workflow_key: completed.workflow_key,
          summary: execution.summary,
          output: execution.output
        } as Json,
        created_by_agent_key: completed.assigned_agent_key
      }),
      writeAuditLog({
        eventType: "agent_task_completed",
        actorType: "system",
        actorId: completed.assigned_agent_key,
        entityType: "manager_agent",
        entityId: completed.id,
        afterState: {
          status: "completed",
          result_summary: execution.summary
        } as Json,
        metadata: {
          workflow_key: completed.workflow_key,
          worker_id: workerId
        } as Json
      })
    ]);

    if (execution.shouldEscalate) {
      await notifyFounder({
        severity: "WARN",
        alertType: "agent_execution_escalation",
        title: `${completed.assigned_agent_key} escalated ${completed.title}`,
        message: execution.escalationMessage ?? execution.summary,
        context: {
          task_id: completed.id,
          assigned_agent_key: completed.assigned_agent_key,
          workflow_key: completed.workflow_key
        } as Json
      });
    }

    await dispatchIfNeeded(completed, execution.output);
    const chainedTasksCreated = await createChainedTask(completed, execution.summary);

    return {
      processed: {
        task_id: completed.id,
        assigned_agent_key: completed.assigned_agent_key,
        status: completed.status,
        summary: execution.summary
      },
      chainedTasksCreated
    };
  } catch (error) {
    logger.error("agent_task_execution_failed", { taskId: task.id, workerId, error });
    const failedTask = await recoverFailedTask(task, workerId, error);
    return {
      processed: {
        task_id: failedTask.id,
        assigned_agent_key: failedTask.assigned_agent_key,
        status: failedTask.status,
        error: error instanceof Error ? error.message : "Unknown worker execution error"
      },
      chainedTasksCreated: 0
    };
  }
}

async function recoverFailedTask(task: AgentTaskQueueItem, workerId: string, error: unknown) {
  const context = asRecord(task.context);
  const attempts = Number(context.runtime_attempts ?? 0) + 1;
  const errorMessage = error instanceof Error ? error.message : "Unknown worker execution error";
  const shouldRetry = attempts < MAX_ATTEMPTS;
  const updated = await orchestrationRepository.updateTask(task.id, {
    status: shouldRetry ? "queued" : "failed",
    error_message: errorMessage,
    context: {
      ...context,
      runtime_attempts: attempts,
      last_error: errorMessage,
      last_failed_at: new Date().toISOString(),
      failed_by_worker: workerId
    } as Json,
    completed_at: shouldRetry ? null : new Date().toISOString()
  });

  await writeAuditLog({
    eventType: shouldRetry ? "agent_task_retry_scheduled" : "agent_task_failed",
    actorType: "system",
    actorId: workerId,
    entityType: "manager_agent",
    entityId: updated.id,
    metadata: {
      attempts,
      max_attempts: MAX_ATTEMPTS,
      error: errorMessage
    } as Json
  });

  if (!shouldRetry) {
    await notifyFounder({
      severity: "CRITICAL",
      alertType: "agent_task_failed",
      title: `${updated.assigned_agent_key} failed ${updated.title}`,
      message: errorMessage,
      context: {
        task_id: updated.id,
        assigned_agent_key: updated.assigned_agent_key,
        workflow_key: updated.workflow_key
      } as Json
    });
  }

  return updated;
}

async function createChainedTask(task: AgentTaskQueueItem, priorSummary: string) {
  if (!task.workflow_key) {
    return 0;
  }

  const nextWorkflow = workflowChains[task.workflow_key];
  if (!nextWorkflow) {
    return 0;
  }

  await routeWorkflow({
    workflowKey: nextWorkflow,
    title: `Continue ${nextWorkflow.replace(/_/g, " ")} after ${task.title}`,
    instructions: `Continue the chained workflow after task ${task.id}. Prior agent summary: ${priorSummary}`,
    context: {
      parent_task_id: task.id,
      previous_workflow_key: task.workflow_key,
      previous_summary: priorSummary
    } as Json,
    priority: task.priority,
    createdBy: task.assigned_agent_key
  });

  return 1;
}

async function dispatchIfNeeded(task: AgentTaskQueueItem, output: Json) {
  if (!task.workflow_key) {
    return;
  }

  await dispatchN8nWorkflow({
    workflowKey: task.workflow_key,
    event: "agent_task_completed",
    payload: {
      task_id: task.id,
      workflow_key: task.workflow_key,
      assigned_agent_key: task.assigned_agent_key,
      output
    } as Json
  });
}

async function escalateBlockedTasks(workerId: string) {
  const blocked = await orchestrationRepository.listTasks({ status: "blocked", limit: 25 });
  let escalations = 0;

  for (const task of blocked) {
    const context = asRecord(task.context);
    if (context.blocked_escalated_at) {
      continue;
    }

    await orchestrationRepository.updateTask(task.id, {
      context: {
        ...context,
        blocked_escalated_at: new Date().toISOString(),
        blocked_escalated_by: workerId
      } as Json
    });

    await notifyFounder({
      severity: "WARN",
      alertType: "blocked_agent_task",
      title: `Approval needed: ${task.title}`,
      message: `${task.assigned_agent_key} is blocked pending approval for workflow ${task.workflow_key ?? "manual"}.`,
      context: {
        task_id: task.id,
        approval_id: task.approval_id,
        workflow_key: task.workflow_key,
        assigned_agent_key: task.assigned_agent_key
      } as Json
    });
    escalations += 1;
  }

  return escalations;
}

function resolveManagerAgent(task: AgentTaskQueueItem) {
  if (task.department_key === "operations") {
    return "operations_manager_agent";
  }

  if (task.department_key === "marketing") {
    return "marketing_manager";
  }

  return "executive_manager_agent";
}

function asRecord(value: Json | null): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json>) : {};
}
