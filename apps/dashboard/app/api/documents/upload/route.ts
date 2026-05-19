import { Buffer } from "buffer";
import type { Json } from "@operion/shared";
import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { enqueueFundingEmail } from "@/lib/integrations/email-automation";
import { productionRepository } from "@/lib/repositories/production";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  validateDocumentUpload,
  normalizeDocumentFileName,
  createDocumentStoragePath,
  synthesizeDocumentMetadata
} from "@/lib/documents/processing";

export const dynamic = "force-dynamic";
const DOCUMENT_BUCKET = "documents";

export async function POST(request: Request) {
  try {
    const actor = await requireCustomer(request);
    const formData = await request.formData();
    const file = formData.get("file");
    const documentType = String(formData.get("document_type") ?? "").trim();
    const businessApplicationId = String(formData.get("business_application_id") ?? "").trim();

    if (!file || !(file instanceof Blob) || !documentType || !businessApplicationId) {
      throw new ValidationError("Missing required file upload data");
    }

    validateDocumentUpload(file, documentType, businessApplicationId);
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeFileName = normalizeDocumentFileName(file.name);
    const storagePath = createDocumentStoragePath(businessApplicationId, documentType, safeFileName);

    const { error: uploadError } = await getSupabaseAdmin().storage.from(DOCUMENT_BUCKET).upload(storagePath, buffer, {
      contentType: file.type
    });

    if (uploadError) {
      throw new Error(`Document storage upload failed: ${uploadError.message}`);
    }

    const application = await productionRepository.getCustomerBusinessApplication(actor.id, businessApplicationId);
    const existingDocument = await productionRepository.getDocumentByType(businessApplicationId, documentType);
    const metadata = synthesizeDocumentMetadata(safeFileName, file.type, buffer.byteLength, documentType);
    const documentPayload = {
      user_id: actor.id,
      business_application_id: businessApplicationId,
      lead_id: application.lead_id,
      document_type: documentType,
      file_name: safeFileName,
      storage_path: storagePath,
      mime_type: file.type,
      file_size: buffer.byteLength,
      status: "uploaded",
      uploaded_at: new Date().toISOString(),
      notes: "Uploaded by customer through secure portal.",
      metadata: metadata.metadata as Json
    } as const;

    const document = existingDocument
      ? await productionRepository.updateDocument(existingDocument.id, documentPayload)
      : await productionRepository.createDocument(documentPayload);

    const applicationDocuments = await productionRepository.listDocumentsForApplication(businessApplicationId);
    const requestedDocuments = applicationDocuments.filter((item) =>
      ["requested", "uploaded", "verified"].includes(item.status)
    );
    const readyForReview = requestedDocuments.length > 0 && requestedDocuments.every((item) => item.status === "uploaded" || item.status === "verified");

    if (readyForReview) {
      const currentMetadata = typeof application.metadata === "object" && application.metadata ? application.metadata : {};
      const nextStatus = String(application.status) === "documents_pending" || String(application.status) === "onboarding" ? "ai_review" : "reviewing";
      await productionRepository.updateBusinessApplication(businessApplicationId, {
        status: nextStatus,
        metadata: {
          ...currentMetadata,
          document_upload_ready_at: new Date().toISOString()
        } as Json
      });

      try {
        await enqueueFundingEmail({
          to: actor.email,
          subject: "Your funding documents are ready for review",
          text: `Thanks for uploading your documents for application ${application.id}. Our underwriting team has moved your application back into review and will notify you after the next update.`,
          lead_id: application.lead_id ?? null,
          email_number: 1
        });
      } catch (error) {
        console.warn("document_upload_email_failed", {
          applicationId: application.id,
          userId: actor.id,
          error
        });
      }
    }

    await writeAuditLog({
      eventType: "document_uploaded",
      actorType: "system",
      actorId: actor.id,
      entityType: "document",
      entityId: document.id,
      metadata: {
        business_application_id: businessApplicationId,
        document_type: documentType,
        storage_path: storagePath,
        application_status: application.status,
        document_quality: metadata.quality,
        ocr_status: metadata.ocrStatus
      } as Json
    });

    return NextResponse.json({ data: { document } }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
