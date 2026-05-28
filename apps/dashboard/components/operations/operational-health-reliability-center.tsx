import type { ReliabilityCenterModel, ReliabilityTone } from "@/lib/operations/reliability-center";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

export function OperationalHealthReliabilityCenter({
  model
}: {
  model: ReliabilityCenterModel;
}) {
  return (
    <Card className="border-amber-500/30 bg-gradient-to-b from-amber-500/[0.07] to-background">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Operational Health & Reliability Center</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Lean production health, failures, metrics, and alerts for live-beta operations.</p>
          </div>
          <Badge variant={toneForStatus(model.status)}>{model.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {model.healthChecks.map((check) => (
            <div key={check.label} className="rounded-md border bg-background/80 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{check.label}</p>
                <Badge variant={check.tone}>{check.state}</Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{check.detail}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-md border bg-background/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-white">Recent Operational Failures</p>
              <Badge variant={model.failures.length > 0 ? "warning" : "success"}>{model.failures.length}</Badge>
            </div>
            <div className="mt-3 space-y-2">
              {model.failures.length === 0 ? (
                <p className="text-sm text-muted-foreground">No operational failures surfaced in the current review window.</p>
              ) : (
                model.failures.map((failure) => (
                  <div key={failure.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{failure.category}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(failure.timestamp)} / {failure.retryState}</p>
                      </div>
                      <Badge variant={severityTone(failure.severity)}>{failure.severity}</Badge>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{failure.detail}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-md border bg-background/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-white">Operational Alerts</p>
              <Badge variant={model.alerts.length > 0 ? "warning" : "success"}>{model.alerts.length}</Badge>
            </div>
            <div className="mt-3 space-y-2">
              {model.alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No degraded-service or incident signals in the current window.</p>
              ) : (
                model.alerts.map((alert) => (
                  <div key={alert.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-medium">{alert.title}</p>
                      <Badge variant={severityTone(alert.severity)}>{alert.count}</Badge>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{alert.detail}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {model.metrics.map((metric) => (
            <div key={metric.label} className="rounded-md border bg-white/[0.025] p-3">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{metric.label}</p>
              <p className="mt-2 text-lg font-semibold text-white">{metric.value}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.detail}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function toneForStatus(status: ReliabilityCenterModel["status"]): ReliabilityTone {
  if (status === "healthy") return "success";
  if (status === "critical") return "destructive";
  return "warning";
}

function severityTone(severity: "info" | "warning" | "critical"): ReliabilityTone {
  if (severity === "critical") return "destructive";
  if (severity === "warning") return "warning";
  return "secondary";
}
