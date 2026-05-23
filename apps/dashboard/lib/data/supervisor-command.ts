import { logger } from "@/lib/logger";
import { getConfigurationStatus } from "@/lib/env";
import { leadsRepository } from "@/lib/repositories/leads";
import { productionRepository } from "@/lib/repositories/production";

export interface ProductionSupervisorSummary {
  source: "supabase" | "unavailable";
  migrationRequired: boolean;
  configurationStatus: {
    supabase: boolean;
    anthropic: boolean;
    openai: boolean;
    sendgrid: boolean;
    stripe: boolean;
    crm: boolean;
    slack: boolean;
    n8n: boolean;
  };
  environmentReady: boolean;
  applications: number;
  leads: number;
  qualifiedLeads: number;
  pendingApprovals: number;
  aiQueued: number;
  aiRunning: number;
  aiCompleted: number;
  aiFailed: number;
  underwritingQueue: number;
  lenderMatches: number;
  outreachLogs: number;
  estimatedAiCostUsd: number;
  lifecycle: {
    raw: number;
    qualified: number;
    reviewed: number;
    routed: number;
    funded: number;
    rejected: number;
  };
  emailOperations: {
    sendgridConfigured: boolean;
    sent: number;
    failed: number;
    replies: number;
  };
}

export async function getProductionSupervisorSummary(): Promise<ProductionSupervisorSummary> {
  const configurationStatus = getConfigurationStatus();
  const environmentReady =
    configurationStatus.supabase &&
    (configurationStatus.anthropic || configurationStatus.openai) &&
    configurationStatus.sendgrid &&
    configurationStatus.stripe;

  try {
    await productionRepository.ensureProductionSchema();
    const [leads, applications, aiTasks, approvals, reviews, matches, outreachLogs, usage] = await Promise.all([
      leadsRepository.list({ pageSize: 100 }),
      productionRepository.listBusinessApplications(500),
      productionRepository.listAiTasks(500),
      productionRepository.listApprovals(500),
      productionRepository.listUnderwritingReviews(500),
      productionRepository.listLenderMatches(500),
      productionRepository.listOutreachLogs(500),
      productionRepository.listApiUsage(500)
    ]);

    const lifecycle = summarizeLifecycle(applications);
    const emailOperations = summarizeEmailOperations(outreachLogs, configurationStatus.sendgrid);

    return {
      source: "supabase",
      migrationRequired: false,
      configurationStatus,
      environmentReady,
      applications: applications.length,
      leads: leads.total,
      qualifiedLeads: leads.data.filter((lead) => lead.status === "qualified" || lead.status === "approved" || lead.status === "funded").length,
      pendingApprovals: approvals.filter((approval) => approval.status === "pending").length,
      aiQueued: aiTasks.filter((task) => task.status === "queued").length,
      aiRunning: aiTasks.filter((task) => task.status === "running").length,
      aiCompleted: aiTasks.filter((task) => task.status === "completed").length,
      aiFailed: aiTasks.filter((task) => task.status === "failed" || task.status === "blocked").length,
      underwritingQueue: reviews.filter((review) => review.status === "queued" || review.status === "in_review" || review.status === "escalated").length,
      lenderMatches: matches.length,
      outreachLogs: outreachLogs.length,
      estimatedAiCostUsd: usage.reduce((total, item) => total + Number(item.estimated_cost_usd ?? 0), 0),
      lifecycle,
      emailOperations
    };
  } catch (error) {
    logger.warn("production_supervisor_summary_unavailable", { error });
    return {
      source: "unavailable",
      migrationRequired: true,
      configurationStatus,
      environmentReady,
      applications: 0,
      leads: 0,
      qualifiedLeads: 0,
      pendingApprovals: 0,
      aiQueued: 0,
      aiRunning: 0,
      aiCompleted: 0,
      aiFailed: 0,
      underwritingQueue: 0,
      lenderMatches: 0,
      outreachLogs: 0,
      estimatedAiCostUsd: 0,
      lifecycle: emptyLifecycle(),
      emailOperations: {
        sendgridConfigured: configurationStatus.sendgrid,
        sent: 0,
        failed: 0,
        replies: 0
      }
    };
  }
}

function summarizeLifecycle(applications: Array<{ status: string }>) {
  const lifecycle = emptyLifecycle();
  for (const application of applications) {
    const status = application.status;
    if (["raw", "new_lead", "onboarding", "draft", "submitted", "documents_pending"].includes(status)) {
      lifecycle.raw += 1;
    } else if (["ai_review", "qualified", "needs_review", "underwriting_review", "reviewing"].includes(status)) {
      lifecycle.qualified += 1;
    } else if (["reviewed", "approved"].includes(status)) {
      lifecycle.reviewed += 1;
    } else if (["submitted_to_lender", "routed"].includes(status)) {
      lifecycle.routed += 1;
    } else if (status === "funded") {
      lifecycle.funded += 1;
    } else if (["rejected", "withdrawn", "inactive"].includes(status)) {
      lifecycle.rejected += 1;
    }
  }
  return lifecycle;
}

function summarizeEmailOperations(
  outreachLogs: Array<{ status: string | null; replied_at?: string | null }>,
  sendgridConfigured: boolean
) {
  return {
    sendgridConfigured,
    sent: outreachLogs.filter((log) => ["sent", "delivered"].some((status) => (log.status ?? "").toLowerCase().includes(status))).length,
    failed: outreachLogs.filter((log) => (log.status ?? "").toLowerCase().includes("failed")).length,
    replies: outreachLogs.filter((log) => Boolean(log.replied_at)).length
  };
}

function emptyLifecycle() {
  return {
    raw: 0,
    qualified: 0,
    reviewed: 0,
    routed: 0,
    funded: 0,
    rejected: 0
  };
}
