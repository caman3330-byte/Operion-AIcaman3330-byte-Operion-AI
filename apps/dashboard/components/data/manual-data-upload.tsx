"use client";

import { useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Preview = {
  preview_id: string;
  filename: string;
  rows_detected: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  missing_email: number;
  missing_phone: number;
  ready_for_outreach: number;
  sample_rows: Array<{
    row_number: number;
    status: "valid" | "invalid" | "duplicate";
    errors?: string[];
    business_name?: string;
    address?: string;
    city?: string;
    state?: string;
    email?: string;
    phone?: string;
    owner_name?: string;
  }>;
};

export function ManualDataUpload({ revision, onImported }: { revision: number; onImported: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importedMessage, setImportedMessage] = useState<string | null>(null);

  async function previewFile(file: File) {
    setLoading(true);
    setMessage(null);
    setPreview(null);
    setImportedMessage(null);
    setSelectedFile(file);
    setFileName(file.name);

    const form = new FormData();
    form.set("file", file);

    try {
      const response = await fetch("/api/data/csv-preview", {
        method: "POST",
        body: form
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : payload.error?.message ?? "The import preview could not be generated."
        );
      }

      setPreview(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The import preview could not be generated.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmImport() {
    if (!selectedFile || !preview) return;
    setImporting(true);
    setMessage(null);
    setImportedMessage(null);
    const form = new FormData();
    form.set("file", selectedFile);
    form.set("confirm", "true");
    form.set("preview_id", preview.preview_id);
    try {
      const response = await fetch("/api/data/csv-upload", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "The DATA import could not be confirmed.");
      setImportedMessage(payload.message ?? "DATA import confirmed.");
      setSelectedFile(null);
      onImported();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The DATA import could not be confirmed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload a CSV or XLSX file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void previewFile(file);
              event.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => fileInput.current?.click()} disabled={loading}>
              <Upload className="h-4 w-4" />
              {loading ? "Reading file…" : "Choose CSV or XLSX"}
            </Button>
            <span className="text-sm text-muted-foreground">{fileName ?? "Maximum 5 MB and 5,000 rows"}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Supported columns: Business Name, Owner Name, Address, City, State, ZIP, Website, Phone, and Email. Business Name is required; email and
            phone are flagged when missing but do not reject a business.
          </p>
          {message ? (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {preview ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric label="Rows" value={preview.rows_detected} detail={`${preview.valid_rows} valid`} />
            <Metric label="Duplicates" value={preview.duplicate_rows} detail="Within this file" tone="warning" />
            <Metric label="Missing email" value={preview.missing_email} detail={`${preview.ready_for_outreach} contact-ready`} />
            <Metric
              label="Missing phone"
              value={preview.missing_phone}
              detail={`${preview.invalid_rows} invalid`}
              tone={preview.invalid_rows ? "danger" : "default"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Preview: {preview.filename}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">The file was parsed without writing records or sending messages.</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.sample_rows.map((row) => (
                    <TableRow key={row.row_number}>
                      <TableCell>{row.row_number}</TableCell>
                      <TableCell>{row.business_name || "—"}</TableCell>
                      <TableCell>{[row.address, row.city, row.state].filter(Boolean).join(", ") || "—"}</TableCell>
                      <TableCell>{row.email ?? row.phone ?? "Missing"}</TableCell>
                      <TableCell>{row.owner_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.status === "valid" ? "success" : row.status === "duplicate" ? "warning" : "destructive"
                          }
                        >
                          {row.errors?.[0] ?? row.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Import safeguard</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Review the sample rows before confirming. Confirmation queues DATA rows only; it does not create leads, applications, or outreach messages.
              </p>
              <Button className="mt-4" onClick={() => void confirmImport()} disabled={importing || !selectedFile}>
                {importing ? "Confirming import…" : "Confirm DATA import"}
              </Button>
              {importedMessage ? <p className="mt-3 text-sm text-green-700">{importedMessage}</p> : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  tone = "default"
}: {
  label: string;
  value: number;
  detail: string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p
          className={
            tone === "danger"
              ? "mt-2 text-2xl font-semibold text-destructive"
              : "mt-2 text-2xl font-semibold"
          }
        >
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
