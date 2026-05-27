import Link from "next/link";
import {
  Activity,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Mail,
  Route,
  ShieldCheck,
  TimerReset
} from "lucide-react";
import { OperationalTestControls } from "@/components/admin/operational-test-controls";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { MetricCard } from "@/components/metrics/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSupervisorSummary } from "@/lib/agent-orchestration/orchestrator";
import { getProductionSupervisorSummary } from "@/lib/data/supervisor-command";
import { getOperatorDashboardSummary } from "@/lib/operator-dashboard/service";
import { getLaunchMonitoringSnapshot } from "@/lib/operations/monitoring";

export const dynamic = "force-dynamic";

const commandLinks = [
  { href: "/supervisor", label: "Supervisor", detail: "Operational command center", icon: ShieldCheck },
  { href: "/leads", label: "Leads", detail: "Lead visibility and review", icon: ClipboardList },
  { href: "/merchants", label: "Merchants", detail: "Application pipeline", icon: FileText },
  { href: "/lenders", label: "Lenders", detail: "Lender criteria and routing", icon: Route },
  { href: "/outreach", label: "Outreach", detail: "Campaign and reply operations", icon: Mail },
  { href: "/testing", label: "Testing", detail: "Simulation and diagnostics", icon: TimerReset },
  { href: "/admin/ai", label: "AI Ops", detail: "Prompts and execution review", icon: Bot }
] as const;

export default async function AdminPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) {
    return <ProtectedPageRedirect to={access.to} reason={access.reason} />;
  }

  const [supervisor, production, operator, monitoring] = await Promise.all([
    getSupervisorSummary(),
    getProductionSupervisorSummary(),
    getOperatorDashboardSummary({ limit: 12 }),
    getLaunchMonitoringSnapshot({ limit: 100 })
  ]);

  const readinessRows = [
    {
      area: "Merchant intake",
      route: "/apply -> /api/applications",
      signal: production.migrationRequired ? "blocked" : "ready",
      detail: production.migrationRequired ? "Production MCA schema is not active." : `${production.applications} application(s) visible.`
    },
    {
      area: "Underwriting scoring",
      route: "/api/qualify + AI task queue",
      signal: production.aiFailed > 0 ? "review" : "ready",
      detail: `${production.aiQueued + production.aiRunning} active, ${production.aiCompleted} completed, ${production.aiFailed} failed.`
    },
    {
      area: "Lender routing",
      route: "/api/operations/lenders/distribution",
      signal: production.lenderMatches > 0 ? "active" : "ready",
      detail: `${production.lenderMatches} lender match record(s).`
    },
    {
      area: "Workflow orchestration",
      route: "/api/operations/workflows/execute",
      signal: monitoring.counters.workflowFailures > 0 ? "review" : "ready",
      detail: `${monitoring.counters.workflowFailures} workflow failure(s), ${monitoring.counters.retryCount} retry event(s).`
    },
    {
      area: "Email operations",
      route: "/api/test-email + /api/integrations/email/queue",
      signal: production.emailOperations.sendgridConfigured ? "ready" : "config",
      detail: `${production.emailOperations.sent} sent, ${production.emailOperations.failed} failed, ${production.emailOperations.replies} replies.`
    },
    {
      area: "Runtime health",
      route: "/api/health + diagnostics",
      signal: monitoring.health,
      detail: `${monitoring.alerts.length} active launch alert(s).`
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal text-white">Operations Admin</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Monday testing cockpit for MCA intake, underwriting, lender routing, workflow execution, email delivery, and runtime health.
          </p>
        </div>
        <Badge variant={monitoring.health === "healthy" ? "success" : monitoring.health === "critical" ? "destructive" : "warning"}>
          {monitoring.health}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Applications" value={String(production.applications)} detail="Merchant funding requests" icon={FileText} />
        <MetricCard title="Active AI Work" value={String(production.aiQueued + production.aiRunning)} detail={`${production.aiFailed} failed or blocked`} icon={Bot} tone={production.aiFailed > 0 ? "warning" : "default"} />
        <MetricCard title="Workflow Health" value={monitoring.health} detail={`${monitoring.counters.workflowFailures} failure(s)`} icon={Activity} tone={monitoring.health === "critical" ? "danger" : monitoring.health === "degraded" ? "warning" : "success"} />
        <MetricCard title="AI/API Cost" value={formatCurrency(production.estimatedAiCostUsd + supervisor.total_estimated_cost_usd)} detail="Tracked operational spend" icon={CircleDollarSign} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Command Links</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {commandLinks.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-md border p-3 transition-colors hover:border-primary/50 hover:bg-primary/5">
                <div className="flex items-center gap-2">
                  <item.icon className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">{item.label}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>MCA Flow Readiness</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Area</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Signal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readinessRows.map((row) => (
                  <TableRow key={row.area}>
                    <TableCell className="font-medium">{row.area}</TableCell>
                    <TableCell className="text-muted-foreground">{row.route}</TableCell>
                    <TableCell>
                      <Badge variant={badgeForSignal(row.signal)}>{row.signal}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Operational Test Controls</CardTitle>
          </CardHeader>
          <CardContent>
            <OperationalTestControls />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Founder Review Queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {operator.risks.length === 0 ? (
              <div className="flex items-start gap-2 rounded-md border p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                <p className="text-sm text-muted-foreground">No operational risks detected in the current window.</p>
              </div>
            ) : (
              operator.risks.map((risk) => (
                <div key={risk} className="rounded-md border border-warning bg-warning/10 p-3 text-sm text-warning-foreground">
                  {risk}
                </div>
              ))
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniStat label="Pending approvals" value={production.pendingApprovals + supervisor.pending_approvals} />
              <MiniStat label="Active alerts" value={monitoring.alerts.length + supervisor.alerts_count} />
              <MiniStat label="Underwriting queue" value={production.underwritingQueue} />
              <MiniStat label="Stale leads" value={monitoring.counters.staleLeads} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Application Lifecycle</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {Object.entries(production.lifecycle).map(([stage, count]) => (
            <div key={stage} className="rounded-md border p-3">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{stage}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{count}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function badgeForSignal(signal: string) {
  if (signal === "ready" || signal === "active" || signal === "healthy") return "success";
  if (signal === "review" || signal === "config" || signal === "degraded") return "warning";
  if (signal === "blocked" || signal === "critical") return "destructive";
  return "secondary";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 4 : 2
  }).format(value);
}
