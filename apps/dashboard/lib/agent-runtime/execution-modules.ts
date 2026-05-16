import type { AgentTaskQueueItem, Json } from "@operion/shared";
import { collectDiagnosticsSnapshot } from "@/lib/diagnostics/summary";
import { apiUsageRepository } from "@/lib/repositories/api-usage";
import { alertsRepository } from "@/lib/repositories/alerts";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { simulationRepository } from "@/lib/repositories/simulation";
import { leadsRepository } from "@/lib/repositories/leads";
import { lendersRepository } from "@/lib/repositories/lenders";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export interface WorkerExecutionResult {
  summary: string;
  output: Json;
  memory?: Json;
  shouldEscalate?: boolean;
  escalationMessage?: string;
}

type ExecutionModule = (task: AgentTaskQueueItem) => Promise<WorkerExecutionResult>;

const moduleMap: Record<string, ExecutionModule> = {
  lead_generation_agent: executeLeadGenerationAgent,
  outreach_agent: executeOutreachAgent,
  reporting_agent: executeReportingAgent,
  simulation_agent: executeSimulationAgent,
  diagnostics_agent: executeDiagnosticsAgent,
  sales_manager: executeSalesManager,
  sales_agent: executeSalesManager,
  marketing_manager: executeMarketingManager,
  marketing_agent: executeMarketingManager,
  support_manager: executeSupportManager,
  customer_support_agent: executeSupportManager,
  underwriting_manager: executeUnderwritingManager,
  underwriting_agent: executeUnderwritingManager,
  finance_manager: executeFinanceManager,
  finance_accounting_agent: executeFinanceManager
};

export async function executeAgentTask(task: AgentTaskQueueItem): Promise<WorkerExecutionResult> {
  const executionModule = moduleMap[task.assigned_agent_key] ?? executeGenericAgent;
  return executionModule(task);
}

async function executeSalesManager(task: AgentTaskQueueItem): Promise<WorkerExecutionResult> {
  const [activeLenders, allLenders] = await Promise.all([lendersRepository.list(true), lendersRepository.list(false)]);
  const inactiveLenders = allLenders.length - activeLenders.length;
  const highValueLenders = activeLenders.filter((lender) => Number(lender.price_per_lead ?? 0) >= 75).length;

  return {
    summary: `Sales review complete: ${activeLenders.length} active lender(s), ${inactiveLenders} inactive lender(s), ${highValueLenders} high-value lender profile(s).`,
    output: {
      active_lenders: activeLenders.length,
      inactive_lenders: inactiveLenders,
      high_value_lenders: highValueLenders,
      recommended_action: activeLenders.length === 0 ? "Escalate lender activation before distribution." : "Continue lender readiness monitoring."
    },
    memory: {
      last_active_lender_count: activeLenders.length,
      last_high_value_lender_count: highValueLenders
    },
    shouldEscalate: activeLenders.length === 0,
    escalationMessage: "No active lenders are available for distribution workflows."
  };
}

async function executeLeadGenerationAgent(task: AgentTaskQueueItem): Promise<WorkerExecutionResult> {
  const summary = await acquisitionRepository.summary();
  const needsAttention = summary.jobs.failed > 0 || summary.average_quality_score < 50;

  return {
    summary: `Lead acquisition review complete: ${summary.leads.total} total lead(s), ${summary.contacts} contact(s), ${summary.jobs.queued} queued acquisition job(s), average quality ${summary.average_quality_score}.`,
    output: {
      acquisition_summary: summary,
      recommended_action: needsAttention
        ? "Review failed acquisition jobs or low-quality source performance."
        : "Continue current acquisition queue execution."
    },
    memory: {
      last_acquisition_summary: summary
    },
    shouldEscalate: needsAttention,
    escalationMessage: "Lead acquisition quality or failed job volume requires founder review."
  };
}

async function executeOutreachAgent(task: AgentTaskQueueItem): Promise<WorkerExecutionResult> {
  const summary = await acquisitionRepository.summary();
  const pendingApproval = summary.outreach.pending_approval_emails;
  const queueBlocked = pendingApproval > 0 && summary.outreach.queued_emails === 0;

  return {
    summary: `Outreach review complete: ${summary.outreach.campaigns} campaign(s), ${summary.outreach.queued_emails} queued email(s), ${pendingApproval} pending approval, ${summary.outreach.positive_replies} positive reply(s).`,
    output: {
      outreach_summary: summary.outreach,
      recommended_action: queueBlocked ? "Approve or reject pending outreach before the SDR queue can continue." : "Outreach queue is ready for worker execution."
    },
    memory: {
      last_outreach_summary: summary.outreach
    },
    shouldEscalate: queueBlocked || summary.outreach.positive_replies > 0,
    escalationMessage:
      summary.outreach.positive_replies > 0
        ? "Positive outreach replies are ready for founder or sales review."
        : "Outreach emails are blocked by approval gates."
  };
}

async function executeReportingAgent(task: AgentTaskQueueItem): Promise<WorkerExecutionResult> {
  const [acquisition, usage] = await Promise.all([acquisitionRepository.summary(), apiUsageRepository.summary(30)]);

  return {
    summary: `Reporting review complete: ${acquisition.leads.total} lead(s), ${acquisition.outreach.sent_emails} sent outreach email(s), ${formatCurrency(
      usage.total_cost_usd
    )} 30-day API cost.`,
    output: {
      acquisition,
      api_usage: usage,
      recommended_action: "Use this snapshot in the next founder executive briefing."
    },
    memory: {
      last_reporting_snapshot: {
        acquisition,
        usage
      }
    }
  };
}

async function executeSimulationAgent(task: AgentTaskQueueItem): Promise<WorkerExecutionResult> {
  const [runs, traces] = await Promise.all([simulationRepository.listRuns(25), simulationRepository.listTraces(100)]);
  const failedRuns = runs.filter((run) => run.status === "failed").length;
  const failedTraces = traces.filter((trace) => trace.status === "failed").length;

  return {
    summary: `Simulation review complete: ${runs.length} recent run(s), ${failedRuns} failed run(s), ${failedTraces} failed trace(s).`,
    output: {
      recent_runs: runs.length,
      failed_runs: failedRuns,
      failed_traces: failedTraces,
      recommended_action: failedRuns > 0 || failedTraces > 0 ? "Replay failed workflows after reviewing execution traces." : "Simulation runtime is stable."
    },
    memory: {
      last_failed_simulation_runs: failedRuns,
      last_failed_simulation_traces: failedTraces
    },
    shouldEscalate: failedRuns > 0 || failedTraces > 0,
    escalationMessage: "Internal simulation failures require review before production launch."
  };
}

async function executeDiagnosticsAgent(task: AgentTaskQueueItem): Promise<WorkerExecutionResult> {
  const diagnostics = await collectDiagnosticsSnapshot();

  return {
    summary: `Diagnostics review complete: health is ${diagnostics.health_status}, ${diagnostics.bottlenecks.length} bottleneck(s), ${diagnostics.queue_health.approvals_pending} approval(s) pending.`,
    output: {
      diagnostics,
      recommended_action:
        diagnostics.health_status === "healthy" ? "Continue validation cadence." : "Review bottlenecks before production readiness sign-off."
    },
    memory: {
      last_diagnostics_snapshot: diagnostics
    },
    shouldEscalate: diagnostics.health_status === "critical",
    escalationMessage: "Diagnostics reported critical launch readiness risk."
  };
}

async function executeMarketingManager(task: AgentTaskQueueItem): Promise<WorkerExecutionResult> {
  const alerts = await alertsRepository.listUnresolved(25);
  const brandAlerts = alerts.filter((alert) =>
    ["brand", "campaign", "content", "marketing"].some((keyword) => alert.alert_type.toLowerCase().includes(keyword))
  );

  return {
    summary: `Marketing review complete: ${brandAlerts.length} brand/campaign alert(s) and ${alerts.length} total unresolved alert(s).`,
    output: {
      unresolved_alerts: alerts.length,
      brand_or_campaign_alerts: brandAlerts.length,
      recommended_action: brandAlerts.length > 0 ? "Review brand-sensitive alerts before campaign execution." : "No brand blockers detected."
    },
    memory: {
      last_brand_alert_count: brandAlerts.length
    },
    shouldEscalate: brandAlerts.some((alert) => alert.severity === "CRITICAL"),
    escalationMessage: "Critical marketing or brand alert requires founder review."
  };
}

async function executeSupportManager(task: AgentTaskQueueItem): Promise<WorkerExecutionResult> {
  const alerts = await alertsRepository.listUnresolved(50);
  const critical = alerts.filter((alert) => alert.severity === "CRITICAL").length;
  const warnings = alerts.filter((alert) => alert.severity === "WARN").length;

  return {
    summary: `Support triage complete: ${critical} critical alert(s), ${warnings} warning alert(s), ${alerts.length} unresolved alert(s).`,
    output: {
      critical_alerts: critical,
      warning_alerts: warnings,
      unresolved_alerts: alerts.length,
      recommended_action: critical > 0 ? "Escalate critical customer-impact risk." : "Continue monitoring support queue."
    },
    memory: {
      last_critical_alert_count: critical,
      last_warning_alert_count: warnings
    },
    shouldEscalate: critical > 0,
    escalationMessage: "Critical support alert requires founder review."
  };
}

async function executeUnderwritingManager(task: AgentTaskQueueItem): Promise<WorkerExecutionResult> {
  const [raw, qualified, pendingApproval, errors] = await Promise.all([
    leadsRepository.list({ pageSize: 100, status: "raw" }),
    leadsRepository.list({ pageSize: 100, status: "qualified" }),
    leadsRepository.list({ pageSize: 100, status: "pending_approval" }),
    leadsRepository.list({ pageSize: 100, status: "qualification_error" })
  ]);
  const totalReviewable = raw.total + qualified.total + pendingApproval.total + errors.total;

  return {
    summary: `Underwriting review complete: ${totalReviewable} reviewable lead(s), ${pendingApproval.total} pending approval, ${errors.total} qualification error(s).`,
    output: {
      raw_leads: raw.total,
      qualified_leads: qualified.total,
      pending_approval_leads: pendingApproval.total,
      qualification_errors: errors.total,
      recommended_action: errors.total > 0 ? "Review qualification errors before lender matching." : "Lead underwriting queue is stable."
    },
    memory: {
      last_reviewable_lead_count: totalReviewable,
      last_pending_approval_count: pendingApproval.total
    },
    shouldEscalate: errors.total > 0,
    escalationMessage: "Qualification errors are blocking underwriting confidence."
  };
}

async function executeFinanceManager(task: AgentTaskQueueItem): Promise<WorkerExecutionResult> {
  const [usage, invoiceSummary] = await Promise.all([apiUsageRepository.summary(30), getInvoiceSummary()]);
  const budget = Number(process.env.MONTHLY_API_BUDGET_USD ?? 500);
  const budgetUsed = budget > 0 ? usage.total_cost_usd / budget : 0;

  return {
    summary: `Finance review complete: ${usage.successful_calls} successful API call(s), ${usage.failed_calls} failed call(s), ${formatCurrency(
      usage.total_cost_usd
    )} estimated API cost, ${invoiceSummary.invoice_count} invoice record(s).`,
    output: {
      api_usage: usage,
      invoices: invoiceSummary,
      monthly_budget_usd: budget,
      budget_used_ratio: budgetUsed,
      recommended_action: budgetUsed >= 0.8 ? "Escalate API spend threshold." : "Cost profile is inside configured budget."
    },
    memory: {
      last_api_cost_usd: usage.total_cost_usd,
      last_invoice_count: invoiceSummary.invoice_count
    },
    shouldEscalate: budgetUsed >= 0.8,
    escalationMessage: "AI/API usage is approaching the configured monthly budget."
  };
}

async function executeGenericAgent(task: AgentTaskQueueItem): Promise<WorkerExecutionResult> {
  return {
    summary: `${task.assigned_agent_key} completed a bounded operational review for: ${task.title}.`,
    output: {
      task_id: task.id,
      assigned_agent_key: task.assigned_agent_key,
      workflow_key: task.workflow_key,
      instructions_reviewed: true,
      recommended_action: "No specialized execution module is registered yet; task was logged as reviewed."
    },
    memory: {
      last_reviewed_task_id: task.id,
      last_reviewed_task_title: task.title
    }
  };
}

async function getInvoiceSummary() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("invoices").select("status,total_amount");
  if (error) {
    throw error;
  }

  const rows = data ?? [];
  return {
    invoice_count: rows.length,
    total_amount: rows.reduce((sum, invoice) => sum + Number(invoice.total_amount ?? 0), 0),
    draft_count: rows.filter((invoice) => invoice.status === "draft").length,
    sent_count: rows.filter((invoice) => invoice.status === "sent").length,
    paid_count: rows.filter((invoice) => invoice.status === "paid").length
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 4 : 2
  }).format(value);
}
