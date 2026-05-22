import type { Json } from "@operion/shared";
import { logger } from "../logger";
import { getSupabaseAdmin } from "../supabase/server";
import type { BusinessApplicationInsert, BusinessApplicationUpdate } from "../supabase/types";
import { createDocumentRecord, generateSignedUploadUrl } from "../documents/service";
import { createWorkflowJob } from "../workflows/orchestrator";
import { trackCRMActivity } from "../crm/operations";
import { buildAiIntakePreparation } from "./workflow";
import type { IntakeProcessingResult, MerchantSubmissionInput, SubmissionStatusSnapshot } from "./types";
import { validateMerchantSubmission } from "./validation";

export async function submitMerchantIntake(input: MerchantSubmissionInput): Promise<IntakeProcessingResult> {
  const validation = validateMerchantSubmission(input);

  if (!validation.valid) {
    logger.warn("Merchant intake validation failed", {
      businessName: input.businessName,
      errorCount: validation.errors.length
    });
    return {
      success: false,
      status: "validation_failed",
      validation,
      documentUploads: [],
      error: "Merchant intake validation failed"
    };
  }

  try {
    const supabase = await getSupabaseAdmin();
    const submittedAt = new Date().toISOString();
    const metadata = {
      ...(isJsonObject(input.metadata) ? input.metadata : {}),
      intake: {
        status: "received",
        submittedBy: input.submittedBy ?? "system",
        submittedAt,
        validationWarnings: serializeValidationMessages(validation.warnings),
        lifecycle: ["received"]
      }
    } as unknown as Json;

    const payload: BusinessApplicationInsert = {
      business_name: input.businessName,
      industry: input.industry,
      state: input.state,
      website_url: input.websiteUrl,
      annual_revenue: input.annualRevenue,
      monthly_revenue: input.monthlyRevenue,
      monthly_deposits: input.monthlyDeposits,
      requested_amount: input.requestedAmount,
      product_type: input.productType ?? "mca",
      credit_score_range: input.creditScoreRange,
      owner_name: input.ownerName,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone,
      ownership_percentage: input.ownershipPercentage,
      bank_name: input.bankName,
      average_daily_balance: input.averageDailyBalance,
      funding_purpose: input.fundingPurpose,
      consent_to_contact: input.consentToContact,
      status: "submitted",
      progress_step: 2,
      submitted_at: submittedAt,
      metadata
    };

    const { data: application, error } = await supabase.from("business_applications").insert(payload).select("*").single();
    if (error) {
      logger.error("Failed to create merchant intake application", { error: error.message });
      return { success: false, status: "received", validation, documentUploads: [], error: error.message };
    }

    const applicationId = application.id;
    await trackCRMActivity({
      applicationId,
      businessId: application.business_id ?? applicationId,
      actorId: input.submittedBy ?? "system",
      actorType: "system",
      activityType: "status_change",
      subject: "Merchant intake submitted",
      body: `${input.businessName} submitted an MCA intake application.`,
      metadata: { status: "submitted", submittedAt }
    });

    const documentUploads = [];
    for (const document of input.requiredDocuments ?? []) {
      const upload = await generateSignedUploadUrl(applicationId, document.fileName, document.mimeType);
      if (!upload.error) {
        await createDocumentRecord({
          merchantId: applicationId,
          businessApplicationId: applicationId,
          documentType: document.documentType,
          fileKey: upload.fileKey,
          fileName: document.fileName,
          mimeType: document.mimeType,
          fileSizeMB: document.fileSizeMB,
          uploadedBy: input.submittedBy ?? application.user_id ?? applicationId
        });
      }
      documentUploads.push({
        documentType: document.documentType,
        fileName: document.fileName,
        fileKey: upload.fileKey,
        uploadUrl: upload.uploadUrl,
        ...(upload.error ? { error: upload.error } : {})
      });
    }

    const aiPreparation = buildAiIntakePreparation(application, validation);
    await createWorkflowJob({
      workflowKey: "merchant_intake",
      jobType: "intake_ai_preparation",
      payload: aiPreparation as Record<string, any>,
      priority: validation.warnings.length > 0 ? 60 : 40
    });

    await updateSubmissionStatus(applicationId, "ai_review", {
      intake: {
        status: "ai_prepared",
        preparedAt: aiPreparation.preparedAt,
        validationWarnings: serializeValidationMessages(validation.warnings)
      }
    } as unknown as Json);

    logger.info("Merchant intake processed", { applicationId, businessName: input.businessName });
    return {
      success: true,
      applicationId,
      status: "ai_prepared",
      validation,
      documentUploads,
      aiPreparation
    };
  } catch (error) {
    logger.error("Exception processing merchant intake", { error: error instanceof Error ? error.message : String(error) });
    return { success: false, status: "received", validation, documentUploads: [], error: "Internal error" };
  }
}

export async function updateSubmissionStatus(
  applicationId: string,
  status: BusinessApplicationUpdate["status"],
  metadataPatch?: Json
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();
    const payload: BusinessApplicationUpdate = {
      status,
      ...(metadataPatch ? { metadata: metadataPatch } : {})
    };
    const { error } = await supabase.from("business_applications").update(payload).eq("id", applicationId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getSubmissionStatus(applicationId: string): Promise<{ snapshot?: SubmissionStatusSnapshot; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();
    const { data, error } = await supabase
      .from("business_applications")
      .select("id,status,progress_step,submitted_at,updated_at,metadata")
      .eq("id", applicationId)
      .single();

    if (error) return { error: error.message };

    const metadata = isRecord(data.metadata) ? data.metadata as Record<string, any> : {};
    const intake = isRecord(metadata.intake) ? metadata.intake : {};
    return {
      snapshot: {
        applicationId: data.id,
        status: data.status,
        progressStep: data.progress_step,
        submittedAt: data.submitted_at,
        updatedAt: data.updated_at,
        validationErrors: Array.isArray(intake.validationErrors) ? intake.validationErrors as any : [],
        lifecycleStatus: typeof intake.status === "string" ? intake.status as any : "submitted"
      }
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function isJsonObject(value: unknown): value is Record<string, Json> {
  return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function serializeValidationMessages(messages: Array<{ field: string; code: string; message: string }>): Json {
  return messages.map((item) => ({
    field: item.field,
    code: item.code,
    message: item.message
  }));
}
