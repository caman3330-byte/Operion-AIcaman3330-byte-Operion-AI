"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DataDetail, DataRecord, DataSource } from "@/lib/data-prospects/types";
import { ManualDataUpload } from "./manual-data-upload";
import { AcquireData } from "./acquire-data";

const statuses = ["imported", "enriching", "enriched", "missing_contact", "verified", "duplicate", "ready_for_outreach"];
const emptyFilters = { q: "", status: "", industry: "", state: "", provider: "", has_email: "", has_phone: "", verified: "", from: "", to: "" };
type ListResult = { data: DataRecord[]; pagination: { page: number; page_size: number; total: number; total_pages: number }; stats?: { enriched: number; pending: number } };
export function readable(value?: string | null) { if (!value) return ""; return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
export function displayDate(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "Unavailable" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); }
export async function readResponse(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : payload.error?.message ?? "The request could not be completed. Please retry.");
  return payload;
}

export function DataWorkspace({ source }: { source: DataSource }) {
  const [searchQ, setSearchQ] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DataRecord | null>(null);
  const [detail, setDetail] = useState<DataDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const refresh = () => setRevision((value) => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    const query = new URLSearchParams({ source, page: String(page), page_size: "25", ...(searchQ ? { q: searchQ } : {}) });
    fetch(`/api/data?${query}`, { signal: controller.signal, cache: "no-store" }).then(readResponse).then((payload: ListResult) => {
      if (controller.signal.aborted) return;
      if (page > 1 && page > Math.max(1, payload.pagination.total_pages)) { setPage(Math.max(1, payload.pagination.total_pages)); return; }
      setResult(payload);
    }).catch((failure: unknown) => { if (!controller.signal.aborted) { setResult(null); setError(failure instanceof Error ? failure.message : "Business data is unavailable."); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [source, searchQ, page, revision]);

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

  async function promote() {
    if (!detail || detail.record_kind !== "prospect") return;
    setPromoting(true); setDetailError(null);
    try {
      await readResponse(await fetch(`/api/data/${detail.id}/promote`, { method: "POST" }));
      refresh();
      const updated = await fetch(`/api/data/${detail.id}?kind=prospect`, { cache: "no-store" });
      const payload = await readResponse(updated) as { data: DataDetail };
      setDetail(payload.data);
    } catch (failure) { setDetailError(failure instanceof Error ? failure.message : "Promotion failed. Please retry."); }
    finally { setPromoting(false); }
  }

  function handleSearch(event: FormEvent) { event.preventDefault(); setPage(1); }
  // Stats now come from real database counts via API response
  const stats = result ? {
    total: result.pagination.total,
    enriched: result.stats?.enriched ?? 0,
    pending: result.stats?.pending ?? 0
  } : { total: 0, enriched: 0, pending: 0 };
  return <div className="space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Merchant acquisition</p><h1 className="mt-1 text-2xl font-semibold">Data</h1><p className="mt-2 text-sm text-muted-foreground">Research and verify business information.</p></header>
    <nav aria-label="Data sources" className="flex gap-6 border-b border-border">
      <Link href="/data" aria-current={source === "ai" ? "page" : undefined} className={`border-b-2 pb-3 text-sm font-semibold ${source === "ai" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>AI Acquired</Link>
      <Link href="/data/manual-upload" aria-current={source === "manual" ? "page" : undefined} className={`border-b-2 pb-3 text-sm font-semibold ${source === "manual" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>Manual Upload</Link>
    </nav>
    {source === "manual" ? <ManualDataUpload revision={revision} onImported={() => { setPage(1); refresh(); }} /> : <AcquireData onAcquired={() => { setPage(1); refresh(); }} />}
    <section className="grid gap-4 md:grid-cols-4"><div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Total Acquired</p><p className="mt-2 text-2xl font-semibold">{stats.total.toLocaleString()}</p></div><div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Enriched</p><p className="mt-2 text-2xl font-semibold text-green-600">{stats.enriched.toLocaleString()}</p></div><div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Pending Enrichment</p><p className="mt-2 text-2xl font-semibold text-amber-600">{stats.pending.toLocaleString()}</p></div><div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Ready for Outreach</p><p className="mt-2 text-2xl font-semibold">{(stats.enriched).toLocaleString()}</p></div></section>
    <section aria-label="Business records" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{source === "ai" ? "Acquired businesses" : "Uploaded businesses"}</h2><Button variant="outline" size="sm" onClick={refresh} disabled={loading}><RefreshCw className="h-3.5 w-3.5" />Refresh</Button></div>
      <form onSubmit={handleSearch} className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search businesses" placeholder="Search business, address, phone, or email" value={searchQ} onChange={(event) => setSearchQ(event.target.value)} className="pl-9" maxLength={200} /></div><Button type="submit" variant="secondary">Search</Button>{searchQ && <Button type="button" variant="ghost" onClick={() => { setSearchQ(""); setPage(1); }}>Clear</Button>}</form>
      {error ? <div role="alert" className="rounded-md border border-destructive/30 p-4 text-sm"><p>{error}</p><Button className="mt-3" variant="outline" size="sm" onClick={refresh}>Try again</Button></div> : null}
      {loading ? <p role="status" className="rounded-md border border-border p-10 text-center text-sm text-muted-foreground">Loading businesses…</p> : result ? <div className="rounded-md border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto"><Table><TableHeader><TableRow>{["Business", "Industry", "Location", "Email", "Phone", "Source", "Status"].map((title) => <TableHead key={title}>{title}</TableHead>)}</TableRow></TableHeader><TableBody>
          {result.data.length ? result.data.map((record) => <TableRow key={`${record.record_kind}-${record.id}`}><TableCell className="min-w-40"><button className="text-left font-medium text-primary hover:underline" onClick={() => setSelected(record)}>{record.business_name}</button></TableCell><TableCell>{record.industry || <Missing />}</TableCell><TableCell className="min-w-40"><span>{[record.city, record.state].filter(Boolean).join(", ") || <Missing />}</span></TableCell><TableCell>{record.email || <Missing />}</TableCell><TableCell className="whitespace-nowrap">{record.phone || <Missing />}</TableCell><TableCell>{source === "manual" ? "Manual" : readable(record.provider)}</TableCell><TableCell><Status value={record.status} /></TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">{searchQ ? "No businesses match your search." : source === "manual" ? "Upload a CSV or XLSX file to add your first prospects." : "No acquired businesses yet."}</TableCell></TableRow>}
        </TableBody></Table></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground"><span>{result.pagination.total ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, result.pagination.total)} of ${result.pagination.total}` : "0 records"}</span><div className="flex items-center gap-3"><Button variant="outline" size="sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button><span>Page {page} of {Math.max(1, result.pagination.total_pages)}</span><Button variant="outline" size="sm" aria-label="Next page" disabled={page >= result.pagination.total_pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>
      </div> : null}
    </section>
    <Dialog open={Boolean(selected)} onOpenChange={(open: boolean) => { if (!open && !enriching && !promoting) { setSelected(null); setDetail(null); } }}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{selected?.business_name ?? "Business details"}</DialogTitle><DialogDescription>Full information and source history.</DialogDescription></DialogHeader>
      {detailError ? <p role="alert" className="text-sm text-destructive">{detailError}</p> : null}
      {!detail && !detailError ? <p role="status">Loading details…</p> : null}
      {detail ? <><div className="flex flex-wrap items-center gap-3"><Status value={detail.status} /><Button className="ml-auto" variant="outline" size="sm" disabled={enriching || promoting || detail.enrichment_status === "enriching"} onClick={() => void enrich()}>{enriching ? "Enriching…" : "Enrich"}</Button>{detail.record_kind === "prospect" && !detail.lead_id ? <Button size="sm" disabled={promoting || enriching} onClick={() => void promote()}>{promoting ? "Promoting…" : "Promote to Leads"}</Button> : null}</div>
        <dl className="grid gap-3 sm:grid-cols-2 text-sm">{[["Industry", detail.industry], ["Address", detail.address], ["City", detail.city], ["State", detail.state], ["ZIP", detail.zip], ["Phone", detail.phone], ["Email", detail.email], ["Website", detail.website_url], ["Source", detail.source === "manual" ? "Manual Upload" : "AI Acquired"], ["Status", readable(detail.enrichment_status)]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground font-medium">{label}</dt><dd className="mt-0.5 break-words">{value || <span className="text-xs text-muted-foreground">Not available</span>}</dd></div>)}</dl>
      </> : null}
    </DialogContent></Dialog>
  </div>;
}

function Missing() { return <span className="text-xs text-muted-foreground">Not available</span>; }
function Status({ value }: { value?: string | null }) { if (!value) return <Missing />; return <Badge variant={value === "verified" || value === "enriched" ? "success" : value === "missing_contact" || value === "duplicate" ? "warning" : "secondary"}>{readable(value)}</Badge>; }
