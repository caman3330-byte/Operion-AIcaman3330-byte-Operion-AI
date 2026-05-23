import type { Json } from "@operion/shared";
import { getOperationsAnalyticsSnapshot } from "../analytics/service";
import { logAIAction } from "../ai/action-logger";
import { logger } from "../logger";
import { getLaunchMonitoringSnapshot } from "../operations/monitoring";
import { getSupabaseAdmin } from "../supabase/server";

export type OperationalEventSeverity = "info" | "warn" | "error";

export interface OperationalEvent {
  event: string;
  severity?: OperationalEventSeverity;
  workflowKey?: string;
  entityType?: string;
  entityId?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export interface RetryTrackingInput {
  workflowKey: string;
  entityId: string;
  attempt: number;
  maxAttempts: number;
  nextRetryAt?: string;
  errorMessage?: string;
}

export function logOperationalEvent(input: OperationalEvent) {
  const payload = {
    workflowKey: input.workflowKey,
    entityType: input.entityType,
    entityId: input.entityId,
    correlationId: input.correlationId,
    metadata: input.metadata
  };

  if (input.severity === "error") {
    logger.error(input.event, payload);
    return;
  }

  if (input.severity === "warn") {
    logger.warn(input.event, payload);
    return;
  }

  logger.info(input.event, payload);
}

export async function trackWorkflowEvent(input: {
  workflowKey: string;
  stepKey: string;
  status: "started" | "completed" | "failed" | "skipped" | "retried";
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();
    const { error } = await supabase.from("workflow_execution_traces").insert({
      workflow_key: input.workflowKey,
      step_key: input.stepKey,
      status: input.status,
      entity_type: "operational_event",
      entity_id: input.entityId,
      attempt: 1,
      input: (input.metadata ?? {}) as Json,
      output: {} as Json,
      started_at: new Date().toISOString(),
      ...(input.status === "completed" || input.status === "failed" || input.status === "skipped"
        ? { completed_at: new Date().toISOString() }
        : {})
    });
    if (error) {
      logOperationalEvent({ event: "Workflow event persistence failed", severity: "warn", workflowKey: input.workflowKey, metadata: { error: error.message } });
      return { success: false, error: error.message };
    }
    logOperationalEvent({
      event: "Workflow event tracked",
      workflowKey: input.workflowKey,
      metadata: { stepKey: input.stepKey, status: input.status },
      ...(input.entityId ? { entityId: input.entityId } : {})
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function trackAiExecutionEvent(input: {
  modelUsed: string;
  executionLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  confidenceScore: number;
  workflowSource: string;
  promptType: "underwriting" | "risk_analysis" | "lead_qualification" | "lender_matching" | "operational_insights" | "banking_patterns";
  merchantId?: string;
  dealId?: string;
  metadata?: Record<string, any>;
}) {
  return logAIAction({
    modelUsed: input.modelUsed,
    executionLatencyMs: input.executionLatencyMs,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    estimatedCostUsd: input.estimatedCostUsd,
    retryCount: 0,
    confidenceScore: input.confidenceScore,
    promptType: input.promptType,
    workflowSource: input.workflowSource,
    metadata: input.metadata ?? {},
    ...(input.merchantId ? { merchantId: input.merchantId } : {}),
    ...(input.dealId ? { dealId: input.dealId } : {})
  });
}

export async function trackRetry(input: RetryTrackingInput): Promise<{ success: boolean; error?: string }> {
  logOperationalEvent({
    event: "Workflow retry scheduled",
    severity: input.attempt >= input.maxAttempts ? "warn" : "info",
    workflowKey: input.workflowKey,
    entityId: input.entityId,
    metadata: {
      attempt: input.attempt,
      maxAttempts: input.maxAttempts,
      nextRetryAt: input.nextRetryAt,
      errorMessage: input.errorMessage
    }
  });

  if (input.attempt >= input.maxAttempts) {
    return trackWorkflowEvent({
      workflowKey: input.workflowKey,
      stepKey: "retry_exhausted",
      status: "failed",
      entityId: input.entityId,
      metadata: { attempt: input.attempt, maxAttempts: input.maxAttempts, errorMessage: input.errorMessage }
    });
  }

  return trackWorkflowEvent({
    workflowKey: input.workflowKey,
    stepKey: "retry_scheduled",
    status: "retried",
    entityId: input.entityId,
    metadata: { attempt: input.attempt, maxAttempts: input.maxAttempts, nextRetryAt: input.nextRetryAt }
  });
}

export async function getOperationalDiagnostics() {
  const [snapshot, launchMonitoringResult] = await Promise.all([
    getOperationsAnalyticsSnapshot(),
    getLaunchMonitoringSnapshot({ limit: 100 }).catch((error) => ({
      error: error instanceof Error ? error.message : String(error)
    }))
  ]);
  if (!snapshot.snapshot) return snapshot;
  const launchMonitoring = "error" in launchMonitoringResult ? null : launchMonitoringResult;

  const issues = [
    snapshot.snapshot.aiExecution.failureRate > 0.15 ? "AI execution failure rate exceeds 15%" : undefined,
    snapshot.snapshot.workflowPerformance.failed > snapshot.snapshot.workflowPerformance.completed * 0.2 ? "Workflow failures are elevated" : undefined,
    snapshot.snapshot.submissions.staleLeadCount > 10 ? "Stale lead count requires operator attention" : undefined,
    launchMonitoringResult && "error" in launchMonitoringResult ? `Launch monitoring unavailable: ${launchMonitoringResult.error}` : undefined,
    ...(launchMonitoring?.alerts.map((alert) => alert.title) ?? [])
  ].filter((issue): issue is string => Boolean(issue));

  return {
    diagnostics: {
      health: launchMonitoring?.health === "critical" || issues.length > 1 ? "critical" : issues.length === 1 ? "degraded" : "healthy",
      issues,
      snapshot: snapshot.snapshot,
      launchMonitoring
    }
  };
}
