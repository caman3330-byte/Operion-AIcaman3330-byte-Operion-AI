"use client";

import { useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Preview = {
  sheet_name: string;
  columns: string[];
  counts: { total: number; valid: number; duplicate: number; invalid: number; missing_email: number; missing_phone: number; ready_for_outreach: number };
  rows: Array<{ row_number: number; status: "valid" | "invalid" | "duplicate"; duplicate_reason: string | null; errors: string[]; business_name: string; city: string | null; state: string | null; email: string | null; phone: string | null }>;
};

export function ManualAcquisitionImportPanel() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function previewFile(file: File) {
    setLoading(true); setMessage(null); setPreview(null); setFileName(file.name);
    const form = new FormData(); form.set("file", file);
    try {
      const response = await fetch("/api/acquisition/manual-import/preview", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message ?? "The import preview could not be generated.");
      setPreview(payload.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The import preview could not be generated.");
    } finally { setLoading(false); }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Merchant Pipeline</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-normal">Prospect File Import</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Upload a CSV or XLSX file to preview normalization, missing contact details, and duplicates. Previewing never creates leads or sends outreach.</p>
      </div>
      <Badge variant="warning">Preview only</Badge>
    </div>

    <Card>
      <CardHeader><CardTitle>Upload a prospect list</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <input ref={fileInput} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void previewFile(file); event.target.value = ""; }} />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => fileInput.current?.click()} disabled={loading}><Upload className="h-4 w-4" />{loading ? "Reading file…" : "Choose CSV or XLSX"}</Button>
          <span className="text-sm text-muted-foreground">{fileName ?? "Maximum 5 MB and 5,000 rows"}</span>
        </div>
        <p className="text-xs text-muted-foreground">Supported columns: Business Name, Address, City, State, ZIP, Website, Phone, and Email. Business Name is required; email and phone are flagged when missing but do not reject a business.</p>
        {message ? <p className="flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4" />{message}</p> : null}
      </CardContent>
    </Card>

    {preview ? <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Rows" value={preview.counts.total} detail={`${preview.counts.valid} valid`} />
        <Metric label="Duplicates" value={preview.counts.duplicate} detail="Within this file" tone="warning" />
        <Metric label="Missing email" value={preview.counts.missing_email} detail={`${preview.counts.ready_for_outreach} email-ready`} />
        <Metric label="Missing phone" value={preview.counts.missing_phone} detail={`${preview.counts.invalid} invalid`} tone={preview.counts.invalid ? "danger" : "default"} />
      </div>
      <Card>
        <CardHeader><CardTitle>Preview: {preview.sheet_name}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Detected columns: {preview.columns.join(", ")}</p>
          <Table><TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Business</TableHead><TableHead>Location</TableHead><TableHead>Contact</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>
            {preview.rows.map((row) => <TableRow key={row.row_number}><TableCell>{row.row_number}</TableCell><TableCell>{row.business_name || "—"}</TableCell><TableCell>{[row.city, row.state].filter(Boolean).join(", ") || "—"}</TableCell><TableCell>{row.email ?? row.phone ?? "Missing"}</TableCell><TableCell><Badge variant={row.status === "valid" ? "success" : row.status === "duplicate" ? "warning" : "destructive"}>{row.status === "duplicate" ? `duplicate: ${row.duplicate_reason}` : row.errors[0] ?? row.status}</Badge></TableCell></TableRow>)}
          </TableBody></Table>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Import safeguard</CardTitle></CardHeader><CardContent><p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" />Confirmation is intentionally unavailable until the batch migration and database-level duplicate transaction are applied and verified in staging. No records or messages have been created from this preview.</p></CardContent></Card>
    </> : null}
  </div>;
}

function Metric({ label, value, detail, tone = "default" }: { label: string; value: number; detail: string; tone?: "default" | "warning" | "danger" }) {
  return <Card><CardContent className="pt-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className={tone === "danger" ? "mt-2 text-2xl font-semibold text-destructive" : "mt-2 text-2xl font-semibold"}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}
