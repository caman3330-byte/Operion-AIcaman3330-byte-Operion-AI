import type { Json } from "@operion/shared";
import { ConfigurationError, NotFoundError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type {
  AiTaskInsert,
  AiTaskLogInsert,
  AiTaskUpdate,
  ApiUsageEventInsert,
  ApprovalStatusInsert,
  BusinessApplicationInsert,
  BusinessApplicationUpdate,
  DocumentInsert,
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

  async createOutreachLog(payload: OutreachLogInsert) {
    const { data, error } = await getSupabaseAdmin().from("outreach_logs").insert(payload).select("*").single();
    if (error) throwProductionSchemaError(error);
    return data;
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
    const { data, error } = await getSupabaseAdmin().from("underwriting_reviews").insert(payload).select("*").single();
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
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    [
      "profiles",
      "business_applications",
      "lead_scores",
      "lender_matches",
      "ai_tasks",
      "ai_task_logs",
      "documents",
      "funding_offers",
      "approval_statuses",
      "audit_logs",
      "api_usage_logs"
    ].some((table) => message.includes(table))
  ) {
    throw new ConfigurationError("Production MCA platform migration 0008 has not been applied to Supabase", {
      migration: PRODUCTION_MIGRATION,
      prerequisite: "packages/database/migrations/0007_platform_separation_fintech_schema.sql"
    });
  }

  throw error;
}

export function asJson(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}
