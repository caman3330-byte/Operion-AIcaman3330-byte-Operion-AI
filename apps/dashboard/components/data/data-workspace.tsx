"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DataDetail, DataRecord, DataSource } from "@/lib/data-prospects/types";
import { ManualDataUpload } from "./manual-data-upload";
import { AcquireData } from "./acquire-data";

const statuses = ["imported", "enriching", "enriched", "missing_contact", "verified", "duplicate", "ready_for_outreach"];
const emptyFilters = { q: "", status: "", industry: "", state: "", provider: "", has_email: "", has_phone: "", verified: "", from: "", to: "" };
type ListResult = { data: DataRecord[]; pagination: { page: number; page_size: number; total: number; total_pages: number } };
export function readable(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
export function displayDate(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "Unavailable" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); }
export async function readResponse(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : payload.error?.message ?? "The request could not be completed. Please retry.");
  return payload;
}

export function DataWorkspace({ source }: { source: DataSource }) {
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DataRecord | null>(null);
  const [detail, setDetail] = useState<DataDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const refresh = () => setRevision((value) => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    const query = new URLSearchParams({ source, page: String(page), page_size: "25" });
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value.trim());
    fetch(`/api/data?${query}`, { signal: controller.signal, cache: "no-store" }).then(readResponse).then((payload: ListResult) => {
      if (controller.signal.aborted) return;
      if (page > 1 && page > Math.max(1, payload.pagination.total_pages)) { setPage(Math.max(1, payload.pagination.total_pages)); return; }
      setResult(payload);
    }).catch((failure: unknown) => { if (!controller.signal.aborted) { setResult(null); setError(failure instanceof Error ? failure.message : "Business data is unavailable."); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [source, filters, page, revision]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setDetail(null); setDetailError(null);
    fetch(`/api/data/${selected.id}?kind=${selected.record_kind}`, { signal: controller.signal, cache: "no-store" }).then(readResponse).then((payload: { data: DataDetail }) => { if (!controller.signal.aborted) setDetail(payload.data); }).catch((failure: unknown) => { if (!controller.signal.aborted) setDetailError(failure instanceof Error ? failure.message : "Details could not be loaded."); });
    return () => controller.abort();
  }, [selected, revision]);

  async function enrich() {
    if (!detail) return;
    setEnriching(true); setDetailError(null);
    try { await readResponse(await fetch(`/api/data/${detail.id}/enrich?kind=${detail.record_kind}`, { method: "POST" })); refresh(); }
    catch (failure) { setDetailError(failure instanceof Error ? failure.message : "Enrichment failed. Please retry."); }
    finally { setEnriching(false); }
  }

  function applyFilters(event: FormEvent) { event.preventDefault(); setFilters({ ...draft }); setPage(1); }
  const filtered = Object.values(filters).some(Boolean);
  return <div className="space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Merchant acquisition</p><h1 className="mt-1 text-2xl font-semibold">Data</h1><p className="mt-2 text-sm text-muted-foreground">Business information before qualification. Import, find contact details, and review each prospect.</p></header>
    <nav aria-label="Data sources" className="flex gap-6 border-b border-border">
      <Link href="/data" aria-current={source === "ai" ? "page" : undefined} className={`border-b-2 pb-3 text-sm font-semibold ${source === "ai" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>AI Acquired</Link>
      <Link href="/data/manual-upload" aria-current={source === "manual" ? "page" : undefined} className={`border-b-2 pb-3 text-sm font-semibold ${source === "manual" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>Manual Upload</Link>
    </nav>
    {source === "manual" ? <ManualDataUpload revision={revision} onImported={() => { setPage(1); refresh(); }} /> : <AcquireData onAcquired={() => { setPage(1); refresh(); }} />}
    <section aria-label="Business records" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{source === "ai" ? "Acquired businesses" : "Uploaded businesses"}</h2><p className="text-xs text-muted-foreground">{loading ? "Loading records…" : result ? `${result.pagination.total.toLocaleString()} ${filtered ? "matching " : ""}businesses` : "Records unavailable"}</p></div><Button variant="outline" size="sm" onClick={refresh} disabled={loading}><RefreshCw className="h-3.5 w-3.5" />Refresh</Button></div>
      <form onSubmit={applyFilters} className="space-y-3 rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap gap-3"><div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search businesses" placeholder="Search business, address, phone, or email" value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} className="pl-9" maxLength={200} /></div><Button type="submit" variant="secondary">Search / apply filters</Button><Button type="button" variant="ghost" onClick={() => { setDraft(emptyFilters); setFilters(emptyFilters); setPage(1); }}>Clear</Button></div>
        <details><summary className="cursor-pointer text-sm text-muted-foreground">Filters{filtered ? " · applied" : ""}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Filter label="Status"><Select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{readable(status)}</option>)}</Select></Filter>
          <Filter label="Industry"><Input value={draft.industry} placeholder="e.g. Roofing" maxLength={120} onChange={(event) => setDraft({ ...draft, industry: event.target.value })} /></Filter>
          <Filter label="State"><Input value={draft.state} placeholder="e.g. TX" maxLength={80} onChange={(event) => setDraft({ ...draft, state: event.target.value })} /></Filter>
          {source === "ai" ? <Filter label="Source provider"><Select value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value })}><option value="">All providers</option><option value="google_places">Google Places</option><option value="apollo">Apollo</option><option value="company_websites">Company websites</option><option value="public_business_directories">Public directories</option><option value="chamber_directories">Chambers</option><option value="industry_associations">Industry associations</option><option value="public_local_listings">Local listings</option></Select></Filter> : null}
          <Filter label="Email"><Select value={draft.has_email} onChange={(event) => setDraft({ ...draft, has_email: event.target.value })}><option value="">Any email availability</option><option value="true">Has email</option><option value="false">Missing email</option></Select></Filter>
          <Filter label="Phone"><Select value={draft.has_phone} onChange={(event) => setDraft({ ...draft, has_phone: event.target.value })}><option value="">Any phone availability</option><option value="true">Has phone</option><option value="false">Missing phone</option></Select></Filter>
          <Filter label="Verification"><Select value={draft.verified} onChange={(event) => setDraft({ ...draft, verified: event.target.value })}><option value="">All records</option><option value="true">Verified only</option><option value="false">Not verified</option></Select></Filter>
          <Filter label="Acquired from (UTC)"><Input type="date" value={draft.from} max={draft.to || undefined} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></Filter>
          <Filter label="Acquired through (UTC)"><Input type="date" value={draft.to} min={draft.from || undefined} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></Filter>
        </div></details>
      </form>
      {error ? <div role="alert" className="rounded-md border border-destructive/30 p-4 text-sm"><p>{error}</p><Button className="mt-3" variant="outline" size="sm" onClick={refresh}>Try again</Button></div> : null}
      {loading ? <p role="status" className="rounded-md border border-border p-10 text-center text-sm text-muted-foreground">Loading businesses…</p> : result ? <div className="rounded-md border border-border bg-card">
        <Table><TableHeader><TableRow>{["Business", "Industry", "Location", "Phone", "Email", "Source", "Status", "Date", "Actions"].map((title) => <TableHead key={title}>{title}</TableHead>)}</TableRow></TableHeader><TableBody>
          {result.data.length ? result.data.map((record) => <TableRow key={`${record.record_kind}-${record.id}`}><TableCell className="min-w-40"><button className="text-left font-medium text-primary hover:underline" onClick={() => setSelected(record)}>{record.business_name}</button></TableCell><TableCell>{record.industry || <Missing />}</TableCell><TableCell className="min-w-40"><span>{[record.city, record.state].filter(Boolean).join(", ") || record.address || <Missing />}</span></TableCell><TableCell className="whitespace-nowrap">{record.phone || <Missing />}</TableCell><TableCell>{record.email || <Missing />}</TableCell><TableCell>{source === "manual" ? "Manual Upload" : readable(record.provider)}</TableCell><TableCell><Status value={record.status} /></TableCell><TableCell className="whitespace-nowrap">{displayDate(record.created_at)}</TableCell><TableCell><Button variant="ghost" size="sm" aria-label={`View ${record.business_name}`} onClick={() => setSelected(record)}>View</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={9} className="py-12 text-center text-muted-foreground">{filtered ? "No businesses match these filters. Adjust or clear the filters." : source === "manual" ? "Upload a CSV or XLSX file to add your first prospects." : "No acquired businesses yet. Use Find businesses to start."}</TableCell></TableRow>}
        </TableBody></Table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground"><span>{result.pagination.total ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, result.pagination.total)} of ${result.pagination.total}` : "0 records"}</span><div className="flex items-center gap-3"><Button variant="outline" size="sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button><span>Page {page} of {Math.max(1, result.pagination.total_pages)}</span><Button variant="outline" size="sm" aria-label="Next page" disabled={page >= result.pagination.total_pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>
      </div> : null}
    </section>
    <Dialog open={Boolean(selected)} onOpenChange={(open: boolean) => { if (!open && !enriching) { setSelected(null); setDetail(null); } }}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{selected?.business_name ?? "Business details"}</DialogTitle><DialogDescription>Available business information and its source history.</DialogDescription></DialogHeader>
      {detailError ? <p role="alert" className="text-sm text-destructive">{detailError}</p> : null}
      {!detail && !detailError ? <p role="status">Loading details…</p> : null}
      {detail ? <><div className="flex flex-wrap items-center gap-3"><Status value={detail.status} /><span className="text-xs text-muted-foreground">{detail.lead_id ? "Linked to an existing lead" : "Data / prospect"}</span><Button className="ml-auto" variant="outline" size="sm" disabled={enriching || detail.enrichment_status === "enriching" || detail.enrichment_status === "running"} onClick={() => void enrich()}>{enriching ? "Finding details…" : "Enrich business"}</Button></div>
        <p className="text-xs text-muted-foreground">Enrichment looks for public business details. It does not qualify this business or send messages.</p>
        <dl className="grid gap-4 sm:grid-cols-2">{[["Industry", detail.industry], ["Address", detail.address], ["City", detail.city], ["State", detail.state], ["ZIP", detail.zip], ["Phone", detail.phone], ["Email", detail.email], ["Website", detail.website_url], ["Source", detail.source === "manual" ? "Manual Upload" : "AI Acquired"], ["Provider", readable(detail.provider)], ["Verification", detail.verified ? "Verified" : "Not verified"], ["Enrichment", readable(detail.enrichment_status)], ["Acquired", displayDate(detail.created_at)], ["Current stage", readable(detail.state_key ?? "prospect")]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{value || <Missing />}</dd></div>)}</dl>
        {detail.enrichment_error ? <p className="rounded-md border border-border p-3 text-sm">Enrichment result: {detail.enrichment_error}</p> : null}
        {detail.potential_duplicate_of_id ? <p className="text-sm text-amber-400">Potential duplicate of record {detail.potential_duplicate_of_id}.</p> : null}
        <section className="space-y-3 border-t border-border pt-4"><h3 className="font-semibold">Source history</h3>{detail.provenance.length ? detail.provenance.map((entry, index) => <div key={`${entry.batch_code}-${entry.row_number}-${index}`} className="rounded-md border border-border p-3 text-sm"><p className="font-medium">{entry.source === "manual" ? "Manual Upload" : "AI Acquired"} · {readable(entry.provider)}</p><p className="mt-1 break-words text-muted-foreground">{[entry.original_filename, entry.batch_code, entry.row_number ? `Original row ${entry.row_number}` : null, displayDate(entry.created_at)].filter(Boolean).join(" · ")}</p>{entry.status ? <p className="mt-1 text-xs">{readable(entry.status)}</p> : null}{entry.raw_payload ? <details className="mt-2"><summary className="cursor-pointer text-xs text-muted-foreground">Original information</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(entry.raw_payload, null, 2)}</pre></details> : null}</div>) : <p className="text-sm text-muted-foreground">No additional source history is available.</p>}</section>
        <details><summary className="cursor-pointer text-xs text-muted-foreground">All source information</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(detail.source_payload, null, 2)}</pre></details>
      </> : null}
    </DialogContent></Dialog>
  </div>;
}

function Missing() { return <span className="text-xs text-muted-foreground">Missing</span>; }
function Status({ value }: { value: string }) { return <Badge variant={value === "verified" || value === "enriched" ? "success" : value === "missing_contact" || value === "duplicate" ? "warning" : "secondary"}>{readable(value)}</Badge>; }
function Filter({ label, children }: { label: string; children: React.ReactNode }) { return <Label className="grid gap-1.5 text-xs text-muted-foreground">{label}{children}</Label>; }
