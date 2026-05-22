import type { Json } from "@operion/shared";
import { simulationRepository } from "../repositories/simulation";
import { getOperationsAnalyticsSnapshot } from "./service";
import type { OperationsAnalyticsWindow } from "./types";

export async function createDailyOperationsSnapshot(window?: OperationsAnalyticsWindow) {
  const result = await getOperationsAnalyticsSnapshot(window);
  if (!result.snapshot) return result;

  const snapshot = await simulationRepository.createDiagnosticSnapshot({
    snapshot_type: "daily_operations",
    health_status: result.snapshot.submissions.staleLeadCount > 25 || result.snapshot.aiExecution.failureRate > 0.2 ? "degraded" : "healthy",
    metrics: result.snapshot as unknown as Json,
    bottlenecks: deriveBottlenecks(result.snapshot) as Json,
    recommendations: deriveRecommendations(result.snapshot) as Json
  });

  return { snapshot };
}

function deriveBottlenecks(snapshot: NonNullable<Awaited<ReturnType<typeof getOperationsAnalyticsSnapshot>>["snapshot"]>) {
  return [
    snapshot.submissions.staleLeadCount > 0 ? { type: "stale_leads", count: snapshot.submissions.staleLeadCount } : undefined,
    snapshot.workflowPerformance.failed > 0 ? { type: "workflow_failures", count: snapshot.workflowPerformance.failed } : undefined,
    snapshot.aiExecution.failureRate > 0.1 ? { type: "ai_failure_rate", rate: snapshot.aiExecution.failureRate } : undefined
  ].filter(Boolean);
}

function deriveRecommendations(snapshot: NonNullable<Awaited<ReturnType<typeof getOperationsAnalyticsSnapshot>>["snapshot"]>) {
  return [
    snapshot.submissions.staleLeadCount > 0 ? "Review stale merchant applications and schedule follow-up." : undefined,
    snapshot.workflowPerformance.failed > 0 ? "Inspect failed workflow tasks before increasing automation volume." : undefined,
    snapshot.lenderPerformance.lenderAcceptanceRatio < 0.2 ? "Review lender criteria and routing thresholds." : undefined
  ].filter(Boolean);
}
