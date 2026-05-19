import type { AiTask, AiTaskStatus, BusinessApplicationStatus, Json } from "@operion/shared";
import type { AiProvider, AiTaskDispatchInput } from "@/lib/ai/types";
import { ConfigurationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { leadsRepository } from "@/lib/repositories/leads";
import { safeProductionRepository as productionRepository } from "@/lib/repositories/safe-production";
import { routeAiWorkflow, workflowForTaskType } from "@/lib/ai/router";

export interface AiTaskDispatchResult {
  worker_id: string;
  processed: Array<{
    task_id: string;
    task_type: string;
    provider?: string;
    status: AiTaskStatus;
    summary?: string;
    error?: string;
  }>;
}

export async function runAiTaskDispatcher(input: AiTaskDispatchInput): Promise<AiTaskDispatchResult> {
  const queued = (await productionRepository.listAiTasks(100))
    .filter((task) => task.status === "queued" && (!input.taskTypes?.length || input.taskTypes.includes(task.task_type)))
    .slice(0, input.limit);
  const processed: AiTaskDispatchResult["processed"] = [];

  for (const task of queued) {
    processed.push(await executeAiTask(task, input.workerId));
  }

  return {
    worker_id: input.workerId,
    processed
  };
}

async function executeAiTask(task: AiTask, workerId: string): Promise<AiTaskDispatchResult["processed"][number]> {
  const startedAt = new Date().toISOString();
  const attempts = (task.attempts ?? 0) + 1;

  await productionRepository.updateAiTask(task.id, {
    status: "running",
    attempts,
    started_at: task.started_at ?? startedAt,
    error_message: null
  });
  await productionRepository.createAiTaskLog({
    ai_task_id: task.id,
    status: "running",
    message: `AI task claimed by ${workerId}`,
    provider: null,
    model: null,
    metadata: {
      worker_id: workerId,
      task_type: task.task_type
    } as Json
  });

  try {
    const workflow = workflowForTaskType(task.task_type);
    const result = await routeAiWorkflow({
      workflow,
      input: buildTaskInput(task)
    });
    const completedAt = new Date().toISOString();
    const resultPayload = result.data as Json;

    await productionRepository.updateAiTask(task.id, {
      status: "completed",
      result_payload: resultPayload,
      cost_estimate_usd: result.usage.estimatedCostUsd,
      completed_at: completedAt
    });
    await productionRepository.createAiTaskLog({
      ai_task_id: task.id,
      status: "completed",
      message: `Completed ${workflow} via ${result.provider}`,
      provider: result.provider,
      model: result.usage.model,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      latency_ms: result.usage.latencyMs,
      cost_estimate_usd: result.usage.estimatedCostUsd,
      metadata: resultPayload
    });
    await productionRepository.createApiUsageLog({
      service: result.provider,
      operation: workflow,
      lead_id: task.lead_id,
      business_application_id: task.business_application_id,
      ai_task_id: task.id,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      estimated_cost_usd: result.usage.estimatedCostUsd,
      success: true,
      latency_ms: result.usage.latencyMs,
      metadata: {
        worker_id: workerId,
        model: result.usage.model
      } as Json
    });

    await applyTaskSideEffects(task, resultPayload);

    await productionRepository.createAuditLog({
      event_type: "ai_task_completed",
      actor_id: workerId,
      actor_role: "system",
      entity_type: "ai_task",
      entity_id: task.id,
      after_state: {
        status: "completed",
        result: resultPayload
      } as Json,
      metadata: {
        provider: result.provider,
        workflow
      } as Json
    });

    return {
      task_id: task.id,
      task_type: task.task_type,
      provider: result.provider,
      status: "completed",
      summary: summarizeResult(resultPayload)
    };
  } catch (error) {
    logger.warn("ai_task_dispatch_failed", { taskId: task.id, workerId, error });
    return recoverAiTask(task, workerId, attempts, error);
  }
}

async function recoverAiTask(
  task: AiTask,
  workerId: string,
  attempts: number,
  error: unknown
): Promise<AiTaskDispatchResult["processed"][number]> {
  const message = error instanceof Error ? error.message : "AI task dispatch failed";
  const blocked = error instanceof ConfigurationError;
  const retryable = !blocked && attempts < (task.max_attempts ?? 3);
  const nextStatus: AiTaskStatus = blocked ? "blocked" : retryable ? "queued" : "failed";

  await productionRepository.updateAiTask(task.id, {
    status: nextStatus,
    error_message: message,
    completed_at: nextStatus === "failed" ? new Date().toISOString() : null
  });
  await productionRepository.createAiTaskLog({
    ai_task_id: task.id,
    status: nextStatus,
    message,
    provider: null,
    model: null,
    metadata: {
      worker_id: workerId,
      attempts,
      retryable
    } as Json
  });
  await productionRepository.createApiUsageLog({
    service: getTaskProvider(task.task_type),
    operation: String(task.task_type),
    lead_id: task.lead_id,
    business_application_id: task.business_application_id,
    ai_task_id: task.id,
    success: false,
    error_message: message,
    metadata: {
      worker_id: workerId,
      next_status: nextStatus
    } as Json
  });
  await productionRepository.createAuditLog({
    event_type: nextStatus === "queued" ? "ai_task_retry_scheduled" : nextStatus === "blocked" ? "ai_task_blocked" : "ai_task_failed",
    actor_id: workerId,
    actor_role: "system",
    entity_type: "ai_task",
    entity_id: task.id,
    metadata: {
      error_message: message,
      attempts,
      next_status: nextStatus
    } as Json
  });

  return {
    task_id: task.id,
    task_type: task.task_type,
    status: nextStatus,
    error: message
  };
}

async function applyTaskSideEffects(task: AiTask, result: Json) {
  const record = asRecord(result);

  if (task.task_type === "lead_qualification" && task.lead_id) {
    const score = numberFrom(record.score ?? record.qualification_score) ?? 0;
    const decision = String(record.decision ?? "review_required");
    const tier = ["A", "B", "C", "D"].includes(String(record.tier)) ? (String(record.tier) as "A" | "B" | "C" | "D") : null;
    const leadStatus = decision === "qualified" ? "qualified" : decision === "declined" ? "rejected" : "reviewed";
    const applicationStatus = (decision === "qualified" ? "qualified" : decision === "declined" ? "rejected" : "needs_review") as BusinessApplicationStatus;
    const industryRisk = stringFrom(record.industry_risk);
    const fundingFit = stringFrom(record.funding_fit ?? record.funding_recommendation);
    const underwritingSummary = stringFrom(record.underwriting_summary ?? record.summary);
    const internalNotes = stringFrom(record.internal_notes);
    const lenderRecommendations = (record.lender_recommendations ?? record.recommended_lenders ?? []) as Json;
    const requestedDocuments = (record.requested_documents as Json) ?? ["bank_statements", "government_id", "business_bank_account"];
    const taskInput = asRecord(task.input_payload);
    const provider = (result as { provider?: string }).provider ?? getTaskProvider(task.task_type);
    const model = (result as { usage?: { model?: string } }).usage?.model ?? null;
    const businessApplicationId = task.business_application_id ?? null;

    await leadsRepository.update(task.lead_id, {
      qualification_score: score,
      tier,
      status: leadStatus,
      ai_summary: underwritingSummary,
      internal_notes: internalNotes,
      processing_error: false,
      processing_error_detail: null
    });

    await productionRepository.createLeadScore({
      lead_id: task.lead_id,
      business_application_id: businessApplicationId,
      score,
      tier,
      decision,
      industry_risk: industryRisk,
      funding_fit: fundingFit,
      underwriting_summary: underwritingSummary,
      lender_recommendations: lenderRecommendations,
      internal_notes: internalNotes,
      provider,
      model,
      input_payload: {
        requested_amount: taskInput.requested_amount,
        monthly_deposits: taskInput.monthly_deposits,
        credit_score_range: taskInput.credit_score_range,
        industry: taskInput.industry
      } as Json,
      output_payload: result
    });

    await productionRepository.createUnderwritingReview({
      application_id: businessApplicationId,
      lead_id: task.lead_id,
      business_application_id: businessApplicationId,
      ai_task_id: task.id,
      status: decision === "qualified" ? "approved" : decision === "declined" ? "declined" : "in_review",
      risk_score: numberFrom(record.risk_score ?? record.qualification_score ?? score) ?? Math.max(0, 100 - score),
      qualification_score: score,
      industry_risk: industryRisk,
      funding_recommendation: fundingFit,
      requested_documents: requestedDocuments,
      notes: internalNotes,
      ai_summary: underwritingSummary,
      lender_recommendations: lenderRecommendations
    });

    if (businessApplicationId) {
      await productionRepository.createCrmActivity({
        application_id: businessApplicationId,
        lead_id: task.lead_id ?? null,
        actor_type: "system",
        activity_type: "note",
        subject: "AI qualification completed",
        body: underwritingSummary ?? internalNotes,
        metadata: {
          ai_task_id: task.id,
          decision,
          score,
          tier,
          provider,
          model
        } as Json
      });
    }

    if (businessApplicationId) {
      await productionRepository.updateBusinessApplication(businessApplicationId, {
        status: applicationStatus,
        metadata: {
          ai_task_id: task.id,
          last_ai_decision: decision,
          qualification_score: score,
          qualification_tier: tier,
          qualification_completed_at: new Date().toISOString(),
          revenue_trend: stringFrom(record.revenue_trend),
          nsf_alerts: numberFrom(record.nsf_alerts),
          mca_stacking_risk: stringFrom(record.mca_stacking_risk),
          estimated_approval_probability: numberFrom(record.estimated_approval_probability),
          lifecycle_updated_at: new Date().toISOString()
        } as Json
      });

      if (decision === "qualified") {
        const lenderTask = await productionRepository.createAiTask({
          task_type: "lender_recommendation",
          status: "queued",
          priority: "high",
          lead_id: task.lead_id,
          business_application_id: businessApplicationId,
          assigned_agent: "sales_agent",
          input_payload: {
            business_name: stringFrom(taskInput.business_name) ?? "Customer lead",
            requested_amount: taskInput.requested_amount,
            monthly_deposits: taskInput.monthly_deposits,
            credit_score_range: taskInput.credit_score_range,
            industry: taskInput.industry,
            funding_purpose: taskInput.funding_purpose
          } as Json,
          created_by: null
        });

        await productionRepository.createAiTaskLog({
          ai_task_id: lenderTask.id,
          status: "queued",
          message: "Auto-queued lender recommendation after AI qualification",
          provider: null,
          model: null,
          metadata: {
            source: "automated_followup",
            previous_task_id: task.id,
            business_application_id: businessApplicationId
          } as Json
        });

        const outreachTask = await productionRepository.createAiTask({
          task_type: "outreach_preparation",
          status: "queued",
          priority: "medium",
          lead_id: task.lead_id,
          business_application_id: businessApplicationId,
          assigned_agent: "sales_agent",
          input_payload: {
            business_name: stringFrom(taskInput.business_name) ?? "Customer lead",
            contact_email: stringFrom(taskInput.contact_email) ?? null,
            requested_amount: taskInput.requested_amount,
            funding_purpose: taskInput.funding_purpose,
            instructions: "Draft a customer-facing email that confirms next steps, document upload reminders, and current funding status."
          } as Json,
          created_by: null
        });

        await productionRepository.createAiTaskLog({
          ai_task_id: outreachTask.id,
          status: "queued",
          message: "Auto-queued outreach preparation after AI qualification",
          provider: null,
          model: null,
          metadata: {
            source: "automated_followup",
            previous_task_id: task.id,
            business_application_id: businessApplicationId
          } as Json
        });
      }

      if (decision === "review_required") {
        const underwritingTask = await productionRepository.createAiTask({
          task_type: "underwriting_summary",
          status: "queued",
          priority: "high",
          lead_id: task.lead_id,
          business_application_id: businessApplicationId,
          assigned_agent: "underwriting_agent",
          input_payload: {
            business_name: stringFrom(taskInput.business_name) ?? "Customer lead",
            requested_amount: taskInput.requested_amount,
            monthly_deposits: taskInput.monthly_deposits,
            credit_score_range: taskInput.credit_score_range,
            industry: taskInput.industry,
            funding_purpose: taskInput.funding_purpose,
            notes: internalNotes
          } as Json,
          created_by: null
        });

        await productionRepository.createAiTaskLog({
          ai_task_id: underwritingTask.id,
          status: "queued",
          message: "Auto-queued underwriting summary for review-required qualification",
          provider: null,
          model: null,
          metadata: {
            source: "automated_followup",
            previous_task_id: task.id,
            business_application_id: businessApplicationId
          } as Json
        });
      }
    }
  }

  if (task.task_type === "underwriting_summary" && task.lead_id) {
    const score = numberFrom(record.qualification_score) ?? null;
    const decision = String(record.decision ?? "review_required");
    const leadStatus = decision === "qualified" ? "qualified" : decision === "declined" ? "rejected" : "reviewed";
    const applicationStatus = (decision === "qualified" ? "qualified" : decision === "declined" ? "rejected" : "needs_review") as BusinessApplicationStatus;
    const industryRisk = stringFrom(record.industry_risk) || null;
    const fundingFit = stringFrom(record.funding_fit) || null;
    const underwritingSummary = stringFrom(record.underwriting_summary ?? record.summary);
    const internalNotes = stringFrom(record.internal_notes) || null;
    const requestedDocuments = (record.missing_documents as Json) ?? ["bank_statements", "government_id", "business_bank_account"];
    const riskScore = numberFrom(record.qualification_score ?? record.risk_score) ?? null;
    const provider = (result as { provider?: string }).provider ?? getTaskProvider(task.task_type);
    const model = (result as { usage?: { model?: string } }).usage?.model ?? null;
    const businessApplicationId = task.business_application_id ?? null;

    if (businessApplicationId) {
      await productionRepository.updateBusinessApplication(businessApplicationId, {
        status: applicationStatus,
        metadata: {
          ai_task_id: task.id,
          last_underwriting_summary_at: new Date().toISOString(),
          revenue_trend: stringFrom(record.revenue_trend),
          nsf_alerts: numberFrom(record.nsf_alerts),
          mca_stacking_risk: stringFrom(record.mca_stacking_risk),
          estimated_approval_probability: numberFrom(record.estimated_approval_probability),
          statement_insights: record.statement_insights ?? [],
          underwriting_summary: underwritingSummary,
          lifecycle_updated_at: new Date().toISOString()
        } as Json
      });
    }

    await leadsRepository.update(task.lead_id, {
      status: leadStatus,
      ai_summary: underwritingSummary,
      processing_error: false,
      processing_error_detail: null
    });

    await productionRepository.createUnderwritingReview({
      application_id: businessApplicationId,
      lead_id: task.lead_id,
      business_application_id: businessApplicationId,
      ai_task_id: task.id,
      status: decision === "qualified" ? "approved" : decision === "declined" ? "declined" : "in_review",
      risk_score: riskScore ?? 0,
      qualification_score: score ?? 0,
      industry_risk: industryRisk,
      funding_recommendation: fundingFit,
      requested_documents: requestedDocuments,
      notes: internalNotes,
      ai_summary: underwritingSummary,
      lender_recommendations: record.lender_recommendations ?? [] as Json
    });

    await productionRepository.createCrmActivity({
      application_id: businessApplicationId,
      lead_id: task.lead_id ?? null,
      actor_type: "system",
      activity_type: "note",
      subject: "Underwriting summary generated",
      body: underwritingSummary,
      metadata: {
        ai_task_id: task.id,
        provider,
        model,
        revenue_trend: record.revenue_trend ?? null,
        nsf_alerts: record.nsf_alerts ?? null,
        mca_stacking_risk: record.mca_stacking_risk ?? null,
        estimated_approval_probability: record.estimated_approval_probability ?? null
      } as Json
    });
  }

  if (task.task_type === "lender_recommendation" && task.lead_id && task.business_application_id) {
    const recommendations = Array.isArray(record.recommendations) ? record.recommendations : [];
    const summary = stringFrom(record.routing_summary) || stringFrom(record.summary);
    const requiresApproval = record.requires_approval === true || record.approval_required === true;
    const provider = (result as { provider?: string }).provider ?? getTaskProvider(task.task_type);
    const model = (result as { usage?: { model?: string } }).usage?.model ?? null;
    const businessApplicationId = task.business_application_id;
    const recommendationsSaved = [] as Json[];

    for (const recommendation of recommendations) {
      const rec = asRecord(recommendation as Json);
      const lenderId = stringFrom(rec.lender_id) ?? `lender-${Date.now()}`;
      const lenderName = stringFrom(rec.lender_name) ?? "Unknown lender";
      const matchScore = numberFrom(rec.match_score) ?? null;
      const rationale = stringFrom(rec.rationale) ?? "AI lender routing recommendation.";
      const requiredConditions = Array.isArray(rec.required_conditions) ? rec.required_conditions.filter((item): item is string => typeof item === "string") : [];

      const lenderMatch = await productionRepository.upsertLenderMatch({
        lead_id: task.lead_id,
        lender_id: lenderId,
        business_application_id: businessApplicationId,
        match_score: matchScore,
        status: "recommended",
        criteria_snapshot: recommendation as Json,
        decision_at: null,
        submitted_at: null,
        commission_estimate: null,
        notes: rationale
      });

      recommendationsSaved.push({
        lender_match_id: lenderMatch.id,
        lender_id: lenderId,
        lender_name: lenderName,
        match_score: matchScore,
        rationale,
        required_conditions: requiredConditions
      } as Json);
    }

    if (businessApplicationId) {
      await productionRepository.updateBusinessApplication(businessApplicationId, {
        status: recommendations.length > 0 ? "routed" : "reviewed",
        metadata: {
          lender_routing_summary: summary,
          lender_recommendations: recommendationsSaved,
          lender_routing_completed_at: new Date().toISOString(),
          requires_approval: requiresApproval
        } as Json
      });

      await productionRepository.createCrmActivity({
        application_id: businessApplicationId,
        lead_id: task.lead_id ?? null,
        actor_type: "system",
        activity_type: "lender_update",
        subject: "Lender recommendations generated",
        body: summary,
        metadata: {
          ai_task_id: task.id,
          provider,
          model,
          requires_approval: requiresApproval,
          recommendations: recommendationsSaved
        } as Json
      });
    }

    if (requiresApproval) {
      await productionRepository.createApproval({
        entity_type: "business_application",
        entity_id: businessApplicationId,
        status: "pending",
        reason: " lender routing recommendations require supervisor approval",
        metadata: {
          ai_task_id: task.id,
          task_type: task.task_type
        } as Json
      });
    }
  }

  if (task.task_type === "outreach_preparation" && task.business_application_id) {
    const provider = (result as { provider?: string }).provider ?? getTaskProvider(task.task_type);
    const model = (result as { usage?: { model?: string } }).usage?.model ?? null;
    const subject = stringFrom(record.subject) ?? "AI outreach draft prepared";
    const body = stringFrom(record.body_text) ?? stringFrom(record.body_html) ?? subject;
    await productionRepository.createOutreachLog({
      campaign_id: null,
      lead_id: task.lead_id ?? null,
      business_application_id: task.business_application_id,
      channel: "email",
      direction: "outbound",
      subject,
      body,
      status: "draft",
      provider,
      provider_message_id: null,
      error_message: null,
      sent_at: null,
      opened_at: null,
      replied_at: null,
      metadata: {
        ai_task_id: task.id,
        tone: stringFrom(record.tone),
        personalization_points: record.personalization_points ?? [],
        compliance_notes: record.compliance_notes ?? []
      } as Json
    });

    await productionRepository.createCrmActivity({
      application_id: task.business_application_id,
      lead_id: task.lead_id ?? null,
      actor_type: "system",
      activity_type: "email",
      subject: "Outreach draft created",
      body,
      metadata: {
        ai_task_id: task.id,
        provider,
        model,
        tone: stringFrom(record.tone),
        personalization_points: record.personalization_points ?? [],
        compliance_notes: record.compliance_notes ?? []
      } as Json
    });
  }

  if (task.task_type === "crm_activity" && (task.business_application_id || task.lead_id)) {
    const provider = (result as { provider?: string }).provider ?? getTaskProvider(task.task_type);
    const model = (result as { usage?: { model?: string } }).usage?.model ?? null;
    const activityType = stringFrom(record.activity_type) ?? "note";
    await productionRepository.createCrmActivity({
      application_id: task.business_application_id ?? null,
      lead_id: task.lead_id ?? null,
      actor_type: "system",
      activity_type: ["note", "call", "email", "status_change", "document_request", "lender_update"].includes(activityType)
        ? (activityType as any)
        : "note",
      subject: stringFrom(record.subject) ?? "CRM activity recorded",
      body: stringFrom(record.body) ?? null,
      metadata: {
        ai_task_id: task.id,
        provider,
        model,
        next_step: stringFrom(record.next_step),
        priority: stringFrom(record.priority),
        sentiment: stringFrom(record.sentiment)
      } as Json
    });
  }

  if (requiresApproval(record) && task.business_application_id && task.task_type !== "lender_recommendation") {
    await productionRepository.createApproval({
      entity_type: "business_application",
      entity_id: task.business_application_id,
      status: "pending",
      reason: "AI workflow requires supervisor approval",
      metadata: {
        ai_task_id: task.id,
        task_type: task.task_type
      } as Json
    });
  }
}

function buildTaskInput(task: AiTask): Json {
  return {
    task_id: task.id,
    task_type: task.task_type,
    lead_id: task.lead_id,
    business_application_id: task.business_application_id,
    input: task.input_payload
  } as Json;
}

function getTaskProvider(taskType: string): AiProvider {
  const workflow = workflowForTaskType(taskType);
  return workflow === "funding_fit_analysis" || workflow === "executive_summary" ? "claude" : "openai";
}

function summarizeResult(result: Json) {
  const record = asRecord(result);
  return stringFrom(record.underwriting_summary ?? record.routing_summary ?? record.summary ?? record.subject) ?? "AI task completed";
}

function requiresApproval(record: Record<string, Json>) {
  return record.requires_approval === true || record.approval_required === true;
}

function numberFrom(value: Json | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function stringFrom(value: Json | undefined) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asRecord(value: Json): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json>) : {};
}
