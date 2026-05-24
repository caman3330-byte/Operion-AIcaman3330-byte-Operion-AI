import type { Json, BusinessApplicationStatus, CommunicationHealthSummary, LeadTemperatureSummary, LenderPerformanceSummary, WorkflowRecoverySummary } from "@operion/shared";
import { ConfigurationError, NotFoundError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { orchestrationRepository } from "@/lib/repositories/orchestration";
import { lendersRepository } from "@/lib/repositories/lenders";
import type {
  AiTaskInsert,
  AiTaskLogInsert,
  AiTaskUpdate,
  ApiUsageEventInsert,
  ApprovalStatusInsert,
  BusinessApplicationInsert,
  BusinessApplicationUpdate,
  CrmActivityInsert,
  DocumentInsert,
  DocumentUpdate,
  FundingOfferInsert,
  LeadScoreInsert,
  LenderMatchInsert,
  OutreachLogInsert,
  ProductionAuditLogInsert,
  ProfileInsert,
  ProfileUpdate,
  UnderwritingReviewInsert,
  UnderwritingReviewUpdate
} from "@/lib/supabase/types";

const PRODUCTION_MIGRATION = "packages/database/migrations/0008_production_mca_platform.sql";

export const productionRepository = {
  async ensureProductionSchema() {
    const { error } = await getSupabaseAdmin().from("business_applications").select("id").limit(1);
    if (error) throwProductionSchemaError(error);
  },

  async upsertProfile(payload: ProfileInsert) {
    const { data, error } = await getSupabaseAdmin().from("profiles").upsert(payload, { onConflict: "id" }).select("*").single();
    if (error) throwProductionSchemaError(error);
    return data;
  },

  async updateProfile(id: string, payload: ProfileUpdate) {
    const { data, error } = await getSupabaseAdmin().from("profiles").update(payload).eq("id", id).select("*").single();
    if (error || !data) throw error ?? new NotFoundError("Profile not found");
    return data;
  },

  async getProfile(userId: string) {
    const { data, error } = await getSupabaseAdmin().from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) throwProductionSchemaError(error);
    return data;
  },

  async createBusinessApplication(payload: BusinessApplicationInsert) {
    const { data, error } = await getSupabaseAdmin().from("business_applications").insert(payload).select("*").single();
    if (error) throwProductionSchemaError(error);
    return data;
  },

  async updateBusinessApplication(id: string, payload: BusinessApplicationUpdate) {
    const { data, error } = await getSupabaseAdmin().from("business_applications").update(payload).eq("id", id).select("*").single();
    if (error || !data) throw error ?? new NotFoundError("Business application not found");
    return data;
  },

  async listBusinessApplications(limit = 100) {
    const { data, error } = await getSupabaseAdmin()
      .from("business_applications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwProductionSchemaError(error);
    return data ?? [];
  },

  async listBusinessApplicationsByStatus(statuses: BusinessApplicationStatus[], limit = 100) {
    if (statuses.length === 0) return [];
    const { data, error } = await getSupabaseAdmin()
      .from("business_applications")
      .select("*")
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwProductionSchemaError(error);
    return data ?? [];
  },

  async listLenderMatchesForApplications(applicationIds: string[]) {
    if (applicationIds.length === 0) return [];
    const { data, error } = await getSupabaseAdmin()
      .from("lender_matches")
      .select("*")
      .in("business_application_id", applicationIds)
      .order("created_at", { ascending: false });
    if (error) throwProductionSchemaError(error);
    return data ?? [];
  },

  async listUnderwritingReviewsForApplications(applicationIds: string[]) {
    if (applicationIds.length === 0) return [];
    const { data, error } = await getSupabaseAdmin()
      .from("underwriting_reviews")
      .select("*")
      .in("business_application_id", applicationIds)
      .order("created_at", { ascending: false });
    if (error) throwProductionSchemaError(error);
    return data ?? [];
  },

  async listAiTasksForApplications(applicationIds: string[]) {
    if (applicationIds.length === 0) return [];
    const { data, error } = await getSupabaseAdmin()
      .from("ai_tasks")
      .select("*")
      .in("business_application_id", applicationIds)
      .order("created_at", { ascending: false });
    if (error) throwProductionSchemaError(error);
    return data ?? [];
  },

  async listCustomerApplications(userId: string) {
    const { data, error } = await getSupabaseAdmin()
      .from("business_applications")
      .select("*")
      .or(`user_id.eq.${userId},profile_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    if (error) throwProductionSchemaError(error);
    return data ?? [];
  },

  async getBusinessApplication(id: string) {
    const { data, error } = await getSupabaseAdmin().from("business_applications").select("*").eq("id", id).single();
    if (error || !data) throw error ?? new NotFoundError("Business application not found");
    return data;
  },

  async getCustomerBusinessApplication(userId: string, applicationId: string) {
    const { data, error } = await getSupabaseAdmin()
      .from("business_applications")
      .select("*")
      .eq("id", applicationId)
      .maybeSingle();
    if (error) throwProductionSchemaError(error);
    if (!data || (data.user_id !== userId && data.profile_id !== userId)) {
      throw new NotFoundError("Business application not found");
    }
    return data;
  },

  async createLeadScore(payload: LeadScoreInsert) {
    const { data, error } = await getSupabaseAdmin().from("lead_scores").insert(payload).select("*").single();
    if (error) throwProductionSchemaError(error);
    return data;
  },

  async listLeadScores(limit = 100) {
    const { data, error } = await getSupabaseAdmin().from("lead_scores").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throwProductionSchemaError(error);
    return data ?? [];
  },

  async getLeadTemperatureSummary(limit = 100): Promise<LeadTemperatureSummary> {
    const leadScores = await this.listLeadScores(limit);
    const tierCounts = leadScores.reduce(
      (acc, score) => {
        if (score.tier === "A") acc.A += 1;
        else if (score.tier === "B") acc.B += 1;
        else if (score.tier === "C") acc.C += 1;
        else if (score.tier === "D") acc.D += 1;
        else acc.unknown += 1;
        return acc;
      },
      { A: 0, B: 0, C: 0, D: 0, unknown: 0 }
    );
    const totalScores = leadScores.length;
    const averageScore = totalScores === 0 ? 0 : leadScores.reduce((sum, score) => sum + score.score, 0) / totalScores;
    const hotLeads = leadScores.filter((score) => score.score >= 75).length;
    const warmLeads = leadScores.filter((score) => score.score >= 50 && score.score < 75).length;
    const coldLeads = leadScores.filter((score) => score.score < 50).length;

    return {
      total_scores: totalScores,
      average_score: Number(averageScore.toFixed(2)),
      hot_leads: hotLeads,
      warm_leads: warmLeads,
      cold_leads: coldLeads,
      tier_counts: tierCounts
    };
  },

  async getCommunicationHealthSummary(limit = 200): Promise<CommunicationHealthSummary> {
    const { data: logs, error } = await getSupabaseAdmin()
      .from("outreach_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throwProductionSchemaError(error);
    const outreachLogs = logs ?? [];
    const normalizedStatus = (value: string | null) => (value ?? "").toLowerCase();

    const totalMessages = outreachLogs.length;
    const sent = outreachLogs.filter((log) => normalizedStatus(log.status).includes("sent") || normalizedStatus(log.status).includes("delivered")).length;
    const delivered = outreachLogs.filter((log) => normalizedStatus(log.status).includes("delivered")).length;
    const failed = outreachLogs.filter((log) => normalizedStatus(log.status).includes("failed")).length;
    const bounced = outreachLogs.filter(
      (log) => normalizedStatus(log.status).includes("bounce") || normalizedStatus(log.error_message ?? "").includes("undeliverable")
    ).length;
    const replies = outreachLogs.filter((log) => log.replied_at !== null).length;

    const responseDelays = outreachLogs
      .map((log) => ({ sent_at: log.sent_at, replied_at: log.replied_at }))
      .filter((item) => item.sent_at !== null && item.replied_at !== null)
      .map((item) => Math.max(0, Date.parse(item.replied_at!) - Date.parse(item.sent_at!)));

    const averageResponseDelayMs = responseDelays.length === 0 ? null : Math.round(responseDelays.reduce((sum, delay) => sum + delay, 0) / responseDelays.length);
    const replyRate = totalMessages === 0 ? 0 : Number(((replies / totalMessages) * 100).toFixed(2));

    return {
      total_messages: totalMessages,
      sent,
      delivered,
      failed,
      bounced,
      replies,
      reply_rate: replyRate,
      average_response_delay_ms: averageResponseDelayMs
    };
  },

  async getLenderPerformanceSummary(limit = 200): Promise<LenderPerformanceSummary> {
    const [matches, activeLenders, allLenders] = await Promise.all([
      this.listLenderMatches(limit),
      lendersRepository.list(true),
      lendersRepository.list(false)
    ]);

    const normalizedMatches = matches as Array<{ status: string; match_score: number | null; lender_id: string }>;
    const matchScoreValues = normalizedMatches.filter((match) => typeof match.match_score === "number").map((match) => match.match_score as number);
    const averageMatchScore = matchScoreValues.length === 0 ? null : Number((matchScoreValues.reduce((sum, score) => sum + score, 0) / matchScoreValues.length).toFixed(2));
    const responsiveLenderIds = new Set(normalizedMatches.filter((match) => ["recommended", "approved", "submitted", "accepted", "funded"].includes(match.status)).map((match) => match.lender_id));

    return {
      total_matches: matches.length,
      recommended: matches.filter((match) => match.status === "recommended").length,
      approved: matches.filter((match) => match.status === "approved").length,
      submitted: matches.filter((match) => match.status === "submitted").length,
      accepted: matches.filter((match) => match.status === "accepted").length,
      rejected: matches.filter((match) => match.status === "rejected").length,
      funded: matches.filter((match) => match.status === "funded").length,
      active_lenders: activeLenders.length,
      unresponsive_lenders: Math.max(0, activeLenders.length - responsiveLenderIds.size),
      average_match_score: averageMatchScore
    };
  },

  async getWorkflowRecoverySummary(): Promise<WorkflowRecoverySummary> {
    const [failedTasks, blockedTasks, queuedTasks] = await Promise.all([
      orchestrationRepository.listTasks({ status: "failed", limit: 200 }),
      orchestrationRepository.listTasks({ status: "blocked", limit: 200 }),
      orchestrationRepository.listTasks({ status: "queued", limit: 200 })
    ]);

    const retryableTasks = failedTasks.filter((task) => {
      const context = task.context && typeof task.context === "object" && !Array.isArray(task.context) ? task.context : {};
      return Number(context.runtime_attempts ?? 0) < 3;
    }).length;

    const stuckTasks = blockedTasks.filter((task) => {
      const ageMs = Date.now() - Date.parse(task.created_at);
      return ageMs > 24 * 60 * 60 * 1000;
    }).length;

    const totalTasks = failedTasks.length + blockedTasks.length + queuedTasks.length;
    const recoveryRecommended = failedTasks.length > 5 || blockedTasks.length > 5 || stuckTasks > 0;

    return {
      total_tasks: totalTasks,
      failed_tasks: failedTasks.length,
      blocked_tasks: blockedTasks.length,
      retryable_tasks: retryableTasks,
      stuck_tasks: stuckTasks,
      recovery_recommended: recoveryRecommended
    };
  },

  async createLenderMatch(payload: LenderMatchInsert) {
    const { data, error } = await getSupabaseAdmin().from("lender_matches").insert(payload).select("*").single();
    if (error) throwProductionSchemaError(error);
    return data;
  },

  async upsertLenderMatch(payload: LenderMatchInsert) {
    const { data, error } = await getSupabaseAdmin()
      .from("lender_matches")
      .upsert(payload, { onConflict: "lead_id,lender_id" })
      .select("*")
      .single();
    if (error) throwProductionSchemaError(error);
    return data;
  },

  async listLenderMatches(limit = 100) {
    const { data, error } = await getSupabaseAdmin()
      .from("lender_matches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwProductionSchemaError(error);
    return data ?? [];
  },

  async listLenders(activeOnly = false) {
    return lendersRepository.list(activeOnly);
  },

  async createOutreachLog(payload: OutreachLogInsert) {
    const { data, error } = await getSupabaseAdmin().from("outreach_logs").insert(payload).select("*").single();
    if (error) throwProductionSchemaError(error);
    return data;
  },

  async createCrmActivity(payload: CrmActivityInsert) {
    const { data, error } = await getSupabaseAdmin().from("crm_activities").insert(await normalizeCrmActivityPayload(payload)).select("*").single();
    if (error) throwProductionSchemaError(error);
    return data;
  },

  async listCrmActivitiesForApplications(applicationIds: string[]) {
    if (applicationIds.length === 0) return [];
    const idList = applicationIds.join(",");
    const { data, error } = await getSupabaseAdmin()
      .from("crm_activities")
      .select("*")
      .or(`application_id.in.(${idList}),business_application_id.in.(${idList})`)
      .order("created_at", { ascending: false });
    if (error) throwProductionSchemaError(error);
    return data ?? [];
  },

  async listOutreachLogs(limit = 100) {
    const { data, error } = await getSupabaseAdmin().from("outreach_logs").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throwProductionSchemaError(error);
    return data ?? [];
  },

  async createAiTask(payload: AiTaskInsert) {
    const { data, error } = await getSupabaseAdmin().from("ai_tasks").insert(payload).select("*").single();
    if (error) throwProductionSchemaError(error);
    return data;
  },

  async updateAiTask(id: string, payload: AiTaskUpdate) {
    const { data, error } = await getSupabaseAdmin().from("ai_tasks").update(payload).eq("id", id).select("*").single();
    if (error || !data) throw error ?? new NotFoundError("AI task not found");
    return data;
  },

  async listAiTasks(limit = 100) {
    const { data, error } = await getSupabaseAdmin().from("ai_tasks").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throwProductionSchemaError(error);
    return data ?? [];
  },

  async createAiTaskLog(payload: AiTaskLogInsert) {
    const { data, error } = await getSupabaseAdmin().from("ai_task_logs").insert(payload).select("*").single();
    if (error) throwProductionSchemaError(error);
    return data;
  },

  async createUnderwritingReview(payload: UnderwritingReviewInsert) {
    const { data, error } = await getSupabaseAdmin()
      .from("underwriting_reviews")
      .insert(await normalizeUnderwritingReviewPayload(payload))
      .select("*")
      .single();
    if (error) throwProductionSchemaError(error);
    return data;
  },

  async updateUnderwritingReview(id: string, payload: UnderwritingReviewUpdate) {
    const { data, error } = await getSupabaseAdmin().from("underwriting_reviews").update(payload).eq("id", id).select("*").single();
    if (error || !data) throw error ?? new NotFoundError("Underwriting review not found");
    return data;
  },

  async listUnderwritingReviews(limit = 100) {
    const { data, error } = await getSupabaseAdmin()
      .from("underwriting_reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwProductionSchemaError(error);
    return data ?? [];
  },

  async createDocument(payload: DocumentInsert) {
    const { data, error } = await getSupabaseAdmin().from("documents").insert(payload).select("*").single();
    if (error) throwProductionSchemaError(error);
    return data;
  },

  async getDocument(id: string) {
    const { data, error } = await getSupabaseAdmin().from("documents").select("*").eq("id", id).single();
    if (error || !data) throw error ?? new NotFoundError("Document not found");
    return data;
  },

  async getDocumentByType(businessApplicationId: string, documentType: string) {
    const { data, error } = await getSupabaseAdmin()
      .from("documents")
      .select("*")
      .eq("business_application_id", businessApplicationId)
      .eq("document_type", documentType)
      .limit(1)
      .maybeSingle();
    if (error) throwProductionSchemaError(error);
    return data;
  },

  async updateDocument(id: string, payload: DocumentUpdate) {
    const { data, error } = await getSupabaseAdmin().from("documents").update(payload).eq("id", id).select("*").single();
    if (error || !data) throw error ?? new NotFoundError("Document not found");
    return data;
  },

  async listDocumentsForApplication(businessApplicationId: string) {
    const { data, error } = await getSupabaseAdmin()
      .from("documents")
      .select("*")
      .eq("business_application_id", businessApplicationId)
      .order("created_at", { ascending: false });
    if (error) throwProductionSchemaError(error);
    return data ?? [];
  },

  async listCustomerDocuments(userId: string) {
    const { data, error } = await getSupabaseAdmin()
      .from("documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throwProductionSchemaError(error);
    return data ?? [];
  },

  async createFundingOffer(payload: FundingOfferInsert) {
    const { data, error } = await getSupabaseAdmin().from("funding_offers").insert(payload).select("*").single();
    if (error) throwProductionSchemaError(error);
    return data;
  },

  async listFundingOffers(limit = 100) {
    const { data, error } = await getSupabaseAdmin().from("funding_offers").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throwProductionSchemaError(error);
    return data ?? [];
  },

  async listCustomerFundingOffers(applicationIds: string[]) {
    if (applicationIds.length === 0) return [];
    const { data, error } = await getSupabaseAdmin()
      .from("funding_offers")
      .select("*")
      .in("business_application_id", applicationIds)
      .order("created_at", { ascending: false });
    if (error) throwProductionSchemaError(error);
    return data ?? [];
  },

  async createApproval(payload: ApprovalStatusInsert) {
    const { data, error } = await getSupabaseAdmin().from("approval_statuses").insert(payload).select("*").single();
    if (error) throwProductionSchemaError(error);
    return data;
  },

  async listApprovals(limit = 100) {
    const { data, error } = await getSupabaseAdmin()
      .from("approval_statuses")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwProductionSchemaError(error);
    return data ?? [];
  },

  async createAuditLog(payload: ProductionAuditLogInsert) {
    const { data, error } = await getSupabaseAdmin().from("audit_logs").insert(payload).select("*").single();
    if (error) throwProductionSchemaError(error);
    return data;
  },

  async createApiUsageLog(payload: ApiUsageEventInsert) {
    const { data, error } = await getSupabaseAdmin().from("api_usage_logs").insert(payload).select("*").single();
    if (error) throwProductionSchemaError(error);
    return data;
  },

  async listApiUsage(limit = 100) {
    const { data, error } = await getSupabaseAdmin()
      .from("api_usage_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwProductionSchemaError(error);
    return data ?? [];
  }
};

export function isProductionSchemaMissing(error: unknown) {
  return error instanceof ConfigurationError && error.message.includes("0008");
}

export function throwProductionSchemaError(error: { code?: string; message?: string }): never {
  const message = error.message ?? "";
  if (isMissingProductionRelationError(error)) {
    throw new ConfigurationError("Production MCA platform migration 0008 has not been applied to Supabase", {
      migration: PRODUCTION_MIGRATION,
      prerequisite: "packages/database/migrations/0007_platform_separation_fintech_schema.sql",
      originalError: {
        code: error.code,
        message
      }
    });
  }

  throw error;
}

function isMissingProductionRelationError(error: { code?: string; message?: string }) {
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("relation") && message.includes("does not exist") ||
    message.includes("schema cache") && message.includes("could not find")
  );
}

async function normalizeCrmActivityPayload(payload: CrmActivityInsert): Promise<CrmActivityInsert> {
  const businessApplicationId = await resolveBusinessApplicationId(payload.application_id ?? null, payload.business_application_id ?? null);
  if (!businessApplicationId) return payload;

  return {
    ...payload,
    application_id: payload.application_id && payload.application_id !== businessApplicationId ? payload.application_id : null,
    business_application_id: businessApplicationId
  };
}

async function normalizeUnderwritingReviewPayload(payload: UnderwritingReviewInsert): Promise<UnderwritingReviewInsert> {
  const businessApplicationId = await resolveBusinessApplicationId(payload.application_id ?? null, payload.business_application_id ?? null);
  if (!businessApplicationId) return payload;

  return {
    ...payload,
    application_id: payload.application_id && payload.application_id !== businessApplicationId ? payload.application_id : null,
    business_application_id: businessApplicationId
  };
}

async function resolveBusinessApplicationId(legacyApplicationId: string | null, businessApplicationId: string | null) {
  if (businessApplicationId) return businessApplicationId;
  if (!legacyApplicationId) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("business_applications")
    .select("id")
    .eq("id", legacyApplicationId)
    .maybeSingle();

  if (error) throwProductionSchemaError(error);
  return data?.id ?? null;
}

export function asJson(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}
