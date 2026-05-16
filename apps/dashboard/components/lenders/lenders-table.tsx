import type { Lender } from "@operion/shared";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface LendersTableProps {
  lenders: Lender[];
}

export function LendersTable({ lenders }: LendersTableProps) {
  if (lenders.length === 0) {
    return <EmptyState title="No lenders configured" description="Add lender criteria and webhook URLs before distribution goes live." />;
  }

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lender</TableHead>
            <TableHead>Criteria</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lenders.map((lender) => (
            <TableRow key={lender.id}>
              <TableCell>
                <div className="font-medium">{lender.company_name}</div>
                <div className="text-xs text-muted-foreground">{lender.contact_email ?? "No contact email"}</div>
              </TableCell>
              <TableCell className="max-w-xs">
                <div className="truncate text-sm">{lender.criteria_industries?.join(", ") ?? "No industry filter"}</div>
                <div className="text-xs text-muted-foreground">
                  {formatCurrency(lender.criteria_min_revenue)} - {formatCurrency(lender.criteria_max_revenue)}
                </div>
              </TableCell>
              <TableCell>{formatCurrency(lender.price_per_lead)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={lender.active ? "success" : "secondary"}>{lender.active ? "active" : "inactive"}</Badge>
                  {lender.whitelisted ? <Badge variant="outline">whitelisted</Badge> : null}
                </div>
              </TableCell>
              <TableCell>{formatDateTime(lender.created_at)}</TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm">
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
