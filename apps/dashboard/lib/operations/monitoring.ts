import { getOperatorDashboardSummary } from "../operator-dashboard/service";
import type { OperatorDashboardSummary, OperatorHealthStatus } from "../operator-dashboard/types";

export type LaunchAlertSeverity = "info" | "warn" | "critical";
export type LaunchAlertCategory =
  | "workflow_failure"
  | "ai_execution_failure"
  | "stale_lead"
  | "retry_spike"
  | "underwriting_anomaly"
  | "lender_routing_failure";

export interface LaunchAlert {
  category: LaunchAlertCategory;
  severity: LaunchAlertSeverity;
  title: string;
  detail: string;
  count: number;
}

export interface LaunchMonitoringSnapshot {
  health: OperatorHealthStatus;
  generatedAt: string;
  alerts: LaunchAlert[];
  counters: {
    workflowFailures: number;
    aiExecutionFailures: number;
    staleLeads: number;
    retryCount: number;
    underwritingAnomalies: number;
    lenderRoutingFailures: number;
  };
  firstWeekPriorities: string[];
}

export async function getLaunchMonitoringSnapshot(input: {
  staleThresholdHours?: number;
  limit?: number;
} = {}): Promise<LaunchMonitoringSnapshot> {
  const summary = await getOperatorDashboardSummary({
    staleThresholdHours: input.staleThresholdHours ?? 72,
    limit: input.limit ?? 100
  });

  return buildLaunchMonitoringSnapshot(summary);
}

export function buildLaunchMonitoringSnapshot(summary: OperatorDashboardSummary): LaunchMonitoringSnapshot {
  const workflowFailures = summary.workflows.metrics.failureCount;
  const aiExecutionFailures = summary.ai.metrics.failedExecutions;
  const staleLeads = summary.crm.staleQueue.pagination.returned + summary.underwriting.metrics.staleApplications;
  const retryCount = summary.workflows.metrics.retryCount;
  const underwritingAnomalies =
    summary.underwriting.metrics.highRiskApplications +
    summary.underwriting.queue.items.filter((item) => item.approvalProbability !== null && item.approvalProbability < 0.25).length;
  const lenderRoutingFailures = summary.lenders.matches.items.filter((item) => item.status === "rejected").length;

  const alerts: LaunchAlert[] = [
    workflowFailures > 0
      ? {
          category: "workflow_failure",
          severity: workflowFailures >= 5 ? "critical" : "warn",
          title: "Workflow failures detected",
          detail: "Review failed workflow execution traces before releasing operators to live volume.",
          count: workflowFailures
        }
      : undefined,
    aiExecutionFailures > 0
      ? {
          category: "ai_execution_failure",
          severity: aiExecutionFailures >= 3 ? "critical" : "warn",
          title: "AI execution failures detected",
          detail: "Inspect provider, malformed response, retry, and fallback behavior in the AI review feed.",
          count: aiExecutionFailures
        }
      : undefined,
    staleLeads > 0
      ? {
          category: "stale_lead",
          severity: staleLeads >= 10 ? "critical" : "warn",
          title: "Stale leads require action",
          detail: "Operators should clear stale intake and underwriting records before first-week monitoring starts.",
          count: staleLeads
        }
      : undefined,
    retryCount >= 5
      ? {
          category: "retry_spike",
          severity: retryCount >= 15 ? "critical" : "warn",
          title: "Retry volume elevated",
          detail: "Check workflow recovery, provider latency, and external integration errors.",
          count: retryCount
        }
      : undefined,
    underwritingAnomalies > 0
      ? {
          category: "underwriting_anomaly",
          severity: underwritingAnomalies >= 5 ? "critical" : "warn",
          title: "Underwriting anomalies present",
          detail: "High-risk or low-probability applications need manual review before lender routing.",
          count: underwritingAnomalies
        }
      : undefined,
    lenderRoutingFailures > 0
      ? {
          category: "lender_routing_failure",
          severity: lenderRoutingFailures >= 5 ? "critical" : "warn",
          title: "Lender routing failures detected",
          detail: "Review rejected lender matches and distribution criteria before live submissions scale.",
          count: lenderRoutingFailures
        }
      : undefined
  ].filter((alert): alert is LaunchAlert => Boolean(alert));

  return {
    health: alerts.some((alert) => alert.severity === "critical") ? "critical" : alerts.length > 0 ? "degraded" : "healthy",
    generatedAt: new Date().toISOString(),
    alerts,
    counters: {
      workflowFailures,
      aiExecutionFailures,
      staleLeads,
      retryCount,
      underwritingAnomalies,
      lenderRoutingFailures
    },
    firstWeekPriorities: [
      "Watch workflow failures and retries after every intake batch.",
      "Review AI failures, malformed responses, fallbacks, confidence scores, and latency daily.",
      "Clear stale leads and underwriting reviews before they exceed the 72-hour operating threshold.",
      "Monitor lender routing rejects and funded-match conversion before increasing distribution volume."
    ]
  };
}
