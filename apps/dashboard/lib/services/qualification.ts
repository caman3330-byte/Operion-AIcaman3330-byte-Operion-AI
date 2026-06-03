import type { AiTask, BusinessApplication, BusinessApplicationStatus, Json, Lead, LeadStatus } from "@operion/shared";
import { selectAnthropicModel } from "@/lib/ai/anthropic-models";
import { analyzeFundingFit } from "@/lib/ai/workflows/claude-workflows";
import { calculateFallbackQualification } from "@/lib/underwriting/fallback";
import { ConfigurationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { leadsRepository } from "@/lib/repositories/leads";
import { productionRepository } from "@/lib/repositories/production";

export interface QualificationWorkflowResult {
  status: "completed" | "blocked" | "failed";
  score: number | null;
  decision: string | null;
}

export async function runLeadQualificationWorkflow({
  lead,
  application,
  task
}: {
  lead: Lead;
  application: BusinessApplication;
  task: AiTask;
}): Promise<QualificationWorkflowResult> {
  const startedAt = new Date().toISOString();
  const qualificationModel = selectAnthropicModel(process.env, "premium");

  await productionRepository.updateBusinessApplication(application.id, {
    status: "ai_review",
    metadata: mergeMetadata(application.metadata, {
      qualification_started_at: startedAt
    })
  });
  await productionRepository.updateAiTask(task.id, {
    status: "running",
    started_at: startedAt,
    attempts: (task.attempts ?? 0) + 1
  });
  await productionRepository.createAiTaskLog({
    ai_task_id: task.id,
    status: "running",
    message: "Claude funding-fit qualification workflow started",
    provider: "claude",
    model: qualificationModel,
    metadata: {
      lead_id: lead.id,
      business_application_id: application.id
    } as Json
  });

  try {
    const aiResult = await analyzeFundingFit({
      lead,
      business_application: application,
      requested_amount: application.requested_amount,
      monthly_deposits: application.monthly_deposits,
      credit_score_range: application.credit_score_range,
      funding_purpose: application.funding_purpose
    } as Json);
    const result = aiResult.data;
    const leadStatus = resolveLeadStatus(result.decision);
    const applicationStatus: BusinessApplicationStatus =
      result.decision === "qualified"
        ? "qualified"
        : result.decision === "declined"
        ? "rejected"
        : "needs_review";
    const completedAt = new Date().toISOString();

    await productionRepository.createLeadScore({
      lead_id: lead.id,
      business_application_id: application.id,
      score: result.score,
      tier: result.tier,
      decision: result.decision,
      industry_risk: result.industry_risk,
      funding_fit: result.funding_fit,
      underwriting_summary: result.underwriting_summary,
      lender_recommendations: [] as Json,
      internal_notes: result.internal_notes,
      provider: "anthropic",
      model: aiResult.usage.model,
      input_payload: {
        requested_amount: application.requested_amount,
        monthly_deposits: application.monthly_deposits,
        credit_score_range: application.credit_score_range,
        industry: application.industry
      } as Json,
      output_payload: result as unknown as Json
    });

    await productionRepository.createUnderwritingReview({
      application_id: null,
      lead_id: lead.id,
      business_application_id: application.id,
      ai_task_id: task.id,
      status: result.decision === "qualified" ? "approved" : result.decision === "declined" ? "declined" : "in_review",
      risk_score: Math.max(0, 100 - result.score),
      qualification_score: result.score,
      industry_risk: result.industry_risk,
      funding_recommendation: result.funding_fit,
      requested_documents: ["bank_statements", "government_id", "business_bank_account"] as Json,
      notes: result.internal_notes,
      ai_summary: result.underwriting_summary,
      lender_recommendations: [] as Json
    });

    await leadsRepository.update(lead.id, {
      qualification_score: result.score,
      tier: result.tier,
      status: leadStatus,
      ai_summary: result.underwriting_summary,
      internal_notes: result.internal_notes,
      processing_error: false,
      processing_error_detail: null
    });

    await productionRepository.updateBusinessApplication(application.id, {
      status: applicationStatus,
      metadata: mergeMetadata(application.metadata, {
        qualification_completed_at: completedAt,
        qualification_decision: result.decision,
        qualification_score: result.score,
        qualification_tier: result.tier
      })
    });

    await productionRepository.updateAiTask(task.id, {
      status: "completed",
      result_payload: result as unknown as Json,
      cost_estimate_usd: aiResult.usage.estimatedCostUsd,
      completed_at: completedAt
    });
    await productionRepository.createAiTaskLog({
      ai_task_id: task.id,
      status: "completed",
      message: result.underwriting_summary,
      provider: aiResult.provider,
      model: aiResult.usage.model,
      input_tokens: aiResult.usage.inputTokens,
      output_tokens: aiResult.usage.outputTokens,
      latency_ms: aiResult.usage.latencyMs,
      cost_estimate_usd: aiResult.usage.estimatedCostUsd,
      metadata: result as unknown as Json
    });
    await productionRepository.createApiUsageLog({
      service: "anthropic",
      operation: "lead_qualification",
      lead_id: lead.id,
      business_application_id: application.id,
      ai_task_id: task.id,
      input_tokens: aiResult.usage.inputTokens,
      output_tokens: aiResult.usage.outputTokens,
      estimated_cost_usd: aiResult.usage.estimatedCostUsd,
      success: true,
      latency_ms: aiResult.usage.latencyMs,
      metadata: {
        model: aiResult.usage.model,
        decision: result.decision
      } as Json
    });

    if (result.approval_required || result.decision === "review_required") {
      await productionRepository.createApproval({
        entity_type: "business_application",
        entity_id: application.id,
        status: "pending",
        reason: "AI qualification requires supervisor review",
        metadata: {
          lead_id: lead.id,
          score: result.score,
          tier: result.tier
        } as Json
      });
    }

    await productionRepository.createAuditLog({
      event_type: "ai_qualification_completed",
      actor_id: "underwriting_ai",
      actor_role: "system",
      entity_type: "business_application",
      entity_id: application.id,
      metadata: {
        lead_id: lead.id,
        ai_task_id: task.id,
        decision: result.decision,
        score: result.score
      } as Json
    });

    return {
      status: "completed",
      score: result.score,
      decision: result.decision
    };
  } catch (error) {
    const isConfigurationBlocker =
      error instanceof ConfigurationError && (error.message.includes("ANTHROPIC_API_KEY") || error.message.includes("OPENAI_API_KEY"));
    const message = error instanceof Error ? error.message : "AI qualification failed";

    logger.warn("lead_qualification_workflow_not_completed", {
      fallback: isConfigurationBlocker,
      message,
      leadId: lead.id,
      businessApplicationId: application.id
    });

    if (isConfigurationBlocker) {
      const fallback = calculateFallbackQualification({
        businessName: application.business_name,
        industry: application.industry,
        requestedAmount: application.requested_amount,
        monthlyDeposits: application.monthly_deposits,
        creditScoreRange: application.credit_score_range,
        annualRevenue: application.annual_revenue ?? null,
        monthlyRevenue: application.monthly_revenue ?? null,
        fundingPurpose: application.funding_purpose ?? null,
        businessApplicationId: application.id,
        leadId: lead.id
      });

      const leadStatus = resolveLeadStatus(fallback.decision);
      const applicationStatus: BusinessApplicationStatus =
        fallback.decision === "qualified"
          ? "qualified"
          : fallback.decision === "declined"
          ? "rejected"
          : "needs_review";
      const completedAt = new Date().toISOString();

      await productionRepository.createLeadScore({
        lead_id: lead.id,
        business_application_id: application.id,
        score: fallback.score,
        tier: fallback.tier,
        decision: fallback.decision,
        industry_risk: fallback.industry_risk,
        funding_fit: fallback.funding_fit,
        underwriting_summary: fallback.underwriting_summary,
        lender_recommendations: fallback.lender_recommendations as Json,
        internal_notes: fallback.internal_notes,
        provider: "fallback",
        model: "fallback",
        input_payload: {
          requested_amount: application.requested_amount,
          monthly_deposits: application.monthly_deposits,
          credit_score_range: application.credit_score_range,
          industry: application.industry
        } as Json,
        output_payload: fallback as unknown as Json
      });

      await productionRepository.createUnderwritingReview({
        application_id: null,
        lead_id: lead.id,
        business_application_id: application.id,
        ai_task_id: task.id,
        status: fallback.decision === "qualified" ? "approved" : fallback.decision === "declined" ? "declined" : "in_review",
        risk_score: Math.max(0, 100 - fallback.score),
        qualification_score: fallback.score,
        industry_risk: fallback.industry_risk,
        funding_recommendation: fallback.funding_fit,
        requested_documents: ["bank_statements", "government_id", "business_bank_account"] as Json,
        notes: fallback.internal_notes,
        ai_summary: fallback.underwriting_summary,
        lender_recommendations: fallback.lender_recommendations as Json
      });

      await leadsRepository.update(lead.id, {
        qualification_score: fallback.score,
        tier: fallback.tier,
        status: leadStatus,
        ai_summary: fallback.underwriting_summary,
        internal_notes: fallback.internal_notes,
        processing_error: false,
        processing_error_detail: `Fallback qualification applied because live AI was unavailable: ${message}`
      });

      await productionRepository.updateBusinessApplication(application.id, {
        status: applicationStatus,
        metadata: mergeMetadata(application.metadata, {
          qualification_completed_at: completedAt,
          qualification_decision: fallback.decision,
          qualification_score: fallback.score,
          qualification_tier: fallback.tier,
          qualification_fallback: true,
          qualification_fallback_reason: message
        })
      });

      await productionRepository.updateAiTask(task.id, {
        status: "completed",
        result_payload: fallback as unknown as Json,
        cost_estimate_usd: 0,
        completed_at: completedAt
      });
      await productionRepository.createAiTaskLog({
        ai_task_id: task.id,
        status: "completed",
        message: fallback.underwriting_summary,
        provider: "fallback",
        model: "fallback",
        metadata: fallback as unknown as Json
      });
      await productionRepository.createApiUsageLog({
        service: "fallback",
        operation: "lead_qualification_fallback",
        lead_id: lead.id,
        business_application_id: application.id,
        ai_task_id: task.id,
        success: true,
        latency_ms: Date.now() - Date.parse(startedAt),
        metadata: {
          fallback_reason: message
        } as Json
      });
      await productionRepository.createAuditLog({
        event_type: "ai_qualification_fallback",
        actor_id: "underwriting_ai",
        actor_role: "system",
        entity_type: "business_application",
        entity_id: application.id,
        metadata: {
          lead_id: lead.id,
          ai_task_id: task.id,
          fallback_reason: message
        } as Json
      });

      return {
        status: "completed",
        score: fallback.score,
        decision: fallback.decision
      };
    }

    const taskStatus = "failed";

    await productionRepository.updateAiTask(task.id, {
      status: taskStatus,
      error_message: message,
      completed_at: new Date().toISOString()
    });
    await productionRepository.createAiTaskLog({
      ai_task_id: task.id,
      status: taskStatus,
      message,
      provider: "claude",
      model: qualificationModel,
      metadata: {
        lead_id: lead.id,
        business_application_id: application.id
      } as Json
    });
    await productionRepository.createApiUsageLog({
      service: "anthropic",
      operation: "lead_qualification",
      lead_id: lead.id,
      business_application_id: application.id,
      ai_task_id: task.id,
      success: false,
      error_message: message,
      metadata: {
        task_status: taskStatus
      } as Json
    });
    await productionRepository.createAuditLog({
      event_type: "ai_qualification_failed",
      actor_id: "underwriting_ai",
      actor_role: "system",
      entity_type: "business_application",
      entity_id: application.id,
      metadata: {
        lead_id: lead.id,
        ai_task_id: task.id,
        error_message: message
      } as Json
    });

    return {
      status: taskStatus,
      score: null,
      decision: null
    };
  }
}

function resolveLeadStatus(decision: "qualified" | "review_required" | "needs_review" | "declined"): LeadStatus {
  if (decision === "qualified") return "qualified";
  if (decision === "declined") return "rejected";
  return "reviewed";
}

function mergeMetadata(current: Json, next: Record<string, Json>) {
  const base = current && typeof current === "object" && !Array.isArray(current) ? current : {};
  return {
    ...base,
    ...next
  } as Json;
}
