import type { SupervisorSummary } from "@/lib/agent-orchestration/orchestrator";
import type { ProductionSupervisorSummary } from "@/lib/data/supervisor-command";
import type { LaunchMonitoringSnapshot } from "@/lib/operations/monitoring";
import type { OperatorDashboardSummary } from "@/lib/operator-dashboard/types";

export type ReliabilityTone = "success" | "warning" | "destructive" | "secondary" | "outline";

export interface ReliabilityHealthCheck {
  label: string;
  state: string;
  detail: string;
  tone: ReliabilityTone;
}

export interface ReliabilityFailure {
  id: string;
  timestamp: string;
  category: string;
  severity: "info" | "warning" | "critical";
  retryState: string;
  detail: string;
}

export interface ReliabilityMetric {
  label: string;
  value: string;
  detail: string;
  tone?: ReliabilityTone;
}

export interface ReliabilityAlert {
  id: string;
  title: string;
  detail: string;
  severity: "info" | "warning" | "critical";
  count: number;
}

export interface ReliabilityCenterModel {
  status: "healthy" | "degraded" | "critical";
  healthChecks: ReliabilityHealthCheck[];
  failures: ReliabilityFailure[];
  metrics: ReliabilityMetric[];
  alerts: ReliabilityAlert[];
}

export function buildReliabilityCenterModel(input: {
  supervisor: SupervisorSummary;
  production: ProductionSupervisorSummary;
  operator: OperatorDashboardSummary;
  monitoring: LaunchMonitoringSnapshot;
}): ReliabilityCenterModel {
  const { supervisor, production, operator, monitoring } = input;
  const totalEmail = production.emailOperations.sent + production.emailOperations.failed;
  const emailSuccessRatio = totalEmail === 0 ? 100 : Math.round((production.emailOperations.sent / totalEmail) * 100);
  const uploadSuccessRatio = production.operationalMetrics.uploadCompletionRate;
  const workflowsToday = operator.workflows.traces.items.filter((trace) => isToday(trace.completed_at ?? trace.created_at)).length;
  const approvalsCompletedToday = supervisor.approvals.filter((approval) =>
    approval.status !== "pending" && isToday(approval.decided_at ?? approval.updated_at)
  ).length;
  const stalledWorkflows = operator.workflows.traces.items.filter((trace) => trace.status !== "completed" && ageHours(trace.created_at) >= 72).length;
  const pendingLenderRoutes = operator.lenders.matches.items.filter((match) =>
    match.status === "recommended" || match.status === "approved" || match.status === "submitted"
  ).length;
  const lastSuccessfulWorkflow = operator.workflows.traces.items
    .filter((trace) => trace.status === "completed")
    .sort((a, b) => Date.parse(b.completed_at ?? b.created_at) - Date.parse(a.completed_at ?? a.created_at))[0];
  const apiLatency = operator.ai.metrics.averageLatencyMs ?? operator.workflows.metrics.averageLatencyMs ?? null;
  const healthChecks: ReliabilityHealthCheck[] = [
    {
      label: "API runtime",
      state: monitoring.health === "healthy" ? "operational" : monitoring.health,
      detail: apiLatency ? `${apiLatency}ms recent execution latency` : "Runtime responding through protected dashboard checks.",
      tone: monitoring.health === "critical" ? "destructive" : monitoring.health === "degraded" ? "warning" : "success"
    },
    {
      label: "Supabase",
      state: production.source === "supabase" && !production.migrationRequired ? "connected" : "degraded",
      detail: production.source === "supabase" ? "Production summary loaded from Supabase." : "Production summary fallback active.",
      tone: production.source === "supabase" && !production.migrationRequired ? "success" : "warning"
    },
    {
      label: "SendGrid",
      state: production.emailOperations.sendgridConfigured ? "configured" : "missing",
      detail: `${emailSuccessRatio}% delivery success from tracked outreach logs.`,
      tone: !production.emailOperations.sendgridConfigured || production.emailOperations.failed > 0 ? "warning" : "success"
    },
    {
      label: "OpenAI",
      state: production.configurationStatus.openai ? "configured" : "missing",
      detail: `${supervisor.ai_usage.by_service.openai > 0 ? "recent usage recorded" : "no recent spend signal"}`,
      tone: production.configurationStatus.openai ? "success" : "warning"
    },
    {
      label: "Anthropic",
      state: production.configurationStatus.anthropic ? "configured" : "missing",
      detail: `${supervisor.ai_usage.by_service.anthropic > 0 ? "recent usage recorded" : "no recent spend signal"}`,
      tone: production.configurationStatus.anthropic ? "success" : "warning"
    },
    {
      label: "Upload pipeline",
      state: production.operationalMetrics.uploadsPending > 0 ? "pending review" : "clear",
      detail: `${uploadSuccessRatio}% upload success ratio, ${production.operationalMetrics.uploadsPending} pending.`,
      tone: production.operationalMetrics.uploadsPending > 0 ? "warning" : "success"
    },
    {
      label: "Last workflow success",
      state: lastSuccessfulWorkflow ? "recorded" : "no recent success",
      detail: lastSuccessfulWorkflow ? `${lastSuccessfulWorkflow.workflow_key} / ${lastSuccessfulWorkflow.step_key}` : "No completed workflow trace in current window.",
      tone: lastSuccessfulWorkflow ? "success" : "warning"
    }
  ];

  const failures = buildRecentFailures({ production, operator, monitoring });
  const alerts = buildAlerts({ production, monitoring, apiLatency, uploadSuccessRatio, emailSuccessRatio });
  const metrics: ReliabilityMetric[] = [
    { label: "workflows today", value: String(workflowsToday), detail: "Completed or updated workflow traces today." },
    { label: "approvals completed", value: String(approvalsCompletedToday), detail: "Founder approval decisions recorded today." },
    { label: "stalled workflows", value: String(stalledWorkflows), detail: "Open workflow traces aged 72h+.", tone: stalledWorkflows > 0 ? "warning" : "success" },
    { label: "pending lender routes", value: String(pendingLenderRoutes), detail: "Recommended, approved, or submitted lender matches.", tone: pendingLenderRoutes > 0 ? "warning" : "success" },
    { label: "upload success", value: `${uploadSuccessRatio}%`, detail: `${production.operationalMetrics.documentsUploaded} uploaded document(s).`, tone: uploadSuccessRatio >= 80 ? "success" : "warning" },
    { label: "email delivery", value: `${emailSuccessRatio}%`, detail: `${production.emailOperations.failed} failed send(s).`, tone: production.emailOperations.failed > 0 ? "warning" : "success" }
  ];
  const status =
    alerts.some((alert) => alert.severity === "critical") || failures.some((failure) => failure.severity === "critical")
      ? "critical"
      : alerts.length > 0 || failures.length > 0
        ? "degraded"
        : "healthy";

  return {
    status,
    healthChecks,
    failures,
    metrics,
    alerts
  };
}

function buildRecentFailures(input: {
  production: ProductionSupervisorSummary;
  operator: OperatorDashboardSummary;
  monitoring: LaunchMonitoringSnapshot;
}): ReliabilityFailure[] {
  const failures: ReliabilityFailure[] = [
    ...input.operator.ai.executions.items
      .filter((item) => item.status === "failed" || item.status === "blocked")
      .map((item) => ({
        id: `ai-${item.id}`,
        timestamp: item.created_at,
        category: "AI workflow execution",
        severity: item.status === "failed" ? "critical" as const : "warning" as const,
        retryState: retryLabel(item.metadata),
        detail: `${item.provider ?? "provider"} execution ${item.status}`
      })),
    ...input.operator.workflows.traces.items
      .filter((trace) => trace.status === "failed" || trace.status === "retried")
      .map((trace) => ({
        id: `workflow-${trace.id}`,
        timestamp: trace.created_at,
        category: trace.workflow_key,
        severity: trace.status === "failed" ? "critical" as const : "warning" as const,
        retryState: trace.status === "retried" ? `attempt ${trace.attempt}` : "review required",
        detail: `${trace.step_key} ${trace.status}`
      })),
    ...input.operator.lenders.matches.items
      .filter((match) => match.status === "rejected")
      .map((match) => ({
        id: `lender-${match.id}`,
        timestamp: match.updated_at,
        category: "lender routing",
        severity: "warning" as const,
        retryState: "manual review",
        detail: "Lender match rejected"
      }))
  ];

  if (input.production.emailOperations.failed > 0) {
    failures.push({
      id: "email-failed-summary",
      timestamp: input.monitoring.generatedAt,
      category: "email delivery",
      severity: "warning",
      retryState: "manual review",
      detail: `${input.production.emailOperations.failed} failed email send(s)`
    });
  }

  if (input.production.operationalMetrics.uploadsPending > 0) {
    failures.push({
      id: "upload-pending-summary",
      timestamp: input.monitoring.generatedAt,
      category: "upload pipeline",
      severity: "info",
      retryState: "merchant/founder follow-up",
      detail: `${input.production.operationalMetrics.uploadsPending} requested upload(s) pending`
    });
  }

  return failures.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 8);
}

function buildAlerts(input: {
  production: ProductionSupervisorSummary;
  monitoring: LaunchMonitoringSnapshot;
  apiLatency: number | null;
  uploadSuccessRatio: number;
  emailSuccessRatio: number;
}): ReliabilityAlert[] {
  const alerts: ReliabilityAlert[] = input.monitoring.alerts.map((alert) => ({
    id: `launch-${alert.category}`,
    title: alert.title,
    detail: alert.detail,
    severity: alert.severity === "critical" ? "critical" : alert.severity === "warn" ? "warning" : "info",
    count: alert.count
  }));

  if ((input.apiLatency ?? 0) > 5000) {
    alerts.push({
      id: "api-latency-warning",
      title: "API latency warning",
      detail: "Recent AI or workflow execution latency is above the live-beta comfort band.",
      severity: "warning",
      count: input.apiLatency ?? 0
    });
  }

  if (input.uploadSuccessRatio > 0 && input.uploadSuccessRatio < 80) {
    alerts.push({
      id: "upload-success-degraded",
      title: "Upload completion degraded",
      detail: "Upload success ratio is below the live operations target.",
      severity: "warning",
      count: Math.round(input.uploadSuccessRatio)
    });
  }

  if (input.production.emailOperations.failed > 0 || input.emailSuccessRatio < 95) {
    alerts.push({
      id: "email-delivery-watch",
      title: "Email delivery watch",
      detail: "Tracked outbound emails include failures or reduced delivery ratio.",
      severity: "warning",
      count: input.production.emailOperations.failed
    });
  }

  if (!input.production.configurationStatus.supabase || input.production.migrationRequired) {
    alerts.push({
      id: "supabase-connectivity-watch",
      title: "Supabase connectivity degraded",
      detail: "Production summary could not confirm a fully active Supabase state.",
      severity: "critical",
      count: 1
    });
  }

  return alerts.slice(0, 8);
}

function retryLabel(metadata: unknown) {
  const text = JSON.stringify(metadata ?? {}).toLowerCase();
  if (text.includes("retry")) return "retry signaled";
  if (text.includes("fallback")) return "fallback signaled";
  return "manual review";
}

function isToday(value: string | null | undefined) {
  if (!value) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Date.parse(value) >= start.getTime();
}

function ageHours(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 0;
  return (Date.now() - parsed) / 3600000;
}
