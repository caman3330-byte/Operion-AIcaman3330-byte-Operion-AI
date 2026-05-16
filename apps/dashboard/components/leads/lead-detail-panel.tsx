"use client";

import type { Lead } from "@operion/shared";
import { Check, Pause, ShieldX, X } from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface LeadDetailPanelProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenOverride: () => void;
  onApprove: (leadId: string) => void;
  onReject: (leadId: string) => void;
}

export function LeadDetailPanel({
  lead,
  open,
  onOpenChange,
  onOpenOverride,
  onApprove,
  onReject
}: LeadDetailPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {lead ? (
          <>
            <SheetHeader>
              <SheetTitle>{lead.business_name}</SheetTitle>
              <SheetDescription>{lead.contact_name ?? "No contact name"} · {lead.industry ?? "Unknown industry"}</SheetDescription>
            </SheetHeader>
            <div className="mt-5 flex-1 space-y-5 overflow-y-auto">
              <LeadStatusBadge status={lead.status} tier={lead.tier} />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Detail label="Score" value={lead.qualification_score?.toString() ?? "—"} />
                <Detail label="Revenue" value={formatCurrency(lead.annual_revenue_est)} />
                <Detail label="Time in business" value={lead.time_in_business_years ? `${lead.time_in_business_years} years` : "—"} />
                <Detail label="State" value={lead.state ?? "—"} />
                <Detail label="Email" value={lead.email ?? "—"} />
                <Detail label="Phone" value={lead.phone ?? "—"} />
                <Detail label="Created" value={formatDateTime(lead.created_at)} />
                <Detail label="Updated" value={formatDateTime(lead.updated_at)} />
              </div>

              <div className="rounded-md border p-4">
                <h3 className="text-sm font-semibold">Approval Actions</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => onApprove(lead.id)}>
                    <Check className="h-4 w-4" />
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onReject(lead.id)}>
                    <X className="h-4 w-4" />
                    Reject
                  </Button>
                  <Button size="sm" variant="outline" onClick={onOpenOverride}>
                    <Pause className="h-4 w-4" />
                    Override
                  </Button>
                  <Button size="sm" variant="destructive" onClick={onOpenOverride}>
                    <ShieldX className="h-4 w-4" />
                    Blacklist
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  );
}
