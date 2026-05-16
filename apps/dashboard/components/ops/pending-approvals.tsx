import Link from "next/link";
import type { Lead } from "@operion/shared";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PendingApprovalsProps {
  leads: Lead[];
}

export function PendingApprovals({ leads }: PendingApprovalsProps) {
  const pendingLeads = leads.filter((lead) => lead.status === "pending_approval");
  const estimatedRevenue = pendingLeads.reduce((sum, lead) => sum + (lead.tier === "A" ? 75 : 45), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Pending Approvals</CardTitle>
        <CheckCircle2 className="h-4 w-4 text-success" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-normal">{pendingLeads.length}</div>
        <p className="mt-1 text-sm text-muted-foreground">{formatCurrency(estimatedRevenue)} estimated if approved</p>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/leads">
            Review Queue
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
