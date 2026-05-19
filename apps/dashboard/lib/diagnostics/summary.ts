import type { DiagnosticsSummary, Json, ProductionReadinessReport } from "@operion/shared";
import { getConfigurationStatus } from "@/lib/env";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { apiUsageRepository } from "@/lib/repositories/api-usage";
import { orchestrationRepository } from "@/lib/repositories/orchestration";
import { productionRepository } from "@/lib/repositories/production";
import { simulationRepository } from "@/lib/repositories/simulation";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function collectDiagnosticsSnapshot(): Promise<DiagnosticsSummary> {
  const [controls, acquisition, tasks, approvals, traces, apiUsage, supabaseLatency, communicationHealth, lenderHealth, workflowRecovery] = await Promise.all([
    simulationRepository.getWorkerControls().catch(() => null),
    acquisitionRepository.summary().catch(() => null),
    orchestrationRepository.listTasks({ limit: 200 }).catch(() => []),
    orchestrationRepository.listApprovals({ limit: 200, status: "pending" }).catch(() => []),
    simulationRepository.listTraces(200).catch(() => []),
    apiUsageRepository.summary(7).catch(() => ({ total_cost_usd: 0, successful_calls: 0, failed_calls: 0, by_service: {} })),
    measureSupabaseLatency().catch(() => null),
    productionRepository.getCommunicationHealthSummary(200).catch(() => ({
      total_messages: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      bounced: 0,
      replies: 0,
      reply_rate: 0,
      average_response_delay_ms: null
    })),
    productionRepository.getLenderPerformanceSummary(200).catch(() => ({
      total_matches: 0,
      recommended: 0,
      approved: 0,
      submitted: 0,
      accepted: 0,
      rejected: 0,
      funded: 0,
      active_lenders: 0,
      unresponsive_lenders: 0,
      average_match_score: null
    })),
    productionRepository.getWorkflowRecoverySummary().catch(() => ({
      total_tasks: 0,
      failed_tasks: 0,
      blocked_tasks: 0,
      retryable_tasks: 0,
      stuck_tasks: 0,
      recovery_recommended: false
    }))
  ]);

  const failedTasks = tasks.filter((task) => task.status === "failed").length;
  const runningTasks = tasks.filter((task) => task.status === "running").length;
  const retriesPending = (acquisition?.outreach.queued_emails ?? 0) + tasks.filter((task) => task.error_message && task.status === "queued").length;
  const workflowFailures = traces.filter((trace) => trace.status === "failed").length;
  const enrichmentFailures = traces.filter((trace) => trace.step_key.includes("enrichment") && trace.status === "failed").length;
  const apiFailures = apiUsage.failed_calls;

  const bottlenecks: string[] = [];
  const recommendations: string[] = [];

  if (controls?.workers_paused) {
    bottlenecks.push("Workers are paused");
    recommendations.push("Resume workers after the current review window.");
  }
  if ((acquisition?.outreach.pending_approval_emails ?? 0) > 0 || approvals.length > 0) {
    bottlenecks.push("Approval queue has pending items");
    recommendations.push("Review approval-gated outreach and high-risk lead decisions.");
  }
  if (apiFailures > 0 || workflowFailures > 0 || failedTasks > 0) {
    bottlenecks.push("Failures detected across API, workflow, or task execution");
    recommendations.push("Use execution traces to isolate the failed step and replay the workflow after fixes.");
  }
  if (workflowRecovery.recovery_recommended) {
    bottlenecks.push("Workflow recovery is recommended due to blocked or stuck tasks");
    recommendations.push("Review failed and blocked orchestration tasks and retry the workflows after resolving root causes.");
  }
  const configStatus = getConfigurationStatus();
  if (!configStatus.sendgrid) {
    bottlenecks.push("SendGrid is not configured");
    recommendations.push("Configure SendGrid before production outreach delivery.");
  }
  if (!configStatus.apollo) {
    bottlenecks.push("Apollo is not configured");
    recommendations.push("Configure Apollo provider mapping before live acquisition.");
  }
  if (!configStatus.slack) {
    bottlenecks.push("Slack notifications are not configured");
    recommendations.push("Configure Slack webhook delivery for operational alerts.");
  }
  if (!configStatus.stripe) {
    bottlenecks.push("Stripe payments are not configured");
    recommendations.push("Configure Stripe before invoice or settlement operations.");
  }
  if (!configStatus.crm) {
    bottlenecks.push("CRM sync is not configured");
    recommendations.push("Configure CRM webhook sync for live lead and application updates.");
  }
  if (!configStatus.n8n) {
    bottlenecks.push("n8n workflow delivery is not configured");
    recommendations.push("Configure n8n webhook endpoints for workflow orchestration and alert dispatch.");
  }

  const healthStatus = resolveHealthStatus({
    critical: failedTasks > 5 || workflowFailures > 10,
    degraded: bottlenecks.length > 0 || apiFailures > 0 || enrichmentFailures > 0
  });

  const summary: DiagnosticsSummary = {
    health_status: healthStatus,
    worker_health: {
      paused: controls?.workers_paused ?? false,
      stress_mode_enabled: controls?.stress_mode_enabled ?? false,
      running_tasks: runningTasks,
      failed_tasks: failedTasks
    },
    queue_health: {
      acquisition_queued: acquisition?.jobs.queued ?? 0,
      outreach_queued: acquisition?.outreach.queued_emails ?? 0,
      approvals_pending: approvals.length + (acquisition?.outreach.pending_approval_emails ?? 0),
      retries_pending: retriesPending
    },
    latency: {
      supabase_ms: supabaseLatency,
      ai_provider_ms: null
    },
    failures: {
      api_failures: apiFailures,
      enrichment_failures: enrichmentFailures,
      workflow_failures: workflowFailures
    },
    communication_health: communicationHealth,
    lender_health: lenderHealth,
    workflow_recovery: workflowRecovery,
    bottlenecks,
    recommendations
  };

  await simulationRepository
    .createDiagnosticSnapshot({
      snapshot_type: "operational",
      health_status: healthStatus,
      metrics: summary as unknown as Json,
      bottlenecks: bottlenecks as unknown as Json,
      recommendations: recommendations as unknown as Json
    })
    .catch(() => null);

  return summary;
}

export async function generateProductionReadinessReport(createdBy: string, simulationRunId?: string | null): Promise<ProductionReadinessReport> {
  const diagnostics = await collectDiagnosticsSnapshot();
  const configStatus = getConfigurationStatus();
  const stableSystems = [
    "TypeScript compile pipeline",
    "Founder-protected API route architecture",
    "Supabase service-role repository layer",
    "Simulation lead generation",
    "Workflow tracing"
  ];
  const unstableSystems = diagnostics.bottlenecks;
  const requiredIntegrations = [
    ...(!configStatus.sendgrid ? ["SendGrid verified sender and API key"] : []),
    ...(!configStatus.apollo ? ["Apollo endpoint mapping and field normalization"] : []),
    ...(!configStatus.slack ? ["Slack webhook URL for alerting"] : []),
    ...(!configStatus.stripe ? ["Stripe secret key for invoice creation"] : []),
    ...(!configStatus.crm ? ["CRM webhook URL for sync"] : []),
    ...(!configStatus.n8n ? ["n8n webhook base URL and internal API key"] : [])
  ];
  const scalingBottlenecks = [
    ...(diagnostics.queue_health.approvals_pending > 0 ? ["Founder approval queue throughput"] : []),
    ...(diagnostics.latency.supabase_ms && diagnostics.latency.supabase_ms > 750 ? ["Supabase latency exceeds target"] : []),
    ...(diagnostics.worker_health.paused ? ["Workers paused"] : [])
  ];
  const body = [
    `Production readiness status: ${diagnostics.health_status}.`,
    `Worker health: ${diagnostics.worker_health.running_tasks} running, ${diagnostics.worker_health.failed_tasks} failed, paused=${diagnostics.worker_health.paused}.`,
    `Queue health: ${diagnostics.queue_health.acquisition_queued} acquisition queued, ${diagnostics.queue_health.outreach_queued} outreach queued, ${diagnostics.queue_health.approvals_pending} approvals pending.`,
    `Failures: ${diagnostics.failures.api_failures} API, ${diagnostics.failures.enrichment_failures} enrichment, ${diagnostics.failures.workflow_failures} workflow.`,
    `Next phase: configure live acquisition/outreach integrations and run a 1,000-lead stress simulation after migrations 0004 and 0005 are applied.`
  ].join("\n");

  return simulationRepository.createReadinessReport({
    simulation_run_id: simulationRunId ?? null,
    status: diagnostics.health_status,
    stable_systems: stableSystems as unknown as Json,
    unstable_systems: unstableSystems as unknown as Json,
    scaling_bottlenecks: scalingBottlenecks as unknown as Json,
    required_integrations: requiredIntegrations as unknown as Json,
    next_recommended_phase: "Apply pending migrations, configure live providers, then run 1,000-lead stress validation.",
    report_body: body,
    created_by: createdBy
  });
}

async function measureSupabaseLatency() {
  const startedAt = Date.now();
  const { error } = await getSupabaseAdmin().from("leads").select("id").limit(1);
  if (error) throw error;
  return Date.now() - startedAt;
}

function resolveHealthStatus(input: { critical: boolean; degraded: boolean }) {
  if (input.critical) return "critical";
  if (input.degraded) return "degraded";
  return "healthy";
}
