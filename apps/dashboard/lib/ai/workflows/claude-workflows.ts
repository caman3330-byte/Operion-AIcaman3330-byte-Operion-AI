import { z } from "zod";
import type { Json } from "@operion/shared";
import { runClaudeJson } from "@/lib/ai/claude";
import { claudeReasoningSystemPrompt } from "@/lib/ai/prompts/operion-prompts";
import type { AiWorkflowResult } from "@/lib/ai/types";

const fundingFitSchema = z.object({
  score: z.number().int().min(0).max(100),
  decision: z.enum(["qualified", "review_required", "declined"]),
  tier: z.enum(["A", "B", "C", "D"]),
  funding_fit: z.enum(["strong", "moderate", "weak"]),
  industry_risk: z.enum(["low", "medium", "high"]),
  underwriting_summary: z.string(),
  internal_notes: z.string(),
  missing_information: z.array(z.string()),
  approval_required: z.boolean(),
  revenue_trend: z.enum(["increasing", "stable", "decreasing", "volatile", "unknown"]),
  nsf_alerts: z.number().int().min(0),
  mca_stacking_risk: z.enum(["low", "medium", "high", "critical"]),
  estimated_approval_probability: z.number().min(0).max(100),
  statement_insights: z.array(z.string())
});
const looseClaudeObjectSchema = z.record(z.unknown());

const executiveSummarySchema = z.object({
  summary: z.string(),
  kpis: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  alerts: z.array(z.string()),
  approvals_required: z.array(z.string()),
  next_actions: z.array(z.string())
});

const lenderReasoningSchema = z.object({
  routing_summary: z.string(),
  recommendations: z.array(
    z.object({
      lender_id: z.string().nullable(),
      lender_name: z.string(),
      match_score: z.number().int().min(0).max(100),
      rationale: z.string(),
      risks: z.array(z.string())
    })
  ),
  approval_required: z.boolean()
});

export async function analyzeFundingFit(input: Json): Promise<AiWorkflowResult<z.infer<typeof fundingFitSchema>>> {
  const result = await runClaudeJson({
    operation: "funding_fit_analysis",
    modelTier: "premium",
    system: `${claudeReasoningSystemPrompt} Analyze business funding fit, underwriting risk, and approval needs. Return one flat JSON object with exactly these keys: score, decision, tier, funding_fit, industry_risk, underwriting_summary, internal_notes, missing_information, approval_required, revenue_trend, nsf_alerts, mca_stacking_risk, estimated_approval_probability, statement_insights.`,
    user: input,
    zodSchema: looseClaudeObjectSchema
  });
  const data = fundingFitSchema.parse(normalizeFundingFitPayload(result.data));

  return wrap("funding_fit_analysis", { ...result, data });
}

export async function reasonAboutLenderMatching(input: Json): Promise<AiWorkflowResult<z.infer<typeof lenderReasoningSchema>>> {
  const result = await runClaudeJson({
    operation: "lender_matching_reasoning",
    modelTier: "premium",
    system: `${claudeReasoningSystemPrompt} Reason about lender fit using only provided lead and lender criteria.`,
    user: input,
    zodSchema: lenderReasoningSchema
  });

  return wrap("lender_recommendation", result);
}

export async function generateExecutiveSummary(input: Json): Promise<AiWorkflowResult<z.infer<typeof executiveSummarySchema>>> {
  const result = await runClaudeJson({
    operation: "executive_summary",
    modelTier: "default",
    system: `${claudeReasoningSystemPrompt} Produce founder-facing operational summaries, alerts, KPIs, approvals, and next actions.`,
    user: input,
    zodSchema: executiveSummarySchema
  });

  return wrap("executive_summary", result);
}

function wrap<T>(workflow: AiWorkflowResult<T>["workflow"], result: { data: T; usage: AiWorkflowResult<T>["usage"]; raw: unknown }) {
  return {
    workflow,
    provider: "claude" as const,
    data: result.data,
    usage: result.usage,
    raw: result.raw as Json
  };
}

function normalizeFundingFitPayload(payload: Record<string, unknown>) {
  const direct = fundingFitSchema.safeParse(payload);
  if (direct.success) return direct.data;

  const qualification = asRecord(payload.qualification_result);
  const industry = asRecord(payload.industry_assessment);
  const deposit = asRecord(payload.deposit_volume_assessment);
  const risk = asRecord(payload.risk_assessment ?? payload.risk_profile);
  const documents = asRecord(payload.documentation_requirements ?? payload.missing_information);

  const rawScore = numberFrom(payload.score) ?? numberFrom(payload.qualification_score) ?? numberFrom(qualification.confidence_score);
  const score = Math.max(0, Math.min(100, rawScore === null ? 55 : rawScore <= 1 ? Math.round(rawScore * 100) : Math.round(rawScore)));
  const decision = normalizeDecision(payload.decision ?? qualification.overall_status ?? qualification.recommendation);
  const industryRisk = normalizeIndustryRisk(payload.industry_risk ?? industry.industry_risk ?? industry.risk_level ?? industry.industry_risk_flag ?? risk.industry_risk);
  const underwritingSummary = stringFrom(payload.underwriting_summary)
    ?? stringFrom(payload.summary)
    ?? stringFrom(qualification.recommendation)
    ?? "AI underwriting review completed. Additional documentation should be reviewed before lender submission.";
  const internalNotes = [
    stringFrom(payload.internal_notes),
    stringFrom(industry.mca_friendliness) ? `Industry fit: ${stringFrom(industry.mca_friendliness)}` : null,
    stringFrom(deposit.deposit_adequacy_for_request) ? `Deposit adequacy: ${stringFrom(deposit.deposit_adequacy_for_request)}` : null,
    ...stringArrayFrom(industry.notes)
  ].filter((item): item is string => Boolean(item)).join(" ");

  return {
    score,
    decision,
    tier: normalizeTier(payload.tier, score),
    funding_fit: normalizeFundingFit(payload.funding_fit ?? deposit.deposit_adequacy_for_request, score),
    industry_risk: industryRisk,
    underwriting_summary: underwritingSummary,
    internal_notes: internalNotes || underwritingSummary,
    missing_information: stringArrayFrom(payload.missing_information).length > 0
      ? stringArrayFrom(payload.missing_information)
      : stringArrayFrom(documents.required_documents).length > 0
        ? stringArrayFrom(documents.required_documents)
        : ["bank_statements", "government_id", "business_bank_account"],
    approval_required: booleanFrom(payload.approval_required) ?? decision !== "qualified",
    revenue_trend: normalizeRevenueTrend(payload.revenue_trend),
    nsf_alerts: numberFrom(payload.nsf_alerts) ?? 0,
    mca_stacking_risk: normalizeStackingRisk(payload.mca_stacking_risk ?? risk.mca_stacking_risk, industryRisk),
    estimated_approval_probability: numberFrom(payload.estimated_approval_probability) ?? score,
    statement_insights: stringArrayFrom(payload.statement_insights).length > 0
      ? stringArrayFrom(payload.statement_insights)
      : [
          stringFrom(deposit.deposit_adequacy_for_request) ? `Deposit adequacy: ${stringFrom(deposit.deposit_adequacy_for_request)}` : null,
          numberFrom(deposit.monthly_deposits_reported) !== null ? `Reported monthly deposits: ${numberFrom(deposit.monthly_deposits_reported)}` : null
        ].filter((item): item is string => Boolean(item))
  };
}

function normalizeDecision(value: unknown): "qualified" | "review_required" | "declined" {
  const normalized = stringFrom(value)?.toLowerCase() ?? "";
  if (normalized.includes("declin") || normalized.includes("reject") || normalized.includes("pass")) return "declined";
  if (normalized.includes("qualified") || normalized.includes("approve") || normalized.includes("proceed")) return "qualified";
  return "review_required";
}

function normalizeTier(value: unknown, score: number): "A" | "B" | "C" | "D" {
  const normalized = stringFrom(value)?.toUpperCase();
  if (normalized === "A" || normalized === "B" || normalized === "C" || normalized === "D") return normalized;
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 45) return "C";
  return "D";
}

function normalizeFundingFit(value: unknown, score: number): "strong" | "moderate" | "weak" {
  const normalized = stringFrom(value)?.toLowerCase() ?? "";
  if (normalized.includes("strong") || normalized.includes("high")) return "strong";
  if (normalized.includes("weak") || normalized.includes("marginal") || normalized.includes("low")) return score >= 55 ? "moderate" : "weak";
  return score >= 75 ? "strong" : score >= 45 ? "moderate" : "weak";
}

function normalizeIndustryRisk(value: unknown): "low" | "medium" | "high" {
  if (typeof value === "boolean") return value ? "high" : "medium";
  const normalized = stringFrom(value)?.toLowerCase() ?? "";
  if (normalized.includes("high") || normalized.includes("critical")) return "high";
  if (normalized.includes("low")) return "low";
  return "medium";
}

function normalizeRevenueTrend(value: unknown): "increasing" | "stable" | "decreasing" | "volatile" | "unknown" {
  const normalized = stringFrom(value)?.toLowerCase();
  if (normalized === "increasing" || normalized === "stable" || normalized === "decreasing" || normalized === "volatile") return normalized;
  return "unknown";
}

function normalizeStackingRisk(value: unknown, industryRisk: "low" | "medium" | "high"): "low" | "medium" | "high" | "critical" {
  const normalized = stringFrom(value)?.toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "critical") return normalized;
  return industryRisk === "high" ? "high" : "medium";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringFrom(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberFrom(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function booleanFrom(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function stringArrayFrom(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}
