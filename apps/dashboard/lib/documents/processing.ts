import type { Json } from "@operion/shared";

export const ALLOWED_DOCUMENT_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
export const MAX_DOCUMENT_UPLOAD_BYTES = 25 * 1024 * 1024;

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
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type as typeof ALLOWED_DOCUMENT_TYPES[number])) {
    throw new Error("Unsupported file type. Only PDF, PNG, and JPEG files are allowed.");
  }

  const size = file.size;
  if (size === 0 || size > MAX_DOCUMENT_UPLOAD_BYTES) {
    throw new Error("Uploaded document must be between 1 byte and 25MB.");
  }

  if (!businessApplicationId || !documentType) {
    throw new Error("Business application ID and document type are required.");
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

export function synthesizeDocumentMetadata(fileName: string, mimeType: string, fileSize: number, documentType: string): DocumentProcessingMetadata {
  return {
    storagePath: "",
    fileName,
    mimeType,
    fileSize,
    documentType,
    quality: fileSize > 1024 * 200 ? "high" : fileSize > 1024 * 50 ? "medium" : "low",
    ocrStatus: mimeType === "application/pdf" ? "pending" : "skipped",
    metadata: {
      quality: fileSize > 1024 * 200 ? "high" : fileSize > 1024 * 50 ? "medium" : "low",
      ocr_candidate: mimeType === "application/pdf"
    }
  };
}
