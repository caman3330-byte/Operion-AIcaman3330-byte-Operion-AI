import { AlertTriangle } from "lucide-react";
import type { Alert } from "@operion/shared";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

interface ActiveAlertsProps {
  alerts: Alert[];
}

export function ActiveAlerts({ alerts: initialAlerts }: ActiveAlertsProps) {
  const alerts = initialAlerts.filter((alert) => !alert.resolved);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Active Alerts</CardTitle>
        <AlertTriangle className="h-4 w-4 text-warning" />
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <EmptyState title="No active alerts" description="WARN and CRITICAL events will appear here." />
        ) : (
          <div className="space-y-3">
            {alerts.slice(0, 10).map((alert) => (
              <div key={alert.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <Badge variant={alert.severity === "CRITICAL" ? "destructive" : alert.severity === "WARN" ? "warning" : "secondary"}>
                    {alert.severity}
                  </Badge>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(alert.created_at)}</span>
                </div>
                <p className="mt-2 text-sm">{alert.message}</p>
                <Button className="mt-3" variant="outline" size="sm">
                  Mark Resolved
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
