import type { AiTask, AiTaskStatus, Json } from "@operion/shared";
import { ConfigurationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { leadsRepository } from "@/lib/repositories/leads";
import { productionRepository } from "@/lib/repositories/production";
import { routeAiWorkflow, workflowForTaskType } from "@/lib/ai/router";
import type { AiTaskDispatchInput } from "@/lib/ai/types";

export interface AiTaskDispatchResult {
  worker_id: string;
  processed: Array<{
    task_id: string;
    task_type: string;
    provider?: string;
    status: AiTaskStatus;
    summary?: string;
    error?: string;
  }>;
}

export async function runAiTaskDispatcher(input: AiTaskDispatchInput): Promise<AiTaskDispatchResult> {
  const queued = (await productionRepository.listAiTasks(100))
    .filter((task) => task.status === "queued" && (!input.taskTypes?.length || input.taskTypes.includes(task.task_type)))
    .slice(0, input.limit);
  const processed: AiTaskDispatchResult["processed"] = [];

  for (const task of queued) {
    processed.push(await executeAiTask(task, input.workerId));
  }

  return {
    worker_id: input.workerId,
    processed
  };
}

async function executeAiTask(task: AiTask, workerId: string): Promise<AiTaskDispatchResult["processed"][number]> {
  const startedAt = new Date().toISOString();
  const attempts = (task.attempts ?? 0) + 1;

  await productionRepository.updateAiTask(task.id, {
    status: "running",
    attempts,
    started_at: task.started_at ?? startedAt,
    error_message: null
  });
  await productionRepository.createAiTaskLog({
    ai_task_id: task.id,
    status: "running",
    message: `AI task claimed by ${workerId}`,
    provider: null,
    model: null,
    metadata: {
      worker_id: workerId,
      task_type: task.task_type
    } as Json
  });

  try {
    const workflow = workflowForTaskType(task.task_type);
    const result = await routeAiWorkflow({
      workflow,
      input: buildTaskInput(task)
    });
    const completedAt = new Date().toISOString();
    const resultPayload = result.data as Json;

    await productionRepository.updateAiTask(task.id, {
      status: "completed",
      result_payload: resultPayload,
      cost_estimate_usd: result.usage.estimatedCostUsd,
      completed_at: completedAt
    });
    await productionRepository.createAiTaskLog({
      ai_task_id: task.id,
      status: "completed",
      message: `Completed ${workflow} via ${result.provider}`,
      provider: result.provider,
      model: result.usage.model,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      latency_ms: result.usage.latencyMs,
      cost_estimate_usd: result.usage.estimatedCostUsd,
      metadata: resultPayload
    });
    await productionRepository.createApiUsageLog({
      service: result.provider,
      operation: workflow,
      lead_id: task.lead_id,
      business_application_id: task.business_application_id,
      ai_task_id: task.id,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      estimated_cost_usd: result.usage.estimatedCostUsd,
      success: true,
      latency_ms: result.usage.latencyMs,
      metadata: {
        worker_id: workerId,
        model: result.usage.model
      } as Json
    });

    await applyTaskSideEffects(task, resultPayload);

    await productionRepository.createAuditLog({
      event_type: "ai_task_completed",
      actor_id: workerId,
      actor_role: "system",
      entity_type: "ai_task",
      entity_id: task.id,
      after_state: {
        status: "completed",
        result: resultPayload
      } as Json,
      metadata: {
        provider: result.provider,
        workflow
      } as Json
    });

    return {
      task_id: task.id,
      task_type: task.task_type,
      provider: result.provider,
      status: "completed",
      summary: summarizeResult(resultPayload)
    };
  } catch (error) {
    logger.warn("ai_task_dispatch_failed", { taskId: task.id, workerId, error });
    return recoverAiTask(task, workerId, attempts, error);
  }
}

async function recoverAiTask(
  task: AiTask,
  workerId: string,
  attempts: number,
  error: unknown
): Promise<AiTaskDispatchResult["processed"][number]> {
  const message = error instanceof Error ? error.message : "AI task dispatch failed";
  const blocked = error instanceof ConfigurationError;
  const retryable = !blocked && attempts < (task.max_attempts ?? 3);
  const nextStatus: AiTaskStatus = blocked ? "blocked" : retryable ? "queued" : "failed";

  await productionRepository.updateAiTask(task.id, {
    status: nextStatus,
    error_message: message,
    completed_at: nextStatus === "failed" ? new Date().toISOString() : null
  });
  await productionRepository.createAiTaskLog({
    ai_task_id: task.id,
    status: nextStatus,
    message,
    provider: null,
    model: null,
    metadata: {
      worker_id: workerId,
      attempts,
      retryable
    } as Json
  });
  await productionRepository.createApiUsageLog({
    service: task.assigned_agent.includes("openai") ? "openai" : "anthropic",
    operation: String(task.task_type),
    lead_id: task.lead_id,
    business_application_id: task.business_application_id,
    ai_task_id: task.id,
    success: false,
    error_message: message,
    metadata: {
      worker_id: workerId,
      next_status: nextStatus
    } as Json
  });
  await productionRepository.createAuditLog({
    event_type: nextStatus === "queued" ? "ai_task_retry_scheduled" : nextStatus === "blocked" ? "ai_task_blocked" : "ai_task_failed",
    actor_id: workerId,
    actor_role: "system",
    entity_type: "ai_task",
    entity_id: task.id,
    metadata: {
      error_message: message,
      attempts,
      next_status: nextStatus
    } as Json
  });

  return {
    task_id: task.id,
    task_type: task.task_type,
    status: nextStatus,
    error: message
  };
}

async function applyTaskSideEffects(task: AiTask, result: Json) {
  const record = asRecord(result);

  if (task.task_type === "lead_qualification" && task.lead_id) {
    const score = numberFrom(record.score ?? record.qualification_score);
    const decision = String(record.decision ?? "review_required");
    const tier = ["A", "B", "C", "D"].includes(String(record.tier)) ? (String(record.tier) as "A" | "B" | "C" | "D") : null;
    const leadStatus = decision === "qualified" ? "qualified" : decision === "declined" ? "rejected" : "reviewed";
    const applicationStatus = decision === "qualified" ? "qualified" : decision === "declined" ? "rejected" : "reviewed";

    await leadsRepository.update(task.lead_id, {
      qualification_score: score,
      tier,
      status: leadStatus,
      ai_summary: stringFrom(record.underwriting_summary),
      internal_notes: stringFrom(record.internal_notes),
      processing_error: false,
      processing_error_detail: null
    });

    if (task.business_application_id) {
      await productionRepository.updateBusinessApplication(task.business_application_id, {
        status: applicationStatus,
        metadata: {
          ai_task_id: task.id,
          last_ai_decision: decision,
          qualification_score: score,
          lifecycle_updated_at: new Date().toISOString()
        } as Json
      });
    }
  }

  if (requiresApproval(record) && task.business_application_id) {
    await productionRepository.createApproval({
      entity_type: "business_application",
      entity_id: task.business_application_id,
      status: "pending",
      reason: "AI workflow requires supervisor approval",
      metadata: {
        ai_task_id: task.id,
        task_type: task.task_type
      } as Json
    });
  }
}

function buildTaskInput(task: AiTask): Json {
  return {
    task_id: task.id,
    task_type: task.task_type,
    lead_id: task.lead_id,
    business_application_id: task.business_application_id,
    input: task.input_payload
  } as Json;
}

function summarizeResult(result: Json) {
  const record = asRecord(result);
  return stringFrom(record.underwriting_summary ?? record.routing_summary ?? record.summary ?? record.subject) ?? "AI task completed";
}

function requiresApproval(record: Record<string, Json>) {
  return record.requires_approval === true || record.approval_required === true;
}

function numberFrom(value: Json | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function stringFrom(value: Json | undefined) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asRecord(value: Json): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json>) : {};
}
