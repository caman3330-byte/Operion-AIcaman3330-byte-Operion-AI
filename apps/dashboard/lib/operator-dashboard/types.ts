import type {
  AiTaskLog,
  BusinessApplication,
  CrmActivity,
  LenderMatch,
  WorkflowExecutionTrace
} from "@operion/shared";
import type { OperationsAnalyticsSnapshot } from "../analytics/types";
import type { PaginatedOperationalResult } from "../operations/operator-services";

export type OperatorHealthStatus = "healthy" | "degraded" | "critical";

export interface UnderwritingQueueItem {
  applicationId: string;
  businessName: string;
  industry: string;
  status: string;
  requestedAmount: number;
  monthlyDeposits: number;
  riskTier: "low" | "medium" | "high" | "critical" | "unknown";
  approvalProbability: number | null;
  stale: boolean;
  staleHours: number;
  updatedAt: string;
  summary: string | null;
}

export interface UnderwritingDashboard {
  queue: PaginatedOperationalResult<UnderwritingQueueItem>;
  metrics: {
    pendingReviews: number;
    staleApplications: number;
    highRiskApplications: number;
    averageApprovalProbability: number | null;
  };
}

export interface CrmOperatorDashboard {
  intakeQueue: PaginatedOperationalResult<BusinessApplication>;
  staleQueue: PaginatedOperationalResult<BusinessApplication>;
  recentActivities: PaginatedOperationalResult<CrmActivity>;
}

export interface AnalyticsExecutionDashboard {
  snapshot: OperationsAnalyticsSnapshot | null;
  productivity: {
    queuePressure: number;
    completedWorkflowShare: number;
    staleLeadShare: number;
    aiFailurePressure: number;
  };
}

export interface AiControlCenterDashboard {
  executions: PaginatedOperationalResult<AiTaskLog>;
  metrics: {
    totalExecutions: number;
    failedExecutions: number;
    averageLatencyMs: number | null;
    averageConfidenceScore: number | null;
    byProvider: Record<string, number>;
  };
}

export interface WorkflowControlDashboard {
  traces: PaginatedOperationalResult<WorkflowExecutionTrace>;
  metrics: {
    retryCount: number;
    failureCount: number;
    averageLatencyMs: number | null;
    byWorkflow: Record<string, number>;
  };
}

export interface LenderRoutingDashboard {
  matches: PaginatedOperationalResult<LenderMatch>;
  metrics: {
    routedMatches: number;
    acceptedMatches: number;
    fundedMatches: number;
    successRate: number;
  };
}

export interface OperatorDashboardSummary {
  health: OperatorHealthStatus;
  underwriting: UnderwritingDashboard;
  crm: CrmOperatorDashboard;
  analytics: AnalyticsExecutionDashboard;
  ai: AiControlCenterDashboard;
  workflows: WorkflowControlDashboard;
  lenders: LenderRoutingDashboard;
  risks: string[];
}
