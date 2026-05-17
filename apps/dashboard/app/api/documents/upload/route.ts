import { Buffer } from "buffer";
import type { Json } from "@operion/shared";
import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError, ValidationError, NotFoundError } from "@/lib/errors";
import { enqueueFundingEmail } from "@/lib/integrations/email-automation";
import { productionRepository } from "@/lib/repositories/production";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];
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

    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new ValidationError("Unsupported file type. Use PDF or JPG/PNG images.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new ValidationError("Uploaded file must be smaller than 25MB.");
    }

    const application = await productionRepository.getCustomerBusinessApplication(actor.id, businessApplicationId);
    const storagePath = `${businessApplicationId}/${documentType}/${Date.now()}_${encodeURIComponent(file.name)}`;
    const { error: uploadError } = await getSupabaseAdmin().storage.from(DOCUMENT_BUCKET).upload(storagePath, buffer, {
      contentType: file.type
    });

    if (uploadError) {
      throw new Error(`Document storage upload failed: ${uploadError.message}`);
    }

    const existingDocument = await productionRepository.getDocumentByType(businessApplicationId, documentType);
    const documentPayload = {
      user_id: actor.id,
      business_application_id: businessApplicationId,
      lead_id: application.lead_id,
      document_type: documentType,
      file_name: file.name,
      storage_path: storagePath,
      mime_type: file.type,
      file_size: buffer.byteLength,
      status: "uploaded",
      uploaded_at: new Date().toISOString(),
      notes: "Uploaded by customer through secure portal."
    } as const;

    const document = existingDocument
      ? await productionRepository.updateDocument(existingDocument.id, documentPayload)
      : await productionRepository.createDocument(documentPayload);

    const applicationDocuments = await productionRepository.listDocumentsForApplication(businessApplicationId);
    const requestedDocuments = applicationDocuments.filter((item) => item.status === "requested" || item.status === "uploaded" || item.status === "verified");
    const readyForReview = requestedDocuments.length > 0 && requestedDocuments.every((item) => item.status === "uploaded" || item.status === "verified");

    if (readyForReview) {
      const currentMetadata = typeof application.metadata === "object" && application.metadata ? application.metadata : {};
      if (String(application.status) === "documents_pending" || String(application.status) === "onboarding") {
        await productionRepository.updateBusinessApplication(businessApplicationId, {
          status: "ai_review",
          metadata: {
            ...currentMetadata,
            document_upload_ready_at: new Date().toISOString()
          } as Json
        });
      } else if (String(application.status) === "needs_review") {
        await productionRepository.updateBusinessApplication(businessApplicationId, {
          status: "reviewing",
          metadata: {
            ...currentMetadata,
            document_upload_ready_at: new Date().toISOString()
          } as Json
        });
      }

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
        application_status: application.status
      } as Json
    });

    return NextResponse.json({ data: { document } }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
