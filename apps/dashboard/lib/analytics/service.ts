import { getOperationalMetrics } from "../ai/action-logger";
import { getSupabaseAdmin } from "../supabase/server";
import type {
  FundingVelocityAnalytics,
  LenderPerformanceAnalytics,
  OperationsAnalyticsSnapshot,
  OperationsAnalyticsWindow,
  SubmissionAnalytics,
  WorkflowPerformanceAnalytics
} from "./types";

export async function getOperationsAnalyticsSnapshot(
  window: OperationsAnalyticsWindow = defaultAnalyticsWindow()
): Promise<{ snapshot?: OperationsAnalyticsSnapshot; error?: string }> {
  try {
    const [submissions, fundingVelocity, lenderPerformance, workflowPerformance, underwritingExecution, failureCategories, aiExecution] = await Promise.all([
      getSubmissionAnalytics(window),
      getFundingVelocityAnalytics(window),
      getLenderPerformanceAnalytics(window),
      getWorkflowPerformanceAnalytics(window),
      getUnderwritingExecutionAnalytics(window),
      getFailureCategories(window),
      getOperationalMetrics(Math.ceil((new Date(window.to).getTime() - new Date(window.from).getTime()) / 60000))
    ]);

    return {
      snapshot: {
        window,
        submissions,
        fundingVelocity,
        lenderPerformance,
        workflowPerformance,
        underwritingExecution,
        executionLatency: {
          averageAiLatencyMs: aiExecution.averageLatencyMs,
          averageWorkflowCompletionHours: workflowPerformance.averageCompletionHours
        },
        failureCategories,
        aiExecution: {
          totalActions: aiExecution.totalActions,
          failureRate: aiExecution.failureRate,
          averageLatencyMs: aiExecution.averageLatencyMs,
          totalCostUsd: aiExecution.totalCostUsd
        }
      }
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getUnderwritingExecutionAnalytics(window: OperationsAnalyticsWindow) {
  const supabase = await getSupabaseAdmin();
  const { data } = await supabase
    .from("underwriting_reviews")
    .select("status,risk_score,created_at")
    .gte("created_at", window.from)
    .lte("created_at", window.to);

  const rows = data ?? [];
  const riskScores = rows.map((row) => row.risk_score).filter((value): value is number => typeof value === "number");
  return {
    queuedReviews: rows.filter((row) => row.status === "queued" || row.status === "in_review").length,
    completedReviews: rows.filter((row) => row.status === "approved" || row.status === "declined").length,
    escalatedReviews: rows.filter((row) => row.status === "escalated" || row.status === "needs_information").length,
    averageRiskScore: riskScores.length > 0 ? Number((riskScores.reduce((sum, value) => sum + value, 0) / riskScores.length).toFixed(2)) : null
  };
}

export async function getFailureCategories(window: OperationsAnalyticsWindow): Promise<Record<string, number>> {
  const supabase = await getSupabaseAdmin();
  const [{ data: aiTasks }, { data: workflows }] = await Promise.all([
    supabase
      .from("ai_tasks")
      .select("error_message,created_at")
      .eq("status", "failed")
      .gte("created_at", window.from)
      .lte("created_at", window.to),
    supabase
      .from("workflow_execution_traces")
      .select("error_message,step_key,created_at")
      .eq("status", "failed")
      .gte("created_at", window.from)
      .lte("created_at", window.to)
  ]);

  const categories: Record<string, number> = {};
  for (const item of aiTasks ?? []) {
    increment(categories, categorizeFailure(item.error_message ?? "ai_task_failed"));
  }
  for (const item of workflows ?? []) {
    increment(categories, categorizeFailure(item.error_message ?? item.step_key));
  }
  return categories;
}

export async function getSubmissionAnalytics(window: OperationsAnalyticsWindow): Promise<SubmissionAnalytics> {
  const supabase = await getSupabaseAdmin();
  const { data } = await supabase
    .from("business_applications")
    .select("status,updated_at,metadata")
    .gte("created_at", window.from)
    .lte("created_at", window.to);

  const rows = data ?? [];
  const byStatus = countBy(rows, (row) => row.status);
  const bySource = countBy(rows, (row) => readAttributionSource(row.metadata));
  const approved = rows.filter((row) => ["approved", "funded"].includes(row.status)).length;
  const staleCutoff = Date.now() - 72 * 60 * 60 * 1000;
  const staleLeadCount = rows.filter((row) => !["funded", "rejected", "withdrawn", "inactive"].includes(row.status) && new Date(row.updated_at).getTime() < staleCutoff).length;

  return {
    totalSubmissions: rows.length,
    byStatus,
    bySource,
    approvalRatio: rows.length > 0 ? Number((approved / rows.length).toFixed(2)) : 0,
    staleLeadCount
  };
}

export async function getFundingVelocityAnalytics(window: OperationsAnalyticsWindow): Promise<FundingVelocityAnalytics> {
  const supabase = await getSupabaseAdmin();
  const { data } = await supabase
    .from("funding_offers")
    .select("amount,status,accepted_at,created_at")
    .gte("created_at", window.from)
    .lte("created_at", window.to);
  const accepted = (data ?? []).filter((offer) => offer.status === "accepted");
  const fundingDurations = accepted
    .filter((offer) => offer.accepted_at)
    .map((offer) => (new Date(offer.accepted_at as string).getTime() - new Date(offer.created_at).getTime()) / 86400000);

  return {
    fundedCount: accepted.length,
    averageDaysToFunding: fundingDurations.length > 0
      ? Number((fundingDurations.reduce((sum, days) => sum + days, 0) / fundingDurations.length).toFixed(2))
      : null,
    totalAcceptedFunding: accepted.reduce((sum, offer) => sum + offer.amount, 0)
  };
}

export async function getLenderPerformanceAnalytics(window: OperationsAnalyticsWindow): Promise<LenderPerformanceAnalytics> {
  const supabase = await getSupabaseAdmin();
  const { data } = await supabase
    .from("lender_matches")
    .select("status,created_at")
    .gte("created_at", window.from)
    .lte("created_at", window.to);
  const rows = data ?? [];
  const acceptedMatches = rows.filter((row) => ["accepted", "funded"].includes(row.status)).length;
  const fundedMatches = rows.filter((row) => row.status === "funded").length;
  return {
    routedMatches: rows.length,
    acceptedMatches,
    fundedMatches,
    lenderAcceptanceRatio: rows.length > 0 ? Number((acceptedMatches / rows.length).toFixed(2)) : 0
  };
}

export async function getWorkflowPerformanceAnalytics(window: OperationsAnalyticsWindow): Promise<WorkflowPerformanceAnalytics> {
  const supabase = await getSupabaseAdmin();
  const { data } = await supabase
    .from("agent_task_queue")
    .select("status,created_at,completed_at")
    .gte("created_at", window.from)
    .lte("created_at", window.to);
  const rows = data ?? [];
  const completedRows = rows.filter((row) => row.completed_at);
  const completionHours = completedRows.map((row) =>
    (new Date(row.completed_at as string).getTime() - new Date(row.created_at).getTime()) / 3600000
  );
  return {
    queued: rows.filter((row) => row.status === "queued").length,
    running: rows.filter((row) => row.status === "running").length,
    completed: rows.filter((row) => row.status === "completed").length,
    failed: rows.filter((row) => row.status === "failed").length,
    blocked: rows.filter((row) => row.status === "blocked").length,
    averageCompletionHours: completionHours.length > 0
      ? Number((completionHours.reduce((sum, hours) => sum + hours, 0) / completionHours.length).toFixed(2))
      : null
  };
}

export function defaultAnalyticsWindow(): OperationsAnalyticsWindow {
  return {
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    to: new Date().toISOString()
  };
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function increment(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1;
}

function readAttributionSource(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "direct";
  const record = metadata as Record<string, unknown>;
  const attribution = record.attribution;
  if (attribution && typeof attribution === "object" && !Array.isArray(attribution)) {
    return normalizeSource((attribution as Record<string, unknown>).source);
  }
  return normalizeSource(record.source);
}

function normalizeSource(value: unknown) {
  const source = String(value ?? "").trim().toLowerCase();
  if (source === "instagram") return "instagram";
  if (source === "business-funding") return "business-funding";
  if (source === "organic") return "organic";
  if (source === "referral") return "referral";
  return "direct";
}

function categorizeFailure(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("timeout")) return "timeout";
  if (normalized.includes("validation") || normalized.includes("zod")) return "validation";
  if (normalized.includes("auth") || normalized.includes("permission")) return "authorization";
  if (normalized.includes("supabase") || normalized.includes("database") || normalized.includes("schema")) return "database";
  if (normalized.includes("openai") || normalized.includes("claude") || normalized.includes("anthropic")) return "ai_provider";
  return "operational";
}
