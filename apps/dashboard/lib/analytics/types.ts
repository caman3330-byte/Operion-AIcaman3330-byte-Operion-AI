export interface OperationsAnalyticsWindow {
  from: string;
  to: string;
}

export interface SubmissionAnalytics {
  totalSubmissions: number;
  byStatus: Record<string, number>;
  approvalRatio: number;
  staleLeadCount: number;
}

export interface FundingVelocityAnalytics {
  fundedCount: number;
  averageDaysToFunding: number | null;
  totalAcceptedFunding: number;
}

export interface LenderPerformanceAnalytics {
  routedMatches: number;
  acceptedMatches: number;
  fundedMatches: number;
  lenderAcceptanceRatio: number;
}

export interface WorkflowPerformanceAnalytics {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  blocked: number;
  averageCompletionHours: number | null;
}

export interface OperationsAnalyticsSnapshot {
  window: OperationsAnalyticsWindow;
  submissions: SubmissionAnalytics;
  fundingVelocity: FundingVelocityAnalytics;
  lenderPerformance: LenderPerformanceAnalytics;
  workflowPerformance: WorkflowPerformanceAnalytics;
  underwritingExecution: {
    queuedReviews: number;
    completedReviews: number;
    escalatedReviews: number;
    averageRiskScore: number | null;
  };
  executionLatency: {
    averageAiLatencyMs: number;
    averageWorkflowCompletionHours: number | null;
  };
  failureCategories: Record<string, number>;
  aiExecution: {
    totalActions: number;
    failureRate: number;
    averageLatencyMs: number;
    totalCostUsd: number;
  };
}
