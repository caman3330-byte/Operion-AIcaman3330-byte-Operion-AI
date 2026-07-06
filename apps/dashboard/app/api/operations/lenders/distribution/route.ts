import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { buildLenderDistributionPlan, persistDistributionPlan } from "@/lib/lenders/distribution";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { lenderDistributionSchema } from "@/lib/operations/schemas";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { productionRepository } from "@/lib/repositories/production";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit({ key: rateLimitKey(request, "operations_lender_distribution"), limit: 60, windowMs: 60_000 });
    await requireInternalUser(request);
    const payload = lenderDistributionSchema.parse(await readJsonBody(request));
    const application = payload.businessApplicationId
      ? await productionRepository.getBusinessApplication(payload.businessApplicationId)
      : null;
    const metadata = readMetadata(application?.metadata);
    const state = payload.state ?? application?.state ?? undefined;
    const industry = payload.industry ?? application?.industry ?? undefined;
    const requestedAmount = payload.requestedAmount ?? application?.requested_amount ?? undefined;
    const leadId = payload.leadId ?? application?.lead_id ?? undefined;
    const monthlyRevenue = payload.monthlyRevenue ?? application?.monthly_revenue ?? undefined;
    const monthlyDeposits = payload.monthlyDeposits ?? application?.monthly_deposits ?? undefined;
    const timeInBusinessMonths = payload.timeInBusinessMonths ?? metadata.timeInBusinessMonths ?? undefined;

    if (!state || !industry || !requestedAmount) {
      throw new ValidationError("state, industry, and requestedAmount are required unless a complete businessApplicationId is supplied");
    }

    const planResult = await buildLenderDistributionPlan({
      merchant: {
        ...(payload.businessApplicationId ? { businessApplicationId: payload.businessApplicationId } : {}),
        ...(leadId ? { leadId } : {}),
        state,
        industry,
        requestedAmount,
        ...(payload.creditScore ? { creditScore: payload.creditScore } : {}),
        ...(payload.riskScore !== undefined ? { riskScore: payload.riskScore } : {}),
        ...(monthlyRevenue !== undefined && monthlyRevenue !== null ? { monthlyRevenue } : {}),
        ...(monthlyDeposits !== undefined && monthlyDeposits !== null ? { monthlyDeposits } : {}),
        ...(timeInBusinessMonths !== undefined ? { timeInBusinessMonths } : {})
      },
      ...(payload.maxDistributions ? { maxDistributions: payload.maxDistributions } : {}),
      ...(payload.minimumScore !== undefined ? { minimumScore: payload.minimumScore } : {})
    });

    const persistence = payload.persist && planResult.plan
      ? await persistDistributionPlan(planResult.plan)
      : { success: true, inserted: 0 };

    const submissionPackage = application && planResult.plan
      ? await buildSubmissionPackage(application.id, planResult.plan)
      : null;

    return NextResponse.json({ data: { ...planResult, persistence, submissionPackage } });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function readJsonBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Invalid JSON request body");
  }
}

function readMetadata(value: unknown) {
  const metadata = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const timeInBusinessMonths = Number(metadata.time_in_business_months ?? 0);
  return {
    timeInBusinessMonths: Number.isFinite(timeInBusinessMonths) && timeInBusinessMonths > 0 ? timeInBusinessMonths : undefined
  };
}

async function buildSubmissionPackage(applicationId: string, plan: NonNullable<Awaited<ReturnType<typeof buildLenderDistributionPlan>>["plan"]>) {
  const [application, documents, aiTasks] = await Promise.all([
    productionRepository.getBusinessApplication(applicationId),
    productionRepository.listDocumentsForApplication(applicationId),
    productionRepository.listAiTasksForApplications([applicationId])
  ]);
  const qualification = aiTasks.find((task) => task.task_type === "lead_qualification");
  const selected = plan.decisions.filter((decision) => plan.selectedLenderIds.includes(decision.lenderId));
  const uploadedDocuments = documents.filter((document) => document.status === "uploaded" || document.status === "verified");
  const pendingDocuments = documents.filter((document) => document.status === "requested");

  return {
    status: selected.length > 0 && uploadedDocuments.length > 0 ? "ready_for_founder_review" : "needs_review",
    generatedAt: new Date().toISOString(),
    businessApplicationId: application.id,
    leadId: application.lead_id,
    merchant: {
      businessName: application.business_name,
      state: application.state,
      industry: application.industry,
      requestedAmount: application.requested_amount,
      monthlyDeposits: application.monthly_deposits,
      creditScoreRange: application.credit_score_range
    },
    documents: {
      uploaded: uploadedDocuments.map((document) => ({
        id: document.id,
        type: document.document_type,
        fileName: document.file_name,
        status: document.status
      })),
      pending: pendingDocuments.map((document) => document.document_type)
    },
    aiQualification: qualification ? {
      status: qualification.status,
      result: qualification.result_payload
    } : null,
    matchedLenders: selected.map((decision) => ({
      lenderId: decision.lenderId,
      lenderName: decision.lenderName,
      matchScore: decision.riskAdjustedScore,
      routingConfidence: decision.routingConfidence,
      restrictionFailures: decision.restrictionFailures
    })),
    manualApprovalsRequired: [
      "Founder approval before external lender transmission",
      ...(application.credit_score_range === "unknown" ? ["Confirm merchant credit score range"] : []),
      ...(pendingDocuments.length > 0 ? ["Resolve pending/requested documents or mark optional"] : [])
    ]
  };
}
