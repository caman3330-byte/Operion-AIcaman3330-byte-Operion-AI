"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { Lead, LeadStatus, LeadTier } from "@operion/shared";
import { Eye, Search } from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LeadDetailPanel } from "./lead-detail-panel";
import { LeadStatusBadge } from "./lead-status-badge";
import { OverrideModal } from "./override-modal";
import { buildLeadListView } from "@/lib/leads/list-view";

interface LeadsTableProps {
  initialLeads: Lead[];
}

export function LeadsTable({ initialLeads }: LeadsTableProps) {
  const [leads, setLeads] = useState(initialLeads);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [tier, setTier] = useState<LeadTier | "all">("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const view = useMemo(() => buildLeadListView(leads, { query: deferredQuery, status, tier, page }), [leads, deferredQuery, status, tier, page]);

  function openLead(lead: Lead) {
    setSelectedLead(lead);
    setDetailOpen(true);
  }

  function updateLeadState(updated: Lead) {
    setLeads((current) => current.map((lead) => (lead.id === updated.id ? updated : lead)));
    setSelectedLead((current) => (current?.id === updated.id ? updated : current));
  }

  async function approveLead(leadId: string) {
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/leads/${leadId}/approve-distribution`, { method: "POST" });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Unable to approve distribution");
      }
      const { data } = await response.json();
      updateLeadState(data as Lead);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update lead status.");
    }
  }

  async function rejectLead(leadId: string) {
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/leads/${leadId}/override`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "force_archive", reason: "Rejected from supervisor dashboard" })
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Unable to reject lead");
      }
      const { data } = await response.json();
      updateLeadState(data as Lead);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update lead status.");
    }
  }

  async function handleOverrideSuccess(updatedLead: Lead) {
    updateLeadState(updatedLead);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_180px_140px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} className="pl-9" aria-label="Search loaded leads" placeholder="Business, lead ID, contact, phone, or state" />
        </div>
        <Select aria-label="Lead status" value={status} onChange={(event) => { setStatus(event.target.value as LeadStatus | "all"); setPage(1); }}>
          <option value="all">All statuses</option>
          <option value="raw">Raw</option>
          <option value="pending_approval">Pending approval</option>
          <option value="qualified">Qualified</option>
          <option value="reviewing">Reviewing</option>
          <option value="reviewed">Reviewed</option>
          <option value="submitted">Submitted</option>
          <option value="routed">Routed</option>
          <option value="approved">Approved</option>
          <option value="funded">Funded</option>
          <option value="rejected">Rejected</option>
          <option value="nurture">Nurture</option>
          <option value="archived">Archived</option>
        </Select>
        <Select aria-label="Lead tier" value={tier} onChange={(event) => { setTier(event.target.value as LeadTier | "all"); setPage(1); }}>
          <option value="all">All tiers</option>
          <option value="A">Tier A</option>
          <option value="B">Tier B</option>
          <option value="C">Tier C</option>
          <option value="D">Tier D</option>
        </Select>
      </div>

      {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

      <p className="text-xs text-muted-foreground">Searching {leads.length} loaded records (up to the latest 100), not a database-wide lead count.</p>
      {view.total === 0 ? (
        <EmptyState title="No matching loaded leads" description="No loaded records match these filters." />
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">View</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.rows.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <button type="button" className="text-left font-medium text-primary underline-offset-4 hover:underline" onClick={() => openLead(lead)}>{lead.business_name}</button>
                    <div className="text-xs text-muted-foreground">{lead.contact_name ?? "No contact"} - {lead.state ?? "-"}</div>
                  </TableCell>
                  <TableCell>
                    <LeadStatusBadge status={lead.status} tier={lead.tier} />
                  </TableCell>
                  <TableCell>{lead.qualification_score ?? "-"}</TableCell>
                  <TableCell>{formatCurrency(lead.annual_revenue_est)}</TableCell>
                  <TableCell>{formatDateTime(lead.updated_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" aria-label={`View ${lead.business_name}`} onClick={() => openLead(lead)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3" aria-label="Lead pagination">
        <p className="text-sm text-muted-foreground" aria-live="polite">{view.first}-{view.last} of {view.total} matching loaded leads</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={view.page === 1} onClick={() => setPage(view.page - 1)}>Previous</Button>
          <span className="text-sm">{view.page} / {view.pageCount}</span>
          <Button variant="outline" size="sm" disabled={view.page === view.pageCount} onClick={() => setPage(view.page + 1)}>Next</Button>
        </div>
      </div>

      <LeadDetailPanel
        lead={selectedLead}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onOpenOverride={() => setOverrideOpen(true)}
        onApprove={approveLead}
        onReject={rejectLead}
      />
      <OverrideModal
        lead={selectedLead}
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        onSuccess={handleOverrideSuccess}
      />
    </div>
  );
}
