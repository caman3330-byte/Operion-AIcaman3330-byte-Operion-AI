import { logger } from "@/lib/logger";
import { getConfigurationStatus } from "@/lib/env";
import { leadsRepository } from "@/lib/repositories/leads";
import { productionRepository } from "@/lib/repositories/production";
import { cachedFor } from "@/lib/runtime/ttl-cache";

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
  operationalMetrics: {
    leadsGeneratedToday: number;
    outreachSentToday: number;
    lendersContacted: number;
    applicationsReceivedToday: number;
    uploadsPending: number;
    documentsUploaded: number;
    uploadCompletionRate: number;
    leadConversionRate: number;
    lenderResponseRate: number;
    oldestAiQueuedAgeHours: number | null;
    oldestAiRetryAgeHours: number | null;
    documentProcessingBlocked: number;
    leadQualificationBlocked: number;
    leadQualificationQueued: number;
  };
}

export async function getProductionSupervisorSummary(): Promise<ProductionSupervisorSummary> {
  return cachedFor("production-supervisor-summary", 20_000, loadProductionSupervisorSummary);
}

async function loadProductionSupervisorSummary(): Promise<ProductionSupervisorSummary> {
  const configurationStatus = getConfigurationStatus();
  const environmentReady =
    configurationStatus.supabase &&
    (configurationStatus.anthropic || configurationStatus.openai) &&
    configurationStatus.sendgrid &&
    configurationStatus.stripe;

  try {
    await productionRepository.ensureProductionSchema();
    const [leads, applications, aiTasks, approvals, reviews, matches, outreachLogs, usage, documents] = await Promise.all([
      leadsRepository.list({ pageSize: 100 }),
      productionRepository.listBusinessApplications(500),
      productionRepository.listAiTasks(300),
      productionRepository.listApprovals(300),
      productionRepository.listUnderwritingReviews(300),
      productionRepository.listLenderMatches(300),
      productionRepository.listOutreachLogs(300),
      productionRepository.listApiUsage(200),
      productionRepository.listDocuments(300)
    ]);

    const lifecycle = summarizeLifecycle(applications);
    const emailOperations = summarizeEmailOperations(outreachLogs, configurationStatus.sendgrid);
    const operationalMetrics = summarizeOperationalMetrics({ leads: leads.data, applications, aiTasks, outreachLogs, matches, documents });

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
      emailOperations,
      operationalMetrics
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
      },
      operationalMetrics: {
        leadsGeneratedToday: 0,
        outreachSentToday: 0,
        lendersContacted: 0,
        applicationsReceivedToday: 0,
        uploadsPending: 0,
        documentsUploaded: 0,
        uploadCompletionRate: 0,
        leadConversionRate: 0,
        lenderResponseRate: 0,
        oldestAiQueuedAgeHours: null,
        oldestAiRetryAgeHours: null,
        documentProcessingBlocked: 0,
        leadQualificationBlocked: 0,
        leadQualificationQueued: 0
      }
    };
  }
}

function summarizeOperationalMetrics(input: {
  leads: Array<{ created_at?: string | null }>;
  applications: Array<{ created_at?: string | null; updated_at?: string | null; submitted_at?: string | null; status: string }>;
  aiTasks: Array<{ status: string; task_type?: string | null; created_at?: string | null; updated_at?: string | null; attempts?: number | null }>;
  outreachLogs: Array<{ status: string | null; sent_at?: string | null; replied_at?: string | null; lender_id?: string | null }>;
  matches: Array<{ lender_id: string | null; status: string }>;
  documents: Array<{ status: string; uploaded_at?: string | null }>;
}) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayMs = startOfDay.getTime();
  const isToday = (value?: string | null) => Boolean(value && Date.parse(value) >= todayMs);
  const sentLogs = input.outreachLogs.filter((log) => ["sent", "delivered"].some((status) => (log.status ?? "").toLowerCase().includes(status)));
  const uploadedDocuments = input.documents.filter((document) => document.status === "uploaded" || Boolean(document.uploaded_at));
  const requestedDocuments = input.documents.filter((document) => document.status === "requested");
  const uniqueLenders = new Set(input.matches.map((match) => match.lender_id).filter(Boolean));
  const conversionBase = input.leads.length === 0 ? 0 : input.applications.length / input.leads.length;
  const lenderResponseBase = input.matches.length === 0 ? 0 : input.matches.filter((match) => ["approved", "submitted", "accepted", "funded", "rejected"].includes(match.status)).length / input.matches.length;
  const blockedAiTasks = input.aiTasks.filter((task) => task.status === "blocked" || task.status === "failed");

  return {
    leadsGeneratedToday: input.leads.filter((lead) => isToday(lead.created_at)).length,
    outreachSentToday: sentLogs.filter((log) => isToday(log.sent_at)).length,
    lendersContacted: uniqueLenders.size,
    applicationsReceivedToday: input.applications.filter((application) => isToday(application.submitted_at ?? application.created_at)).length,
    uploadsPending: requestedDocuments.length,
    documentsUploaded: uploadedDocuments.length,
    uploadCompletionRate: input.documents.length === 0 ? 0 : Number(((uploadedDocuments.length / input.documents.length) * 100).toFixed(1)),
    leadConversionRate: Number((conversionBase * 100).toFixed(1)),
    lenderResponseRate: Number((lenderResponseBase * 100).toFixed(1)),
    oldestAiQueuedAgeHours: oldestAgeHours(
      input.aiTasks
        .filter((task) => task.status === "queued")
        .map((task) => task.updated_at ?? task.created_at ?? null)
    ),
    oldestAiRetryAgeHours: oldestAgeHours(
      input.aiTasks
        .filter((task) => task.status === "queued" && Number(task.attempts ?? 0) > 0)
        .map((task) => task.updated_at ?? task.created_at ?? null)
    ),
    documentProcessingBlocked: blockedAiTasks.filter((task) => task.task_type === "document_processing").length,
    leadQualificationBlocked: blockedAiTasks.filter((task) => task.task_type === "lead_qualification").length,
    leadQualificationQueued: input.aiTasks.filter((task) => task.status === "queued" && task.task_type === "lead_qualification").length
  };
}

function oldestAgeHours(values: Array<string | null | undefined>) {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  if (timestamps.length === 0) return null;
  return Number(((Date.now() - Math.min(...timestamps)) / 3600000).toFixed(2));
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
