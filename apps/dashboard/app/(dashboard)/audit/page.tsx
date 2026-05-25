import { getAuditData } from "@/lib/data/live-data";
import { formatDateTime } from "@/lib/utils";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;

  const { data: auditEntries } = await getAuditData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Audit Trail</h1>
        <p className="mt-1 text-sm text-muted-foreground">Append-only system and founder events across MVP workflows.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <Badge variant="secondary">{entry.event_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{entry.actor_type}</div>
                    <div className="text-xs text-muted-foreground">{entry.actor_id ?? "—"}</div>
                  </TableCell>
                  <TableCell>
                    {entry.entity_type}
                    <span className="ml-2 text-xs text-muted-foreground">{entry.entity_id?.slice(0, 8) ?? "—"}</span>
                  </TableCell>
                  <TableCell>{formatDateTime(entry.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
