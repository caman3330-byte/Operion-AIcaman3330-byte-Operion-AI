"use client";

import { useMemo, useState } from "react";
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

interface LeadsTableProps {
  initialLeads: Lead[];
}

export function LeadsTable({ initialLeads }: LeadsTableProps) {
  const [leads, setLeads] = useState(initialLeads);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [tier, setTier] = useState<LeadTier | "all">("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      const matchesQuery = [lead.business_name, lead.contact_name, lead.email, lead.industry]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query.toLowerCase()));
      const matchesStatus = status === "all" || lead.status === status;
      const matchesTier = tier === "all" || lead.tier === tier;
      return matchesQuery && matchesStatus && matchesTier;
    });
  }, [leads, query, status, tier]);

  function openLead(lead: Lead) {
    setSelectedLead(lead);
    setDetailOpen(true);
  }

  function updateLeadStatus(leadId: string, nextStatus: LeadStatus) {
    setLeads((current) =>
      current.map((lead) =>
        lead.id === leadId
          ? {
              ...lead,
              status: nextStatus,
              distribution_approved_at: nextStatus === "pending_approval" ? null : lead.distribution_approved_at,
              updated_at: new Date().toISOString()
            }
          : lead
      )
    );
    setSelectedLead((lead) => (lead?.id === leadId ? { ...lead, status: nextStatus, updated_at: new Date().toISOString() } : lead));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_180px_140px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search business, contact, email, industry" />
        </div>
        <Select value={status} onChange={(event) => setStatus(event.target.value as LeadStatus | "all")}>
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
        <Select value={tier} onChange={(event) => setTier(event.target.value as LeadTier | "all")}>
          <option value="all">All tiers</option>
          <option value="A">Tier A</option>
          <option value="B">Tier B</option>
          <option value="C">Tier C</option>
          <option value="D">Tier D</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No leads found" description="No leads match the current production filters." />
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
              {filtered.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <div className="font-medium">{lead.business_name}</div>
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

      <LeadDetailPanel
        lead={selectedLead}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onOpenOverride={() => setOverrideOpen(true)}
        onApprove={(leadId) => updateLeadStatus(leadId, "pending_approval")}
        onReject={(leadId) => updateLeadStatus(leadId, "rejected_distribution")}
      />
      <OverrideModal lead={selectedLead} open={overrideOpen} onOpenChange={setOverrideOpen} />
    </div>
  );
}
