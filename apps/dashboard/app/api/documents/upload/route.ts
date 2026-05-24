import { Buffer } from "buffer";
import type { Json } from "@operion/shared";
import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { enqueueFundingEmail } from "@/lib/integrations/email-automation";
import { validateMerchantUploadToken } from "@/lib/portal/merchant-upload-auth";
import { productionRepository } from "@/lib/repositories/production";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  validateDocumentUpload,
  normalizeDocumentFileName,
  createDocumentStoragePath,
  synthesizeDocumentMetadata,
  getDocumentStorageBucket,
  getDocumentTypeLabel
} from "@/lib/documents/processing";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const documentType = String(formData.get("document_type") ?? "").trim();
    const businessApplicationId = String(formData.get("business_application_id") ?? "").trim();
    const merchantToken = String(formData.get("merchant_token") ?? request.headers.get("x-merchant-upload-token") ?? "").trim();

    if (!file || !(file instanceof Blob) || !documentType || !businessApplicationId) {
      throw new ValidationError("Missing required file upload data");
    }

    const portalAccess = await resolveDocumentUploadAccess(request, businessApplicationId, merchantToken);
    const { actorId, actorEmail, actorRole, application } = portalAccess;

    validateDocumentUpload(file, documentType, businessApplicationId);
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeFileName = normalizeDocumentFileName(file.name);
    const storagePath = createDocumentStoragePath(businessApplicationId, documentType, safeFileName);
    const storageBucket = getDocumentStorageBucket(documentType);

    const { error: uploadError } = await getSupabaseAdmin().storage.from(storageBucket).upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false
    });

    if (uploadError) {
      throw new Error(`Document storage upload failed: ${uploadError.message}`);
    }

    const existingDocument = await productionRepository.getDocumentByType(businessApplicationId, documentType);
    const metadata = synthesizeDocumentMetadata(safeFileName, file.type, buffer.byteLength, documentType);
    const documentPayload = {
      user_id: actorRole === "customer" ? actorId : application.user_id,
      business_application_id: businessApplicationId,
      lead_id: application.lead_id,
      document_type: documentType,
      file_name: safeFileName,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      mime_type: file.type,
      file_size: buffer.byteLength,
      status: "uploaded",
      uploaded_at: new Date().toISOString(),
      notes: `Uploaded by ${actorRole === "merchant_magic_link" ? "merchant magic link" : "customer"} through secure portal.`,
      uploaded_by_role: actorRole,
      processing_status: "pending",
      processing_requested_at: new Date().toISOString(),
      metadata: {
        ...(metadata.metadata as Record<string, Json>),
        storage_bucket: storageBucket,
        uploaded_via: actorRole,
        uploader_email: actorEmail,
        signed_url_only: true
      } as Json
    } as const;

    const shouldUpdateRequestedPlaceholder =
      existingDocument && (existingDocument.status === "requested" || !existingDocument.storage_path);
    const document = shouldUpdateRequestedPlaceholder
      ? await productionRepository.updateDocument(existingDocument.id, documentPayload)
      : await productionRepository.createDocument(documentPayload);

    if (application.status === "documents_pending") {
      const currentMetadata = typeof application.metadata === "object" && application.metadata ? application.metadata : {};
      await productionRepository.updateBusinessApplication(businessApplicationId, {
        status: "underwriting_review",
        metadata: {
          ...currentMetadata,
          document_upload_ready_at: new Date().toISOString(),
          lifecycle_updated_at: new Date().toISOString()
        } as Json
      });

      try {
        await enqueueFundingEmail({
          to: actorEmail,
          subject: "Your funding documents are ready for review",
          text: `Thanks for uploading your ${getDocumentTypeLabel(documentType).toLowerCase()} for application ${application.id}. Our funding review team has moved your application into private review and will notify you after the next update.`,
          lead_id: application.lead_id ?? null,
          email_number: 1,
          purpose: "application_status_update"
        });
      } catch (error) {
        console.warn("document_upload_email_failed", {
          applicationId: application.id,
          userId: actorId,
          error
        });
      }
    }

    await productionRepository.createCrmActivity({
      application_id: null,
      business_application_id: businessApplicationId,
      lead_id: application.lead_id,
      actor_id: actorId,
      actor_type: actorRole,
      activity_type: "document_request",
      subject: `${getDocumentTypeLabel(documentType)} uploaded`,
      body: `${safeFileName} was uploaded through the secure Operion Capital document portal.`,
      metadata: {
        document_id: document.id,
        document_type: documentType,
        storage_bucket: storageBucket,
        storage_path: storagePath,
        signed_url_only: true
      } as Json
    });

    const processingTask = await productionRepository.createAiTask({
      task_type: "document_processing",
      status: "blocked",
      priority: documentType === "bank_statements" || documentType === "processing_statements" ? "high" : "normal",
      lead_id: application.lead_id,
      business_application_id: businessApplicationId,
      assigned_agent: "underwriting_agent",
      input_payload: {
        document_id: document.id,
        document_type: documentType,
        storage_bucket: storageBucket,
        storage_path: storagePath,
        hooks: {
          ocr: "pending",
          bank_statement_parsing: documentType === "bank_statements" ? "pending" : "not_applicable",
          nsf_detection: documentType === "bank_statements" ? "pending" : "not_applicable",
          revenue_analysis: documentType === "bank_statements" || documentType === "processing_statements" ? "pending" : "not_applicable"
        }
      } as Json,
      error_message: "Document AI processing hook registered; OCR/parser worker is not enabled yet.",
      created_by: actorRole === "customer" ? actorId : null
    });

    await productionRepository.createAiTaskLog({
      ai_task_id: processingTask.id,
      status: "blocked",
      message: "Future document AI processing hook registered",
      provider: null,
      model: null,
      metadata: {
        document_id: document.id,
        document_type: documentType,
        storage_bucket: storageBucket,
        future_processors: ["ocr", "bank_statement_parsing", "nsf_detection", "revenue_analysis"]
      } as Json
    });

    await productionRepository.createAuditLog({
      event_type: "document_uploaded",
      actor_id: actorId,
      actor_role: actorRole,
      entity_type: "document",
      entity_id: document.id,
      after_state: document as unknown as Json,
      metadata: {
        business_application_id: businessApplicationId,
        document_type: documentType,
        storage_bucket: storageBucket,
        storage_path: storagePath,
        ai_task_id: processingTask.id
      } as Json
    });

    await writeAuditLog({
      eventType: "document_uploaded",
      actorType: "system",
      actorId,
      entityType: "document",
      entityId: document.id,
      metadata: {
        business_application_id: businessApplicationId,
        document_type: documentType,
        storage_bucket: storageBucket,
        storage_path: storagePath,
        application_status: application.status,
        document_quality: metadata.quality,
        ocr_status: metadata.ocrStatus,
        ai_task_id: processingTask.id
      } as Json
    });

    return NextResponse.json({ data: { document, ai_task: processingTask } }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function resolveDocumentUploadAccess(request: Request, businessApplicationId: string, merchantToken: string) {
  try {
    const actor = await requireCustomer(request);
    const application = await (["staff", "supervisor", "founder", "super_admin", "admin", "operator", "analyst", "workflow"].includes(actor.role)
      ? productionRepository.getBusinessApplication(businessApplicationId)
      : productionRepository.getCustomerBusinessApplication(actor.id, businessApplicationId));

    return {
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role === "workflow" ? "workflow" : "customer",
      application
    };
  } catch {
    if (!merchantToken) {
      throw new ValidationError("A valid customer session or merchant upload link is required.");
    }

    const session = await validateMerchantUploadToken(merchantToken);
    if (session.business_application_id !== businessApplicationId) {
      throw new ValidationError("Upload link does not match this application.");
    }

    return {
      actorId: `merchant:${session.email}`,
      actorEmail: session.email,
      actorRole: "merchant_magic_link",
      application: session.application
    };
  }
}
