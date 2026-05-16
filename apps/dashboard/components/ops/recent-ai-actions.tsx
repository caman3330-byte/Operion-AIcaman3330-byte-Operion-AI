import { Bot } from "lucide-react";
import type { AuditLogEntry } from "@operion/shared";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RecentAiActionsProps {
  entries: AuditLogEntry[];
}

export function RecentAiActions({ entries: auditEntries }: RecentAiActionsProps) {
  const entries = auditEntries.filter((entry) => entry.actor_type === "system").slice(0, 20);

  return (
    <Card className="xl:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Recent AI Actions</CardTitle>
        <Bot className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent className="space-y-3">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{entry.event_type}</Badge>
                <span className="text-xs text-muted-foreground">{entry.actor_id}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {entry.event_type.replaceAll("_", " ")} recorded for {entry.entity_type}.
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(entry.created_at)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
