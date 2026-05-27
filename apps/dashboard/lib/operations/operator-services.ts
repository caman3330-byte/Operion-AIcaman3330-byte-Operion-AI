import type { AiTaskStatus, BusinessApplication, LenderMatchStatus } from "@operion/shared";
import { getOperationsAnalyticsSnapshot } from "../analytics/service";
import { getFundingPipelineSnapshot } from "../crm/lifecycle";
import { buildLenderDistributionPlan, type DistributionMerchantProfile } from "../lenders/distribution";
import type { OperationalBusinessApplication } from "../operator-dashboard/types";
import { getSupabaseAdmin } from "../supabase/server";

export interface OperatorListOptions {
  limit: number;
  offset: number;
  status?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export interface PaginatedOperationalResult<T> {
  items: T[];
  pagination: {
    limit: number;
    offset: number;
    returned: number;
    nextOffset: number | null;
  };
  error?: string;
}

export async function getUnderwritingQueue(options: Partial<OperatorListOptions> = {}): Promise<PaginatedOperationalResult<OperationalBusinessApplication>> {
  const normalized = normalizeOptions(options);
  const supabase = await getSupabaseAdmin();
  let query = supabase
    .from("business_applications")
    .select("id,business_name,industry,status,requested_amount,monthly_deposits,metadata,updated_at,created_at")
    .in("status", ["ai_review", "underwriting_review", "reviewing", "needs_review"])
    .order("updated_at", { ascending: true })
    .range(normalized.offset, normalized.offset + normalized.limit - 1);

  if (normalized.from) query = query.gte("updated_at", normalized.from);
  if (normalized.to) query = query.lte("updated_at", normalized.to);
  const { data, error } = await query;

  if (error) return paginated([], normalized, error.message);
  return paginated(data ?? [], normalized);
}

export async function getIntakeReviewQueue(options: Partial<OperatorListOptions> = {}): Promise<PaginatedOperationalResult<OperationalBusinessApplication>> {
  const normalized = normalizeOptions(options);
  const supabase = await getSupabaseAdmin();
  let query = supabase
    .from("business_applications")
    .select("id,business_name,industry,status,requested_amount,monthly_deposits,metadata,updated_at,created_at,submitted_at")
    .in("status", ["submitted", "documents_pending", "new_lead", "onboarding"])
    .order("created_at", { ascending: false })
    .range(normalized.offset, normalized.offset + normalized.limit - 1);

  if (normalized.from) query = query.gte("created_at", normalized.from);
  if (normalized.to) query = query.lte("created_at", normalized.to);
  const { data, error } = await query;

  if (error) return paginated([], normalized, error.message);
  return paginated(data ?? [], normalized);
}

export async function getStaleLeadQueue(options: Partial<OperatorListOptions> & { staleThresholdHours?: number } = {}) {
  const normalized = normalizeOptions(options);
  const threshold = options.staleThresholdHours ?? 72;
  const supabase = await getSupabaseAdmin();
  const cutoff = new Date(Date.now() - threshold * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from("business_applications")
    .select("id,business_name,industry,status,requested_amount,monthly_deposits,metadata,updated_at,created_at,submitted_at")
    .lt("updated_at", cutoff)
    .not("status", "in", "(funded,rejected,withdrawn,inactive)")
    .order("updated_at", { ascending: true })
    .range(normalized.offset, normalized.offset + normalized.limit - 1);

  const applicationStatus = businessApplicationStatus(normalized.status);
  if (applicationStatus) query = query.eq("status", applicationStatus);
  const { data, error } = await query;

  if (error) return paginated([], normalized, error.message);
  return paginated(data ?? [], normalized);
}

export async function getAiExecutionReviewFeed(options: Partial<OperatorListOptions> = {}) {
  const normalized = normalizeOptions(options);
  const supabase = await getSupabaseAdmin();
  let query = supabase
    .from("ai_task_logs")
    .select("id,ai_task_id,status,message,provider,model,input_tokens,output_tokens,latency_ms,cost_estimate_usd,metadata,created_at")
    .order("created_at", { ascending: false })
    .range(normalized.offset, normalized.offset + normalized.limit - 1);

  const aiStatus = aiTaskStatus(normalized.status);
  if (aiStatus) query = query.eq("status", aiStatus);
  if (normalized.from) query = query.gte("created_at", normalized.from);
  if (normalized.to) query = query.lte("created_at", normalized.to);
  const { data, error } = await query;

  if (error) return paginated([], normalized, error.message);
  return paginated(data ?? [], normalized);
}

export async function getLenderRoutingExecutionFeed(options: Partial<OperatorListOptions> = {}) {
  const normalized = normalizeOptions(options);
  const supabase = await getSupabaseAdmin();
  let query = supabase
    .from("lender_matches")
    .select("id,lead_id,business_application_id,lender_id,match_score,status,criteria_snapshot,decision_at,submitted_at,commission_estimate,notes,created_at")
    .order("created_at", { ascending: false })
    .range(normalized.offset, normalized.offset + normalized.limit - 1);

  const lenderStatus = lenderMatchStatus(normalized.status);
  if (lenderStatus) query = query.eq("status", lenderStatus);
  if (normalized.from) query = query.gte("created_at", normalized.from);
  if (normalized.to) query = query.lte("created_at", normalized.to);
  const { data, error } = await query;

  if (error) return paginated([], normalized, error.message);
  return paginated(data ?? [], normalized);
}

export async function getWorkflowRetryMetrics(options: Partial<OperatorListOptions> = {}) {
  const normalized = normalizeOptions(options);
  const supabase = await getSupabaseAdmin();
  let query = supabase
    .from("workflow_execution_traces")
    .select("workflow_key,step_key,status,attempt,latency_ms,error_message,created_at")
    .order("created_at", { ascending: false })
    .range(normalized.offset, normalized.offset + normalized.limit - 1);

  if (normalized.from) query = query.gte("created_at", normalized.from);
  if (normalized.to) query = query.lte("created_at", normalized.to);
  const { data, error } = await query;

  if (error) return { metrics: null, error: error.message };
  const traces = data ?? [];
  return {
    metrics: {
      traces,
      retryCount: traces.filter((trace) => trace.status === "retried" || trace.step_key.includes("retry")).length,
      failureCount: traces.filter((trace) => trace.status === "failed" || trace.error_message).length,
      averageLatencyMs: average(traces.map((trace) => trace.latency_ms).filter((value): value is number => typeof value === "number")),
      oldestTraceAgeHours: oldestAgeHours(traces.map((trace) => trace.created_at)),
      oldestRetryAgeHours: oldestAgeHours(
        traces
          .filter((trace) => trace.status === "retried" || trace.step_key.includes("retry"))
          .map((trace) => trace.created_at)
      ),
      byWorkflow: countBy(traces, (trace) => trace.workflow_key)
    }
  };
}

export async function getOperatorExecutionDashboard(input: {
  staleThresholdHours: number;
  limit: number;
}) {
  const [underwritingQueue, intakeReviewQueue, staleLeads, analytics] = await Promise.all([
    getUnderwritingQueue({ limit: input.limit }),
    getIntakeReviewQueue({ limit: input.limit }),
    getStaleLeadQueue({ staleThresholdHours: input.staleThresholdHours, limit: input.limit }),
    getOperationsAnalyticsSnapshot()
  ]);

  return {
    underwritingQueue,
    intakeReviewQueue,
    staleLeads,
    analytics
  };
}

function normalizeOptions(options: Partial<OperatorListOptions>): OperatorListOptions {
  return {
    limit: Math.min(Math.max(options.limit ?? 100, 1), 200),
    offset: Math.max(options.offset ?? 0, 0),
    ...(options.status ? { status: options.status } : {}),
    ...(options.from ? { from: options.from } : {}),
    ...(options.to ? { to: options.to } : {})
  };
}

function paginated<T>(items: T[], options: OperatorListOptions, error?: string): PaginatedOperationalResult<T> {
  return {
    items,
    pagination: {
      limit: options.limit,
      offset: options.offset,
      returned: items.length,
      nextOffset: items.length === options.limit ? options.offset + options.limit : null
    },
    ...(error ? { error } : {})
  };
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function average(values: number[]) {
  return values.length > 0 ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null;
}

function oldestAgeHours(values: string[]) {
  if (values.length === 0) return null;
  const oldest = Math.min(...values.map((value) => Date.parse(value)).filter(Number.isFinite));
  if (!Number.isFinite(oldest)) return null;
  return Number(((Date.now() - oldest) / 3600000).toFixed(2));
}

function aiTaskStatus(value: string | undefined): AiTaskStatus | null {
  const allowed: AiTaskStatus[] = ["queued", "running", "completed", "failed", "blocked"];
  return value && allowed.includes(value as AiTaskStatus) ? value as AiTaskStatus : null;
}

function lenderMatchStatus(value: string | undefined): LenderMatchStatus | null {
  const allowed: LenderMatchStatus[] = ["recommended", "approved", "submitted", "accepted", "rejected", "funded"];
  return value && allowed.includes(value as LenderMatchStatus) ? value as LenderMatchStatus : null;
}

function businessApplicationStatus(value: string | undefined): BusinessApplication["status"] | null {
  const allowed: Array<BusinessApplication["status"]> = [
    "raw",
    "new_lead",
    "onboarding",
    "draft",
    "submitted",
    "documents_pending",
    "ai_review",
    "qualified",
    "needs_review",
    "underwriting_review",
    "reviewing",
    "reviewed",
    "submitted_to_lender",
    "routed",
    "approved",
    "funded",
    "rejected",
    "inactive",
    "withdrawn"
  ];
  return value && allowed.includes(value as BusinessApplication["status"]) ? value as BusinessApplication["status"] : null;
}

export async function getApplicationFundingSnapshot(applicationId: string) {
  return getFundingPipelineSnapshot(applicationId);
}

export async function executeOperatorLenderRouting(merchant: DistributionMerchantProfile) {
  return buildLenderDistributionPlan({ merchant });
}

export function mapApplicationToDistributionMerchant(application: BusinessApplication): DistributionMerchantProfile {
  return {
    businessApplicationId: application.id,
    ...(application.lead_id ? { leadId: application.lead_id } : {}),
    state: application.state ?? "NA",
    industry: application.industry,
    requestedAmount: application.requested_amount
  };
}
