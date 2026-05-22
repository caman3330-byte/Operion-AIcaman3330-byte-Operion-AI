import type { AiTaskLog, BusinessApplication, CrmActivity, CrmActivityType, LenderMatch, WorkflowExecutionTrace, WorkflowTraceStatus } from "@operion/shared";
import { getOperationsAnalyticsSnapshot } from "../analytics/service";
import { getSupabaseAdmin } from "../supabase/server";
import {
  getAiExecutionReviewFeed,
  getIntakeReviewQueue,
  getLenderRoutingExecutionFeed,
  getStaleLeadQueue,
  getUnderwritingQueue,
  getWorkflowRetryMetrics,
  type OperatorListOptions,
  type PaginatedOperationalResult
} from "../operations/operator-services";
import type {
  AiControlCenterDashboard,
  AnalyticsExecutionDashboard,
  CrmOperatorDashboard,
  LenderRoutingDashboard,
  OperatorDashboardSummary,
  UnderwritingDashboard,
  UnderwritingQueueItem,
  WorkflowControlDashboard
} from "./types";

export async function getUnderwritingOperatorDashboard(
  options: Partial<OperatorListOptions> = {}
): Promise<UnderwritingDashboard> {
  const queue = await getUnderwritingQueue(options);
  const items = queue.items.map(toUnderwritingQueueItem);
  const approvalProbabilities = items
    .map((item) => item.approvalProbability)
    .filter((value): value is number => typeof value === "number");

  return {
    queue: {
      ...queue,
      items
    },
    metrics: {
      pendingReviews: items.length,
      staleApplications: items.filter((item) => item.stale).length,
      highRiskApplications: items.filter((item) => item.riskTier === "high" || item.riskTier === "critical").length,
      averageApprovalProbability: approvalProbabilities.length > 0
        ? round(approvalProbabilities.reduce((sum, value) => sum + value, 0) / approvalProbabilities.length)
        : null
    }
  };
}

export async function getCrmOperatorDashboard(
  options: Partial<OperatorListOptions> & { staleThresholdHours?: number } = {}
): Promise<CrmOperatorDashboard> {
  const [intakeQueue, staleQueue, recentActivities] = await Promise.all([
    getIntakeReviewQueue(options),
    getStaleLeadQueue(options),
    getRecentCrmActivities(options)
  ]);

  return { intakeQueue, staleQueue, recentActivities };
}

export async function getAnalyticsExecutionDashboard(): Promise<AnalyticsExecutionDashboard> {
  const result = await getOperationsAnalyticsSnapshot();
  const snapshot = result.snapshot ?? null;
  const totalSubmissions = snapshot?.submissions.totalSubmissions ?? 0;
  const workflowTotal = snapshot
    ? snapshot.workflowPerformance.queued +
      snapshot.workflowPerformance.running +
      snapshot.workflowPerformance.completed +
      snapshot.workflowPerformance.failed +
      snapshot.workflowPerformance.blocked
    : 0;

  return {
    snapshot,
    productivity: {
      queuePressure: snapshot ? snapshot.workflowPerformance.queued + snapshot.workflowPerformance.blocked : 0,
      completedWorkflowShare: workflowTotal > 0 && snapshot ? round(snapshot.workflowPerformance.completed / workflowTotal) : 0,
      staleLeadShare: totalSubmissions > 0 && snapshot ? round(snapshot.submissions.staleLeadCount / totalSubmissions) : 0,
      aiFailurePressure: snapshot?.aiExecution.failureRate ?? 0
    }
  };
}

export async function getAiControlCenterDashboard(
  options: Partial<OperatorListOptions> = {}
): Promise<AiControlCenterDashboard> {
  const executions = await getAiExecutionReviewFeed(options) as PaginatedOperationalResult<AiTaskLog>;
  const averageLatencyMs = average(
    executions.items.map((item) => item.latency_ms).filter((value): value is number => typeof value === "number")
  );
  const confidenceScores = executions.items
    .map((item) => metadataNumber(item.metadata, "confidenceScore"))
    .filter((value): value is number => typeof value === "number");

  return {
    executions,
    metrics: {
      totalExecutions: executions.items.length,
      failedExecutions: executions.items.filter((item) => item.status === "failed").length,
      averageLatencyMs,
      averageConfidenceScore: average(confidenceScores),
      byProvider: countBy(executions.items, (item) => item.provider ?? "unknown")
    }
  };
}

export async function getWorkflowControlDashboard(
  options: Partial<OperatorListOptions> = {}
): Promise<WorkflowControlDashboard> {
  const retryMetrics = await getWorkflowRetryMetrics(options);
  const traces = await getWorkflowTraceFeed(options);
  return {
    traces,
    metrics: retryMetrics.metrics ?? {
      retryCount: 0,
      failureCount: 0,
      averageLatencyMs: null,
      byWorkflow: {}
    }
  };
}

export async function getLenderRoutingDashboard(
  options: Partial<OperatorListOptions> = {}
): Promise<LenderRoutingDashboard> {
  const matches = await getLenderRoutingExecutionFeed(options) as PaginatedOperationalResult<LenderMatch>;
  const acceptedMatches = matches.items.filter((item) => item.status === "accepted" || item.status === "funded").length;
  const fundedMatches = matches.items.filter((item) => item.status === "funded").length;
  return {
    matches,
    metrics: {
      routedMatches: matches.items.length,
      acceptedMatches,
      fundedMatches,
      successRate: matches.items.length > 0 ? round(acceptedMatches / matches.items.length) : 0
    }
  };
}

export async function getOperatorDashboardSummary(
  options: Partial<OperatorListOptions> & { staleThresholdHours?: number } = {}
): Promise<OperatorDashboardSummary> {
  const [underwriting, crm, analytics, ai, workflows, lenders] = await Promise.all([
    getUnderwritingOperatorDashboard(options),
    getCrmOperatorDashboard(options),
    getAnalyticsExecutionDashboard(),
    getAiControlCenterDashboard(options),
    getWorkflowControlDashboard(options),
    getLenderRoutingDashboard(options)
  ]);

  const risks = [
    underwriting.metrics.staleApplications > 0 ? "Underwriting queue includes stale applications." : undefined,
    ai.metrics.failedExecutions > 0 ? "AI execution feed includes failures requiring review." : undefined,
    workflows.metrics.failureCount > 0 ? "Workflow failures are present in the execution trace." : undefined,
    analytics.productivity.aiFailurePressure > 0.15 ? "AI failure rate exceeds operational tolerance." : undefined
  ].filter((risk): risk is string => Boolean(risk));

  return {
    health: risks.length === 0 ? "healthy" : risks.length <= 2 ? "degraded" : "critical",
    underwriting,
    crm,
    analytics,
    ai,
    workflows,
    lenders,
    risks
  };
}

async function getRecentCrmActivities(
  options: Partial<OperatorListOptions> = {}
): Promise<PaginatedOperationalResult<CrmActivity>> {
  const normalized = normalizeOptions(options);
  const supabase = await getSupabaseAdmin();
  let query = supabase
    .from("crm_activities")
    .select("*")
    .order("created_at", { ascending: false })
    .range(normalized.offset, normalized.offset + normalized.limit - 1);
  if (normalized.from) query = query.gte("created_at", normalized.from);
  if (normalized.to) query = query.lte("created_at", normalized.to);
  const activityType = crmActivityType(normalized.status);
  if (activityType) query = query.eq("activity_type", activityType);
  const { data, error } = await query;
  return paginate(data ?? [], normalized, error?.message);
}

async function getWorkflowTraceFeed(
  options: Partial<OperatorListOptions> = {}
): Promise<PaginatedOperationalResult<WorkflowExecutionTrace>> {
  const normalized = normalizeOptions(options);
  const supabase = await getSupabaseAdmin();
  let query = supabase
    .from("workflow_execution_traces")
    .select("*")
    .order("created_at", { ascending: false })
    .range(normalized.offset, normalized.offset + normalized.limit - 1);
  const traceStatus = workflowTraceStatus(normalized.status);
  if (traceStatus) query = query.eq("status", traceStatus);
  if (normalized.from) query = query.gte("created_at", normalized.from);
  if (normalized.to) query = query.lte("created_at", normalized.to);
  const { data, error } = await query;
  return paginate(data ?? [], normalized, error?.message);
}

function toUnderwritingQueueItem(application: BusinessApplication): UnderwritingQueueItem {
  const metadata = isRecord(application.metadata) ? application.metadata : {};
  const underwriting = isRecord(metadata.underwriting) ? metadata.underwriting : {};
  const staleHours = Math.max(0, (Date.now() - new Date(application.updated_at).getTime()) / 3600000);
  return {
    applicationId: application.id,
    businessName: application.business_name,
    industry: application.industry,
    status: application.status,
    requestedAmount: application.requested_amount,
    monthlyDeposits: application.monthly_deposits,
    riskTier: readRiskTier(underwriting.riskTier),
    approvalProbability: readNumber(underwriting.approvalProbability),
    stale: staleHours >= 72,
    staleHours: round(staleHours),
    updatedAt: application.updated_at,
    summary: typeof underwriting.summary === "string" ? underwriting.summary : null
  };
}

function normalizeOptions(options: Partial<OperatorListOptions>): OperatorListOptions {
  return {
    limit: Math.min(Math.max(options.limit ?? 100, 1), 200),
    offset: Math.max(options.offset ?? 0, 0),
    ...(options.status ? { status: options.status } : {}),
    ...(options.from ? { from: options.from } : {}),
    ...(options.to ? { to: options.to } : {})
  };
}

function paginate<T>(items: T[], options: OperatorListOptions, error?: string): PaginatedOperationalResult<T> {
  return {
    items,
    pagination: {
      limit: options.limit,
      offset: options.offset,
      returned: items.length,
      nextOffset: items.length === options.limit ? options.offset + options.limit : null
    },
    ...(error ? { error } : {})
  };
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function average(values: number[]) {
  return values.length > 0 ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function metadataNumber(value: unknown, key: string) {
  return isRecord(value) ? readNumber(value[key]) : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRiskTier(value: unknown): UnderwritingQueueItem["riskTier"] {
  return value === "low" || value === "medium" || value === "high" || value === "critical" ? value : "unknown";
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function crmActivityType(value: string | undefined): CrmActivityType | null {
  const allowed: CrmActivityType[] = ["note", "call", "email", "status_change", "document_request", "lender_update"];
  return value && allowed.includes(value as CrmActivityType) ? value as CrmActivityType : null;
}

function workflowTraceStatus(value: string | undefined): WorkflowTraceStatus | null {
  const allowed: WorkflowTraceStatus[] = ["started", "completed", "failed", "skipped", "retried"];
  return value && allowed.includes(value as WorkflowTraceStatus) ? value as WorkflowTraceStatus : null;
}
