import { Activity, AlertTriangle, BellRing, Bot, CheckCircle2, ClipboardList, Network, RadioTower, Search, TimerReset } from "lucide-react";
import { getSupervisorSummary } from "@/lib/agent-orchestration/orchestrator";
import { auditLogRepository } from "@/lib/repositories/audit-log";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { MetricCard } from "@/components/metrics/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function ExecutiveDashboardPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;

  const [summary, auditEntries, acquisition] = await Promise.all([
    getSupervisorSummary(),
    auditLogRepository.list({ entityType: "manager_agent", limit: 12 }).catch(() => []),
    acquisitionRepository.summary().catch(() => null)
  ]);
  const runningWorkflows = summary.tasks.filter((task) => task.status === "running" || task.status === "queued");
  const blockedTasks = summary.tasks.filter((task) => task.status === "blocked");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Founder Executive Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Condensed founder view of agents, workflow motion, approvals, department performance, and AI activity.
          </p>
        </div>
        <Badge variant={summary.source === "supabase" ? "success" : "warning"}>
          {summary.source === "supabase" ? "Live Supabase" : "Registry fallback"}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Active Agents" value={String(summary.active_agents)} detail="Registered operating agents" icon={Bot} />
        <MetricCard title="Queued Tasks" value={String(summary.queued_tasks)} detail="Queued, assigned, or blocked" icon={ClipboardList} />
        <MetricCard title="Running Workflows" value={String(runningWorkflows.length)} detail="Workflow-backed agent tasks" icon={RadioTower} />
        <MetricCard title="Approvals Pending" value={String(summary.pending_approvals)} detail="Founder review required" icon={BellRing} tone="warning" />
        <MetricCard title="Lead Flow" value={String(acquisition?.leads.total ?? 0)} detail={`${acquisition?.leads.qualified ?? 0} qualified`} icon={Search} />
        <MetricCard title="SDR Queue" value={String(acquisition?.outreach.queued_emails ?? 0)} detail={`${acquisition?.outreach.pending_approval_emails ?? 0} approval gated`} icon={ClipboardList} />
        <MetricCard title="Operational Health" value={summary.failed_tasks === 0 ? "Stable" : "Review"} detail={`${summary.failed_tasks} failed task(s), ${summary.alerts_count} alert(s)`} icon={AlertTriangle} tone={summary.failed_tasks > 0 ? "danger" : "success"} />
        <MetricCard title="AI Cost" value={formatCurrency(summary.ai_usage.total_cost_usd)} detail="30-day tracked usage" icon={Activity} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader>
            <CardTitle>Department Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Agents</TableHead>
                  <TableHead className="text-right">Queued</TableHead>
                  <TableHead className="text-right">Running</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.departments.map((department) => (
                  <TableRow key={department.department_key}>
                    <TableCell className="font-medium">{department.name}</TableCell>
                    <TableCell className="text-right">{department.active_agents}</TableCell>
                    <TableCell className="text-right">{department.queued_tasks}</TableCell>
                    <TableCell className="text-right">{department.running_tasks}</TableCell>
                    <TableCell className="text-right">{department.completed_tasks}</TableCell>
                    <TableCell className="text-right">{department.failed_tasks}</TableCell>
                    <TableCell className="text-right">{formatCurrency(department.estimated_cost_usd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Activity Feed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">API Usage</p>
                <Activity className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {summary.ai_usage.successful_calls} successful calls, {summary.ai_usage.failed_calls} failed calls,{" "}
                {formatCurrency(summary.ai_usage.total_cost_usd)} estimated cost.
              </p>
            </div>
            {auditEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No manager-agent activity recorded yet.</p>
            ) : (
              auditEntries.map((entry) => (
                <div key={entry.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{entry.event_type}</p>
                    <TimerReset className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Running Workflows</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {runningWorkflows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No running or queued workflow tasks.</p>
            ) : (
              runningWorkflows.slice(0, 8).map((task) => (
                <div key={task.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{task.title}</p>
                    <Badge variant={task.status === "blocked" ? "warning" : "secondary"}>{task.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task.workflow_key ?? "manual"} routed to {task.assigned_agent_key}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Founder Attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Approvals Pending</p>
                <Badge variant={summary.pending_approvals > 0 ? "warning" : "success"}>{summary.pending_approvals}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Distribution, underwriting, risk, and escalation approvals.</p>
            </div>
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Failed Tasks</p>
                <Badge variant={summary.failed_tasks > 0 ? "destructive" : "success"}>{summary.failed_tasks}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Tasks requiring manager review before retry or cancellation.</p>
            </div>
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Reports Generated</p>
                <CheckCircle2 className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{summary.executive_reports.length} recent executive report records.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Workflow Map</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.workflow_routes.map((route) => (
              <div key={route.workflow_key} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{route.name}</p>
                  <Network className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {route.trigger_type} to {route.primary_agent_key}
                </p>
                <Badge className="mt-2" variant={route.requires_approval ? "warning" : "outline"}>
                  {route.requires_approval ? "approval gated" : "auto executable"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blocked Approvals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {blockedTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No blocked task approvals.</p>
            ) : (
              blockedTasks.slice(0, 8).map((task) => (
                <div key={task.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{task.title}</p>
                    <Badge variant="warning">blocked</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task.assigned_agent_key} waiting on {task.approval_id ?? "approval"}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Cost Tracking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(summary.ai_usage.by_service).map(([service, cost]) => (
              <div key={service} className="flex items-center justify-between rounded-md border p-3">
                <span className="text-sm font-medium capitalize">{service}</span>
                <span className="text-sm text-muted-foreground">{formatCurrency(Number(cost))}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 4 : 2
  }).format(value);
}
