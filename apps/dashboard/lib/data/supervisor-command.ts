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
      estimatedAiCostUsd: usage.reduce((total, item) => total + Number(item.estimated_cost_usd ?? 0), 0)
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
      estimatedAiCostUsd: 0
    };
  }
}
