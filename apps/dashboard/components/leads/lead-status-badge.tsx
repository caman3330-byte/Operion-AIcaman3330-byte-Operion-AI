import type { LeadStatus, LeadTier } from "@operion/shared";
import { Badge } from "@/components/ui/badge";

interface LeadStatusBadgeProps {
  status: LeadStatus;
  tier?: LeadTier | null;
}

export function LeadStatusBadge({ status, tier }: LeadStatusBadgeProps) {
  const variant =
    status === "pending_approval" || status === "qualified" || status === "approved" || status === "funded"
      ? "success"
      : status === "qualification_error" || status === "rejected_distribution" || status === "rejected" || status === "blacklisted"
        ? "destructive"
        : status === "nurture" || status === "reviewing" || status === "reviewed" || status === "submitted" || status === "routed"
          ? "warning"
          : "secondary";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={variant}>{status.replaceAll("_", " ")}</Badge>
      {tier ? <Badge variant="outline">Tier {tier}</Badge> : null}
    </div>
  );
}
