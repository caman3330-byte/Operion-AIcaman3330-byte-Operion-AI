"use client";

import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, CheckCircle2, FileText, ShieldCheck, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { DOCUMENT_TYPE_OPTIONS } from "@/lib/documents/processing";
import { cn } from "@/lib/utils";
import type { DocumentRecord } from "@operion/shared";

const primaryDocumentTypes = DOCUMENT_TYPE_OPTIONS.filter((option) =>
  ["bank_statements", "voided_checks", "driver_license", "processing_statements"].includes(option.value)
);

interface DocumentUploadFormProps {
  applicationId: string;
  documents: DocumentRecord[];
  merchantToken?: string;
  variant?: "customer" | "portal";
}

export function DocumentUploadForm({ applicationId, documents, merchantToken, variant = "customer" }: DocumentUploadFormProps) {
  const [selectedDocumentType, setSelectedDocumentType] = useState<string>(primaryDocumentTypes[0]?.value ?? "bank_statements");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [uploadedDocuments, setUploadedDocuments] = useState<DocumentRecord[]>([]);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveDocuments = useMemo(() => {
    if (uploadedDocuments.length === 0) return documents;
    return [...documents, ...uploadedDocuments];
  }, [documents, uploadedDocuments]);

  const documentsByType = useMemo(
    () =>
      primaryDocumentTypes.map((requested) => ({
        ...requested,
        record: effectiveDocuments.find((document) => document.document_type === requested.value) ?? null
      })),
    [effectiveDocuments]
  );

  const activeDocument = documentsByType.find((item) => item.value === selectedDocumentType);

  function handleFiles(nextFiles: File[]) {
    setFiles(nextFiles);
    setStatus("idle");
    setMessage(null);
    setProgress(0);
  }

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setStatus("idle");
    setMessage(null);

    if (files.length === 0) {
      setStatus("error");
      setMessage("Please choose at least one file before uploading.");
      return;
    }

    setStatus("uploading");
    setProgress(1);

    try {
      const completed: DocumentRecord[] = [];
      for (let index = 0; index < files.length; index += 1) {
        const currentFile = files[index]!;
        const formData = new FormData();
        formData.append("file", currentFile);
        formData.append("document_type", selectedDocumentType);
        formData.append("business_application_id", applicationId);
        if (merchantToken) {
          formData.append("merchant_token", merchantToken);
        }
        const result = await uploadWithProgress(formData, (value) => {
          const base = (index / files.length) * 100;
          const current = value / files.length;
          setProgress(Math.max(1, Math.min(100, Math.round(base + current))));
        });
        completed.push(result.data.document);
      }
      setUploadedDocuments((current) => [...current, ...completed]);
      setStatus("success");
      setMessage(
        completed.length === 1
          ? "Upload complete. Your document is now available for private funding review."
          : `${completed.length} uploads complete. Your documents are now available for private funding review.`
      );
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-card/80 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white">{variant === "portal" ? "Secure upload" : "Upload documents"}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Submit bank statements, voided checks, driver license, and processing statements through 256-bit encrypted uploads and
            secure signed-access document handling.
          </p>
        </div>
        <ShieldCheck className="h-5 w-5 text-primary" />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {documentsByType.map((item) => (
          <div key={item.value} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.025] px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.record?.file_name ?? "Awaiting upload"}</p>
            </div>
            <div className="shrink-0 rounded-full bg-white/5 px-2 py-1 text-xs text-muted-foreground">{item.record ? item.record.status : "pending"}</div>
          </div>
        ))}
      </div>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <div className="max-w-md space-y-2">
          <Label htmlFor="document_type">Document type</Label>
          <Select id="document_type" value={selectedDocumentType} onChange={(event) => setSelectedDocumentType(event.target.value)}>
            {documentsByType.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            handleFiles(Array.from(event.dataTransfer.files ?? []));
          }}
          className={cn(
            "flex min-h-44 w-full flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.025] px-6 py-8 text-center transition",
            isDragging ? "border-primary/70 bg-primary/10" : "hover:border-primary/40 hover:bg-white/[0.045]"
          )}
        >
          <UploadCloud className="h-8 w-8 text-primary" />
          <span className="mt-4 text-sm font-semibold text-white">
            {files.length > 0 ? `${files.length} file${files.length === 1 ? "" : "s"} selected` : "Drop files here or choose from your device"}
          </span>
          <span className="mt-2 text-xs text-muted-foreground">PDF, PNG, JPG, XLS, or XLSX up to 50MB each / private lender review</span>
        </button>

        <input
          ref={fileInputRef}
          id="document_file"
          type="file"
          multiple
          className="hidden"
          onChange={(event) => handleFiles(Array.from(event.target.files ?? []))}
          accept="application/pdf,image/png,image/jpeg,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        />

        {files.length > 0 ? (
          <div className="space-y-2">
            {files.map((selectedFile) => (
              <div key={`${selectedFile.name}-${selectedFile.size}`} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.035] p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">{Math.max(1, Math.round(selectedFile.size / 1024))} KB</p>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => handleFiles([])}>
                <X className="h-4 w-4" />
                Clear files
              </Button>
            </div>
          </div>
        ) : null}

        {status === "success" ? (
          <div className="rounded-lg border border-primary/25 bg-primary/10 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-white">Documents received</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Operion Capital will continue funding analysis, prepare your file for private lender review, and contact you if
                  anything else is needed. Most document reviews begin within one business day.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">Support: support@operioncapital.com</p>
              </div>
            </div>
          </div>
        ) : null}

        {status === "uploading" ? (
          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">Uploading securely... {progress}%</p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={status === "uploading"}>
            {status === "uploading" ? "Uploading..." : files.length > 1 ? "Upload documents" : "Upload document"}
          </Button>
          {activeDocument?.record?.file_name ? (
            <div className="self-center text-sm text-muted-foreground">Latest: {activeDocument.record.file_name}</div>
          ) : null}
        </div>

        {message ? (
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              status === "success" ? "border-emerald-500 bg-emerald-500/10 text-emerald-200" : "border-rose-500 bg-rose-500/10 text-rose-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {status === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <span>{message}</span>
            </div>
          </div>
        ) : null}

        {uploadedDocuments.length > 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <p>
                {uploadedDocuments.length} document{uploadedDocuments.length === 1 ? "" : "s"} uploaded for private funding review.
              </p>
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}

function uploadWithProgress(formData: FormData, onProgress: (value: number) => void) {
  return new Promise<{ data: { document: DocumentRecord } }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents/upload");
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))));
    };
    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(parsed.error?.message ?? "Upload failed"));
          return;
        }
        onProgress(100);
        resolve(parsed);
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(formData);
  });
}
