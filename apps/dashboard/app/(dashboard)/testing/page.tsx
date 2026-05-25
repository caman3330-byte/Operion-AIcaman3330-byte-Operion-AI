import { AlertTriangle, DatabaseZap, ListChecks, Mail, ShieldCheck } from "lucide-react";
import { OperationalTestControls } from "@/components/admin/operational-test-controls";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { MetricCard } from "@/components/metrics/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { collectDiagnosticsSnapshot } from "@/lib/diagnostics/summary";
import { isSimulationMigrationMissing } from "@/lib/repositories/simulation";

export const dynamic = "force-dynamic";

export default async function TestingPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;

  try {
    const diagnostics = await collectDiagnosticsSnapshot();

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Founder Control</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal">Operational Testing Center</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Lean prelaunch controls for email preview, controlled SendGrid delivery, Supabase smoke testing, and production validation.
            </p>
          </div>
          <Badge variant={diagnostics.health_status === "healthy" ? "success" : diagnostics.health_status === "critical" ? "destructive" : "warning"}>
            {diagnostics.health_status}
          </Badge>
        </div>

        <Card className="border-primary/20 bg-[radial-gradient(circle_at_top_left,rgba(215,183,106,0.10),transparent_35%),rgba(255,255,255,0.025)]">
          <CardHeader>
            <CardTitle>Prelaunch Validation Controls</CardTitle>
          </CardHeader>
          <CardContent>
            <OperationalTestControls />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Testing Scope</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {["Preview email", "Send test email", "Send all to test inbox", "Smoke test", "Prelaunch validation"].map((item) => (
              <div key={item} className="rounded-md border border-white/[0.10] bg-black/20 p-3">
                <p className="text-sm font-medium text-white">{item}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Admin-only controlled operation.</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Supabase Latency" value={diagnostics.latency.supabase_ms === null ? "n/a" : `${diagnostics.latency.supabase_ms}ms`} detail="Latest diagnostic probe" icon={DatabaseZap} />
          <MetricCard title="Approvals Pending" value={String(diagnostics.queue_health.approvals_pending)} detail="Founder-gated workflows" icon={ListChecks} tone={diagnostics.queue_health.approvals_pending > 0 ? "warning" : "success"} />
          <MetricCard title="Email Delivery Health" value={diagnostics.communication_health.failed > 0 ? "Watch" : "Ready"} detail={`${diagnostics.communication_health.sent} sent / ${diagnostics.communication_health.failed} failed`} icon={Mail} tone={diagnostics.communication_health.failed > 0 ? "warning" : "success"} />
          <MetricCard title="Failures" value={String(diagnostics.failures.api_failures + diagnostics.failures.workflow_failures)} detail="API + workflow failures" icon={AlertTriangle} tone={diagnostics.failures.workflow_failures > 0 ? "danger" : "default"} />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Prelaunch Notes</CardTitle>
            <ShieldCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              This page is intentionally limited to founder/operator validation controls. Deep simulation controls remain in code for future
              sandbox phases, but they are not exposed in the launch testing panel.
            </p>
            {diagnostics.bottlenecks.length > 0 ? (
              <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
                <p className="font-medium text-foreground">Current diagnostic watch items</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {diagnostics.bottlenecks.slice(0, 4).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="rounded-md border border-white/[0.10] bg-black/20 p-3">No bottlenecks detected in the latest snapshot.</p>
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
            <h1 className="text-2xl font-semibold tracking-normal">Operational Testing Center</h1>
            <p className="mt-1 text-sm text-muted-foreground">Simulation infrastructure is coded and waiting for the database migration.</p>
          </div>
          <Card className="border-warning bg-warning/10">
            <CardHeader>
              <CardTitle>Migration Required</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Apply <span className="font-medium text-foreground">packages/database/migrations/0005_internal_testing_simulation.sql</span> after
              migration <span className="font-medium text-foreground">0004_lead_acquisition_outreach.sql</span> to activate diagnostics and
              readiness records.
            </CardContent>
          </Card>
        </div>
      );
    }

    throw error;
  }
}
