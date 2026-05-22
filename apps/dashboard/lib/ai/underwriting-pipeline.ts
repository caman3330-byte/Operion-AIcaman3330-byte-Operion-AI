import type { Json } from "@operion/shared";
import { logger } from "../logger";
import { getSupabaseAdmin } from "../supabase/server";
import { generateUnderwritingFoundationSummary } from "../underwriting/summary";
import type { UnderwritingProfile } from "../underwriting/types";
import { logAIAction } from "./action-logger";
import { routeAiWorkflow } from "./router";
import {
  AiFraudDetectionOutputSchema,
  AiLenderRoutingOutputSchema,
  AiOperationalInsightOutputSchema,
  AiUnderwritingOutputSchema,
  type AiFraudDetectionOutput,
  type AiLenderRoutingOutput,
  type AiOperationalInsightOutput,
  type AiUnderwritingOutput
} from "./underwriting-schemas";

export interface AiUnderwritingExecutionInput {
  businessApplicationId: string;
  profile: UnderwritingProfile;
  lenderContext?: Json;
  fraudContext?: Json;
  requestedBy?: string;
}

export interface AiUnderwritingExecutionResult {
  success: boolean;
  aiTaskId?: string;
  underwriting?: AiUnderwritingOutput;
  lenderRouting?: AiLenderRoutingOutput;
  fraud?: AiFraudDetectionOutput;
  operationalInsight?: AiOperationalInsightOutput;
  confidenceScore: number;
  error?: string;
}

export async function executeAiUnderwritingPipeline(
  input: AiUnderwritingExecutionInput
): Promise<AiUnderwritingExecutionResult> {
  const startedAt = Date.now();
  const supabase = await getSupabaseAdmin();
  const deterministicSummary = generateUnderwritingFoundationSummary(input.profile);

  const { data: task, error: taskError } = await supabase
    .from("ai_tasks")
    .insert({
      task_type: "underwriting_summary",
      status: "running",
      priority: deterministicSummary.riskTier === "critical" ? "urgent" : "normal",
      business_application_id: input.businessApplicationId,
      assigned_agent: "ai_underwriting_pipeline",
      input_payload: {
        profile: input.profile as unknown as Json,
        deterministicSummary: deterministicSummary as unknown as Json,
        lenderContext: input.lenderContext ?? null,
        fraudContext: input.fraudContext ?? null
      },
      created_by: input.requestedBy
    })
    .select("*")
    .single();

  if (taskError) {
    logger.error("Failed to create AI underwriting task", { error: taskError.message });
    return { success: false, confidenceScore: 0, error: taskError.message };
  }

  try {
    const underwritingResponse = await routeAiWorkflow({
      workflow: "underwriting_summary",
      input: {
        profile: input.profile as unknown as Json,
        deterministicSummary: deterministicSummary as unknown as Json
      }
    });
    const underwriting = AiUnderwritingOutputSchema.parse(underwritingResponse.data);

    const lenderResponse = await routeAiWorkflow({
      workflow: "lender_recommendation",
      input: {
        profile: input.profile as unknown as Json,
        underwriting: underwriting as unknown as Json,
        lenderContext: input.lenderContext ?? null
      }
    });
    const lenderRouting = AiLenderRoutingOutputSchema.parse(lenderResponse.data);

    const fraud = AiFraudDetectionOutputSchema.parse({
      fraudRisk: deterministicSummary.riskTier,
      indicators: [...deterministicSummary.risks, ...(Array.isArray(input.fraudContext) ? [] : [])],
      recommendedActions: deterministicSummary.riskTier === "critical" ? ["Escalate for senior review"] : ["Continue standard verification"],
      confidence: Math.min(0.92, Math.max(0.35, underwriting.confidence - 0.05))
    });

    const operationalInsight = AiOperationalInsightOutputSchema.parse({
      priority: deterministicSummary.riskTier === "critical" ? "critical" : deterministicSummary.riskTier === "high" ? "high" : "medium",
      insight: deterministicSummary.summary,
      affectedWorkflow: "underwriting",
      recommendedAction: underwriting.manualReviewRequired ? "Route to manual underwriting review" : "Proceed to lender compatibility review",
      confidence: underwriting.confidence
    });

    const confidenceScore = calculateAiConfidenceScore({
      underwritingConfidence: underwriting.confidence,
      routingConfidence: lenderRouting.routingConfidence,
      deterministicScore: deterministicSummary.qualificationScore
    });

    await supabase
      .from("ai_tasks")
      .update({
        status: "completed",
        result_payload: {
          underwriting: underwriting as unknown as Json,
          lenderRouting: lenderRouting as unknown as Json,
          fraud: fraud as unknown as Json,
          operationalInsight: operationalInsight as unknown as Json,
          confidenceScore
        },
        completed_at: new Date().toISOString()
      })
      .eq("id", task.id);

    await logAIAction({
      modelUsed: underwritingResponse.usage.model,
      executionLatencyMs: Date.now() - startedAt,
      inputTokens: underwritingResponse.usage.inputTokens ?? 0,
      outputTokens: underwritingResponse.usage.outputTokens ?? 0,
      estimatedCostUsd: underwritingResponse.usage.estimatedCostUsd,
      retryCount: 0,
      confidenceScore,
      promptType: "underwriting",
      workflowSource: "ai_underwriting_pipeline",
      dealId: input.businessApplicationId,
      metadata: { aiTaskId: task.id }
    });

    return {
      success: true,
      aiTaskId: task.id,
      underwriting,
      lenderRouting,
      fraud,
      operationalInsight,
      confidenceScore
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from("ai_tasks")
      .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", task.id);
    await logAIAction({
      modelUsed: "unknown",
      executionLatencyMs: Date.now() - startedAt,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      failureReason: message,
      retryCount: 0,
      confidenceScore: 0,
      promptType: "underwriting",
      workflowSource: "ai_underwriting_pipeline",
      dealId: input.businessApplicationId,
      metadata: { aiTaskId: task.id }
    });
    logger.error("AI underwriting pipeline failed", { aiTaskId: task.id, error: message });
    return { success: false, aiTaskId: task.id, confidenceScore: 0, error: message };
  }
}

export function calculateAiConfidenceScore(input: {
  underwritingConfidence: number;
  routingConfidence: number;
  deterministicScore: number;
}) {
  const deterministicConfidence = input.deterministicScore >= 75 || input.deterministicScore <= 35 ? 0.88 : 0.68;
  return Number((
    input.underwritingConfidence * 0.45 +
    input.routingConfidence * 0.3 +
    deterministicConfidence * 0.25
  ).toFixed(2));
}
