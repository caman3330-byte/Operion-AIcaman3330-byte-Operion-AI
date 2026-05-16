import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  Route,
  XCircle
} from "lucide-react";
import { getSupervisorSummary } from "@/lib/agent-orchestration/orchestrator";
import { getProductionSupervisorSummary } from "@/lib/data/supervisor-command";
import { MetricCard } from "@/components/metrics/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function SupervisorPage() {
  const [summary, production] = await Promise.all([getSupervisorSummary(), getProductionSupervisorSummary()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal text-white">Supervisor Command Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Internal funding operations across lead qualification, underwriting review, lender routing, approvals, costs, and AI usage.
          </p>
        </div>
        <Badge variant={summary.migration_required ? "warning" : "success"}>
          {summary.migration_required ? "Migration pending" : "Supabase connected"}
        </Badge>
      </div>

      {summary.migration_required ? (
        <Card className="border-warning bg-warning/10">
          <CardHeader>
            <CardTitle>Multi-Agent Tables Pending</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Apply <span className="font-medium text-foreground">{summary.migration_path}</span> in Supabase to persist task queue,
            memory, context, workflow routing, approvals, metrics, and executive reports. The registry is loaded so the dashboard can
            still show the planned hierarchy.
          </CardContent>
        </Card>
      ) : null}

      {production.migrationRequired ? (
        <Card className="border-warning bg-warning/10">
          <CardHeader>
            <CardTitle>Production MCA Tables Pending</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Apply <span className="font-medium text-foreground">packages/database/migrations/0008_production_mca_platform.sql</span> in
            Supabase to activate real application intake, AI qualification tasks, lead scores, documents, offers, approvals, and API cost
            tracking.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Applications" value={String(production.applications)} detail="Business funding requests" icon={FileText} />
        <MetricCard title="Total Leads" value={String(production.leads)} detail={`${production.qualifiedLeads} qualified or approved`} icon={Activity} />
        <MetricCard title="AI Queue" value={String(production.aiQueued + production.aiRunning)} detail={`${production.aiCompleted} completed, ${production.aiFailed} blocked or failed`} icon={Bot} />
        <MetricCard title="Approvals Pending" value={String(production.pendingApprovals)} detail="Supervisor or founder review" icon={Clock3} tone="warning" />
        <MetricCard title="Underwriting Queue" value={String(production.underwritingQueue)} detail="Queued, in review, or escalated" icon={CheckCircle2} />
        <MetricCard title="Lender Matches" value={String(production.lenderMatches)} detail="Recommended or submitted matches" icon={Route} />
        <MetricCard title="Outreach Events" value={String(production.outreachLogs)} detail="Production outreach logs" icon={AlertTriangle} />
        <MetricCard title="AI/API Cost" value={formatCurrency(production.estimatedAiCostUsd)} detail="Tracked in api_usage_logs" icon={CircleDollarSign} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Active Agents" value={String(summary.active_agents)} detail="Operational and department agents" icon={Bot} />
        <MetricCard title="Running Tasks" value={String(summary.running_tasks)} detail={`${summary.queued_tasks} queued or blocked`} icon={Activity} />
        <MetricCard title="Completed Tasks" value={String(summary.completed_tasks)} detail="Recorded in agent task queue" icon={CheckCircle2} tone="success" />
        <MetricCard title="Failed Tasks" value={String(summary.failed_tasks)} detail="Needs manager review" icon={XCircle} tone="danger" />
        <MetricCard title="Pending Approvals" value={String(summary.pending_approvals)} detail="Founder or policy review" icon={Clock3} tone="warning" />
        <MetricCard title="Active Alerts" value={String(summary.alerts_count)} detail={`${summary.critical_alerts_count} critical`} icon={AlertTriangle} tone={summary.critical_alerts_count > 0 ? "danger" : "default"} />
        <MetricCard title="AI Calls" value={String(summary.ai_usage.successful_calls + summary.ai_usage.failed_calls)} detail={`${summary.ai_usage.failed_calls} failed calls`} icon={Route} />
        <MetricCard title="Estimated Cost" value={formatCurrency(summary.total_estimated_cost_usd)} detail="AI usage and queued work" icon={CircleDollarSign} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader>
            <CardTitle>Department Summaries</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead className="text-right">Agents</TableHead>
                  <TableHead className="text-right">Running</TableHead>
                  <TableHead className="text-right">Queued</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.departments.map((department) => (
                  <TableRow key={department.department_key}>
                    <TableCell className="font-medium">{department.name}</TableCell>
                    <TableCell className="text-muted-foreground">{department.manager_agent_key ?? "Unassigned"}</TableCell>
                    <TableCell className="text-right">{department.active_agents}</TableCell>
                    <TableCell className="text-right">{department.running_tasks}</TableCell>
                    <TableCell className="text-right">{department.queued_tasks}</TableCell>
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
            <CardTitle>AI Usage Tracking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(summary.ai_usage.by_service).map(([service, cost]) => (
              <div key={service} className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm font-medium capitalize">{service}</span>
                <span className="text-sm text-muted-foreground">{formatCurrency(Number(cost))}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Active Agents</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {summary.agents.map((agent) => (
              <div key={agent.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{agent.name}</p>
                  <Badge variant={agent.role === "specialist" ? "outline" : "secondary"}>{agent.role.replace("_", " ")}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{agent.purpose}</p>
                <p className="mt-2 text-xs text-muted-foreground">Manager: {agent.manager_id ?? "Founder"}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workflow Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.workflow_routes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Workflow routes will load after the multi-agent migration is applied.</p>
            ) : (
              summary.workflow_routes.map((workflow) => (
                <div key={workflow.workflow_key} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{workflow.name}</p>
                    <Badge variant={workflow.requires_approval ? "warning" : "success"}>
                      {workflow.requires_approval ? "Approval" : "Auto route"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {workflow.primary_agent_key} via {workflow.trigger_type}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <QueuePanel title="Running Tasks" tasks={summary.tasks.filter((task) => task.status === "running")} />
        <QueuePanel title="Completed Tasks" tasks={summary.tasks.filter((task) => task.status === "completed")} />
        <QueuePanel title="Failed Tasks" tasks={summary.tasks.filter((task) => task.status === "failed")} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active alerts.</p>
            ) : (
              summary.alerts.slice(0, 8).map((alert) => (
                <div key={alert.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{alert.alert_type}</p>
                    <Badge variant={alert.severity === "CRITICAL" ? "destructive" : alert.severity === "WARN" ? "warning" : "secondary"}>
                      {alert.severity}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{alert.message}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Executive Reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.executive_reports.length === 0 ? (
              <p className="text-sm text-muted-foreground">No executive reports generated yet.</p>
            ) : (
              summary.executive_reports.slice(0, 5).map((report) => (
                <div key={report.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium capitalize">{report.report_type} report</p>
                    <span className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{report.summary}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QueuePanel({ title, tasks }: { title: string; tasks: Array<{ id: string; title: string; assigned_agent_key: string }> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks in this state.</p>
        ) : (
          tasks.slice(0, 6).map((task) => (
            <div key={task.id} className="rounded-md border p-3">
              <p className="text-sm font-medium">{task.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{task.assigned_agent_key}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 4 : 2
  }).format(value);
}
