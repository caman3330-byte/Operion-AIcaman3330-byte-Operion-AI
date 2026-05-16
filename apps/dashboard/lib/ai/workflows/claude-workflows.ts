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
  approval_required: z.boolean()
});

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
    system: `${claudeReasoningSystemPrompt} Analyze business funding fit, underwriting risk, and approval needs.`,
    user: input,
    zodSchema: fundingFitSchema
  });

  return wrap("funding_fit_analysis", result);
}

export async function reasonAboutLenderMatching(input: Json): Promise<AiWorkflowResult<z.infer<typeof lenderReasoningSchema>>> {
  const result = await runClaudeJson({
    operation: "lender_matching_reasoning",
    system: `${claudeReasoningSystemPrompt} Reason about lender fit using only provided lead and lender criteria.`,
    user: input,
    zodSchema: lenderReasoningSchema
  });

  return wrap("lender_recommendation", result);
}

export async function generateExecutiveSummary(input: Json): Promise<AiWorkflowResult<z.infer<typeof executiveSummarySchema>>> {
  const result = await runClaudeJson({
    operation: "executive_summary",
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
