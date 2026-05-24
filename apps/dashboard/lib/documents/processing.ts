import type { Json } from "@operion/shared";

export const MERCHANT_DOCUMENT_BUCKET = "merchant-documents";
export const UNDERWRITING_DOCUMENT_BUCKET = "underwriting-documents";
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
] as const;
export const MAX_DOCUMENT_UPLOAD_BYTES = 50 * 1024 * 1024;

export const DOCUMENT_TYPE_OPTIONS = [
  { value: "bank_statements", label: "Bank statements", bucket: UNDERWRITING_DOCUMENT_BUCKET },
  { value: "voided_checks", label: "Voided checks", bucket: MERCHANT_DOCUMENT_BUCKET },
  { value: "driver_license", label: "Driver license", bucket: MERCHANT_DOCUMENT_BUCKET },
  { value: "processing_statements", label: "Processing statements", bucket: UNDERWRITING_DOCUMENT_BUCKET },
  { value: "business_bank_account", label: "Business bank account", bucket: MERCHANT_DOCUMENT_BUCKET },
  { value: "government_id", label: "Government ID", bucket: MERCHANT_DOCUMENT_BUCKET }
] as const;

export interface DocumentProcessingMetadata {
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  documentType: string;
  quality: "high" | "medium" | "low";
  ocrStatus: "pending" | "skipped" | "complete";
  metadata: Json;
}

export function validateDocumentUpload(file: Blob, documentType: string, businessApplicationId: string) {
  if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.type as typeof ALLOWED_DOCUMENT_MIME_TYPES[number])) {
    throw new Error("Unsupported file type. Only PDF, PNG, JPEG, XLS, and XLSX files are allowed.");
  }

  const size = file.size;
  if (size === 0 || size > MAX_DOCUMENT_UPLOAD_BYTES) {
    throw new Error("Uploaded document must be between 1 byte and 50MB.");
  }

  if (!businessApplicationId || !documentType) {
    throw new Error("Business application ID and document type are required.");
  }

  if (!DOCUMENT_TYPE_OPTIONS.some((option) => option.value === documentType)) {
    throw new Error("Unsupported document type.");
  }
}

export function normalizeDocumentFileName(fileName: string) {
  const normalized = fileName
    .trim()
    .replace(/[^a-zA-Z0-9.\-_ ]+/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 200);

  return normalized || "document_upload";
}

export function createDocumentStoragePath(businessApplicationId: string, documentType: string, fileName: string) {
  return `${businessApplicationId}/${documentType}/${Date.now()}_${encodeURIComponent(fileName)}`;
}

export function getDocumentStorageBucket(documentType: string) {
  return DOCUMENT_TYPE_OPTIONS.find((option) => option.value === documentType)?.bucket ?? MERCHANT_DOCUMENT_BUCKET;
}

export function getDocumentTypeLabel(documentType: string) {
  return DOCUMENT_TYPE_OPTIONS.find((option) => option.value === documentType)?.label ?? documentType.replaceAll("_", " ");
}

export function synthesizeDocumentMetadata(fileName: string, mimeType: string, fileSize: number, documentType: string): DocumentProcessingMetadata {
  const ocrCandidate = mimeType === "application/pdf" || mimeType === "image/png" || mimeType === "image/jpeg";
  const bankParsingCandidate = documentType === "bank_statements" || documentType === "processing_statements";

  return {
    storagePath: "",
    fileName,
    mimeType,
    fileSize,
    documentType,
    quality: fileSize > 1024 * 200 ? "high" : fileSize > 1024 * 50 ? "medium" : "low",
    ocrStatus: ocrCandidate ? "pending" : "skipped",
    metadata: {
      quality: fileSize > 1024 * 200 ? "high" : fileSize > 1024 * 50 ? "medium" : "low",
      ocr_candidate: ocrCandidate,
      ai_processing_hooks: {
        ocr: ocrCandidate ? "pending" : "skipped",
        bank_statement_parsing: bankParsingCandidate ? "pending" : "not_applicable",
        nsf_detection: bankParsingCandidate ? "pending" : "not_applicable",
        revenue_analysis: bankParsingCandidate ? "pending" : "not_applicable"
      }
    }
  };
}
