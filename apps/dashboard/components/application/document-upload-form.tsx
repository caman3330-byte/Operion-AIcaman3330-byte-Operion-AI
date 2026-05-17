"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { DocumentRecord } from "@operion/shared";

const requestedDocumentTypes = [
  { value: "bank_statements", label: "Bank statements" },
  { value: "business_bank_account", label: "Business bank account" },
  { value: "government_id", label: "Government ID" }
];

interface DocumentUploadFormProps {
  applicationId: string;
  documents: DocumentRecord[];
}

export function DocumentUploadForm({ applicationId, documents }: DocumentUploadFormProps) {
  const [selectedDocumentType, setSelectedDocumentType] = useState<string>(requestedDocumentTypes[0]?.value ?? "bank_statements");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [uploadedDocument, setUploadedDocument] = useState<DocumentRecord | null>(null);

  const effectiveDocuments = useMemo(() => {
    if (!uploadedDocument) {
      return documents;
    }

    return [
      ...documents.filter((document) => document.document_type !== uploadedDocument.document_type),
      uploadedDocument
    ];
  }, [documents, uploadedDocument]);

  const documentsByType = useMemo(
    () =>
      requestedDocumentTypes.map((requested) => ({
        ...requested,
        record: effectiveDocuments.find((document) => document.document_type === requested.value) ?? null
      })),
    [effectiveDocuments]
  );

  const activeDocument = documentsByType.find((item) => item.value === selectedDocumentType);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("idle");
    setMessage(null);

    if (!file) {
      setStatus("error");
      setMessage("Please choose a file before uploading.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("document_type", selectedDocumentType);
    formData.append("business_application_id", applicationId);

    setStatus("uploading");

    try {
      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message ?? "Upload failed");
      }

      setUploadedDocument(result.data.document);
      setStatus("success");
      setMessage("Upload complete. Your document is now available for review.");
      setFile(null);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-card/80 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white">Upload documents</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Submit bank statements and supporting files through the secure merchant onboarding portal.
          </p>
        </div>
        <UploadCloud className="h-5 w-5 text-primary" />
      </div>

      <div className="mt-5 grid gap-3">
        {documentsByType.map((item) => (
          <div key={item.value} className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.025] px-3 py-2">
            <div>
              <p className="text-sm font-semibold text-white">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.record ? item.record.status : "Requested"}</p>
            </div>
            <div className="rounded-full bg-white/5 px-2 py-1 text-xs text-muted-foreground">{item.record ? item.record.status : "pending"}</div>
          </div>
        ))}
      </div>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="document_type">Document type</Label>
            <Select
              id="document_type"
              value={selectedDocumentType}
              onChange={(event) => setSelectedDocumentType(event.target.value)}
            >
              {documentsByType.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="document_file">File</Label>
            <Input
              id="document_file"
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              accept="application/pdf,image/png,image/jpeg"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={status === "uploading"}>
            {status === "uploading" ? "Uploading…" : "Upload document"}
          </Button>
          {activeDocument?.record?.file_name ? (
            <div className="self-center text-sm text-muted-foreground">
              Latest: {activeDocument.record.file_name}
            </div>
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

        {uploadedDocument ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <p>Document uploaded for {uploadedDocument.document_type.replaceAll("_", " ")}.</p>
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}
