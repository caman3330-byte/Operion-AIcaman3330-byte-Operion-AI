import { Activity, AlertTriangle, DatabaseZap, Gauge, ListChecks, PauseCircle, Route, TimerReset } from "lucide-react";
import { SimulationControls } from "@/components/testing/simulation-controls";
import { MetricCard } from "@/components/metrics/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { collectDiagnosticsSnapshot } from "@/lib/diagnostics/summary";
import { isSimulationMigrationMissing, simulationRepository } from "@/lib/repositories/simulation";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TestingPage() {
  try {
    const [diagnostics, runs, providers, traces, reports, controls] = await Promise.all([
      collectDiagnosticsSnapshot(),
      simulationRepository.listRuns(8),
      simulationRepository.listProviders(),
      simulationRepository.listTraces(12),
      simulationRepository.listReadinessReports(3),
      simulationRepository.getWorkerControls()
    ]);

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Internal Testing & Simulation</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Autonomous validation for acquisition, enrichment, qualification, approvals, lender matching, outreach, tracing, and readiness.
            </p>
          </div>
          <Badge variant={diagnostics.health_status === "healthy" ? "success" : diagnostics.health_status === "critical" ? "destructive" : "warning"}>
            {diagnostics.health_status}
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Test Controls</CardTitle>
          </CardHeader>
          <CardContent>
            <SimulationControls />
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Worker State" value={controls?.workers_paused ? "Paused" : "Active"} detail={controls?.stress_mode_enabled ? "Stress mode enabled" : "Standard mode"} icon={PauseCircle} tone={controls?.workers_paused ? "warning" : "success"} />
          <MetricCard title="Supabase Latency" value={diagnostics.latency.supabase_ms === null ? "n/a" : `${diagnostics.latency.supabase_ms}ms`} detail="Latest diagnostic probe" icon={DatabaseZap} />
          <MetricCard title="Approvals Pending" value={String(diagnostics.queue_health.approvals_pending)} detail="Founder-gated workflows" icon={ListChecks} tone={diagnostics.queue_health.approvals_pending > 0 ? "warning" : "success"} />
          <MetricCard title="Failures" value={String(diagnostics.failures.api_failures + diagnostics.failures.workflow_failures)} detail="API + workflow failures" icon={AlertTriangle} tone={diagnostics.failures.workflow_failures > 0 ? "danger" : "default"} />
          <MetricCard title="Acquisition Queue" value={String(diagnostics.queue_health.acquisition_queued)} detail="Queued acquisition jobs" icon={Gauge} />
          <MetricCard title="Outreach Queue" value={String(diagnostics.queue_health.outreach_queued)} detail={`${diagnostics.queue_health.retries_pending} retry candidate(s)`} icon={Activity} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Provider Registry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {providers.map((provider) => (
                <div key={provider.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{provider.display_name}</p>
                    <Badge variant={provider.enabled ? "success" : "secondary"}>{provider.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{provider.capabilities.join(", ") || "No capabilities configured"}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Simulation Runs</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-medium">{run.name}</TableCell>
                      <TableCell>{run.mode}</TableCell>
                      <TableCell>
                        <Badge variant={run.status === "failed" ? "destructive" : run.status === "completed" ? "success" : "secondary"}>
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{run.batch_size.toLocaleString()}</TableCell>
                      <TableCell>{formatDateTime(run.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Live Execution Traces</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {traces.map((trace) => (
                <div key={trace.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {trace.workflow_key} / {trace.step_key}
                    </p>
                    <Badge variant={trace.status === "failed" ? "destructive" : trace.status === "completed" ? "success" : "secondary"}>
                      {trace.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {trace.latency_ms ?? 0}ms · {formatDateTime(trace.created_at)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Production Readiness Reports</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reports.map((report) => (
                <div key={report.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{report.status}</p>
                    <Route className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-1 line-clamp-4 text-xs text-muted-foreground">{report.report_body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>System Bottlenecks</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {diagnostics.bottlenecks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bottlenecks detected in the latest snapshot.</p>
            ) : (
              diagnostics.bottlenecks.map((item) => (
                <div key={item} className="flex items-start gap-2 rounded-md border p-3">
                  <TimerReset className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <p className="text-sm">{item}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    );
  } catch (error) {
    if (isSimulationMigrationMissing(error)) {
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Internal Testing & Simulation</h1>
            <p className="mt-1 text-sm text-muted-foreground">Simulation infrastructure is coded and waiting for the database migration.</p>
          </div>
          <Card className="border-warning bg-warning/10">
            <CardHeader>
              <CardTitle>Migration Required</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Apply <span className="font-medium text-foreground">packages/database/migrations/0005_internal_testing_simulation.sql</span> after
              migration <span className="font-medium text-foreground">0004_lead_acquisition_outreach.sql</span> to activate simulation runs,
              provider registry, workflow traces, worker controls, diagnostics, and readiness reports.
            </CardContent>
          </Card>
        </div>
      );
    }

    throw error;
  }
}
