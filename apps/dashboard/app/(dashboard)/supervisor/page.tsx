import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  Mail,
  Route,
  XCircle
} from "lucide-react";
import { getSupervisorSummary } from "@/lib/agent-orchestration/orchestrator";
import { getProductionSupervisorSummary } from "@/lib/data/supervisor-command";
import { getOperatorDashboardSummary } from "@/lib/operator-dashboard/service";
import { getLaunchMonitoringSnapshot } from "@/lib/operations/monitoring";
import { MetricCard } from "@/components/metrics/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function SupervisorPage() {
  const [summary, production, operator, monitoring] = await Promise.all([
    getSupervisorSummary(),
    getProductionSupervisorSummary(),
    getOperatorDashboardSummary({ limit: 10 }),
    getLaunchMonitoringSnapshot({ limit: 100 })
  ]);

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

      {!production.environmentReady ? (
        <Card className="border-destructive bg-destructive/10">
          <CardHeader>
            <CardTitle>Production environment incomplete</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            The production environment needs Supabase, payment, messaging, and at least one AI provider configured.
            <div className="mt-3 space-y-1 text-xs">
              <div>Supabase: {production.configurationStatus.supabase ? "configured" : "missing"}</div>
              <div>Anthropic: {production.configurationStatus.anthropic ? "configured" : "missing"}</div>
              <div>OpenAI: {production.configurationStatus.openai ? "configured" : "missing"}</div>
              <div>SendGrid: {production.configurationStatus.sendgrid ? "configured" : "missing"}</div>
              <div>Stripe: {production.configurationStatus.stripe ? "configured" : "missing"}</div>
              <div>CRM Webhook: {production.configurationStatus.crm ? "configured" : "missing"}</div>
              <div>Slack: {production.configurationStatus.slack ? "configured" : "missing"}</div>
              <div>n8n: {production.configurationStatus.n8n ? "configured" : "missing"}</div>
            </div>
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

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>MCA Operations Flow</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {Object.entries(production.lifecycle).map(([stage, count]) => (
              <div key={stage} className="rounded-md border p-3">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{stage.replaceAll("_", " ")}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{count}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Email Operations
              </CardTitle>
              <Badge variant={production.emailOperations.sendgridConfigured ? "success" : "warning"}>
                {production.emailOperations.sendgridConfigured ? "SendGrid ready" : "SendGrid missing"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Sent" value={production.emailOperations.sent} />
            <MiniMetric label="Failed" value={production.emailOperations.failed} />
            <MiniMetric label="Replies" value={production.emailOperations.replies} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Launch Health" value={monitoring.health} detail={`${monitoring.alerts.length} active operational alert(s)`} icon={CheckCircle2} tone={monitoring.health === "critical" ? "danger" : monitoring.health === "degraded" ? "warning" : "success"} />
        <MetricCard title="Workflow Failures" value={String(monitoring.counters.workflowFailures)} detail={`${monitoring.counters.retryCount} retry event(s)`} icon={Route} tone={monitoring.counters.workflowFailures > 0 ? "danger" : "success"} />
        <MetricCard title="AI Failures" value={String(monitoring.counters.aiExecutionFailures)} detail={`${operator.ai.metrics.averageLatencyMs ?? 0}ms avg latency`} icon={Bot} tone={monitoring.counters.aiExecutionFailures > 0 ? "warning" : "success"} />
        <MetricCard title="Stale Leads" value={String(monitoring.counters.staleLeads)} detail="Intake + underwriting threshold" icon={Clock3} tone={monitoring.counters.staleLeads > 0 ? "warning" : "success"} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              AI Operations Manager
            </CardTitle>
            <Badge variant={summary.failed_tasks > 0 || monitoring.counters.workflowFailures > 0 ? "warning" : "success"}>
              {summary.failed_tasks > 0 || monitoring.counters.workflowFailures > 0 ? "Intervention watch" : "Launch-ready routing"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {[
            ["Lead AI", `${production.leads} leads`, `${monitoring.counters.staleLeads} stale review signal(s)`],
            ["Outreach AI", `${production.emailOperations.sent} sent`, `${production.emailOperations.replies} reply event(s)`],
            ["CRM AI", `${production.applications} applications`, `${production.lifecycle.reviewed ?? 0} reviewed stage`],
            ["Lender AI", `${production.lenderMatches} matches`, `${production.pendingApprovals} approval gate(s)`],
            ["Document AI", `${production.underwritingQueue} reviews`, "OCR and statement hooks prepared"],
            ["Operations AI", `${summary.queued_tasks} queued`, `${summary.running_tasks} running task(s)`]
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-md border bg-white/[0.025] p-3">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
              <p className="mt-2 text-lg font-semibold text-white">{value}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Leads Today" value={String(production.operationalMetrics.leadsGeneratedToday)} detail="Generated or ingested today" icon={Activity} />
        <MetricCard title="Outreach Today" value={String(production.operationalMetrics.outreachSentToday)} detail="Sent merchant or lender messages" icon={Mail} />
        <MetricCard title="Uploads Pending" value={String(production.operationalMetrics.uploadsPending)} detail={`${production.operationalMetrics.uploadCompletionRate}% upload completion`} icon={FileText} tone={production.operationalMetrics.uploadsPending > 0 ? "warning" : "success"} />
        <MetricCard title="Lead Conversion" value={`${production.operationalMetrics.leadConversionRate}%`} detail={`${production.operationalMetrics.applicationsReceivedToday} application(s) today`} icon={CheckCircle2} />
        <MetricCard title="Lenders Contacted" value={String(production.operationalMetrics.lendersContacted)} detail={`${production.operationalMetrics.lenderResponseRate}% response signal`} icon={Route} />
        <MetricCard title="Funding Review Queue" value={String(production.underwritingQueue)} detail="Applications in review states" icon={Clock3} />
        <MetricCard title="Email Queue Health" value={production.emailOperations.failed > 0 ? "Watch" : "Ready"} detail={`${production.emailOperations.failed} failed / ${production.emailOperations.sent} sent`} icon={Mail} tone={production.emailOperations.failed > 0 ? "warning" : "success"} />
        <MetricCard title="AI Queue Health" value={production.aiFailed > 0 ? "Watch" : "Ready"} detail={`${production.aiQueued + production.aiRunning} active / ${production.aiFailed} blocked`} icon={Bot} tone={production.aiFailed > 0 ? "warning" : "success"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Live Workflow Status</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {[
            ["Scraping", production.operationalMetrics.leadsGeneratedToday > 0 ? "active" : "standby"],
            ["Enrichment", production.aiQueued + production.aiRunning > 0 ? "queued" : "standby"],
            ["Outreach", production.operationalMetrics.outreachSentToday > 0 ? "active" : "ready"],
            ["CRM", production.applications > 0 ? "tracking" : "ready"],
            ["Lender routing", production.lenderMatches > 0 ? "matching" : "ready"],
            ["Upload review", production.operationalMetrics.uploadsPending > 0 ? "pending" : "clear"],
            ["Email queue", production.emailOperations.failed > 0 ? "watch" : "ready"]
          ].map(([label, state]) => (
            <div key={label} className="rounded-md border bg-white/[0.025] p-3">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
              <p className="mt-2 text-sm font-semibold capitalize text-white">{state}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Launch Monitoring Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {monitoring.alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No launch-blocking operational alerts in the current monitoring window.</p>
            ) : (
              monitoring.alerts.map((alert) => (
                <div key={alert.category} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{alert.title}</p>
                    <Badge variant={alert.severity === "critical" ? "destructive" : alert.severity === "warn" ? "warning" : "secondary"}>
                      {alert.count} {alert.severity}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{alert.detail}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Execution QA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Average Confidence</p>
                <p className="mt-1 text-lg font-semibold">{operator.ai.metrics.averageConfidenceScore ?? "n/a"}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Providers</p>
                <p className="mt-1 text-lg font-semibold">{Object.keys(operator.ai.metrics.byProvider).length}</p>
              </div>
            </div>
            {Object.entries(operator.ai.metrics.failureCategories).length === 0 ? (
              <p className="text-sm text-muted-foreground">No categorized AI failures in the current review window.</p>
            ) : (
              Object.entries(operator.ai.metrics.failureCategories).map(([category, count]) => (
                <div key={category} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm font-medium">{category.replaceAll("_", " ")}</span>
                  <Badge variant="warning">{count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <OperationalQueuePanel
          title="Underwriting Queue"
          emptyText="No underwriting reviews waiting in the current window."
          items={operator.underwriting.queue.items.map((item) => ({
            id: item.applicationId,
            label: item.businessName,
            detail: `${item.status} / ${formatCurrency(item.requestedAmount)} / ${item.riskTier}`,
            tone: item.stale || item.riskTier === "critical" ? "warning" : "secondary"
          }))}
          nextOffset={operator.underwriting.queue.pagination.nextOffset}
        />
        <OperationalQueuePanel
          title="Intake Review"
          emptyText="No intake records waiting for operator review."
          items={operator.crm.intakeQueue.items.map((item) => ({
            id: item.id,
            label: item.business_name,
            detail: `${item.status} / ${item.industry} / ${formatCurrency(item.requested_amount)}`,
            tone: "secondary"
          }))}
          nextOffset={operator.crm.intakeQueue.pagination.nextOffset}
        />
        <OperationalQueuePanel
          title="Workflow Monitor"
          emptyText="No workflow traces in the current review window."
          items={operator.workflows.traces.items.map((item) => ({
            id: item.id,
            label: `${item.workflow_key} / ${item.step_key}`,
            detail: `${item.status} / ${item.latency_ms ?? 0}ms`,
            tone: item.status === "failed" ? "destructive" : item.status === "retried" ? "warning" : "secondary"
          }))}
          nextOffset={operator.workflows.traces.pagination.nextOffset}
        />
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

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function OperationalQueuePanel({
  title,
  emptyText,
  items,
  nextOffset
}: {
  title: string;
  emptyText: string;
  items: Array<{
    id: string;
    label: string;
    detail: string;
    tone: "secondary" | "warning" | "destructive";
  }>;
  nextOffset: number | null;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          {nextOffset !== null ? <Badge variant="outline">More</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-medium">{item.label}</p>
                <Badge variant={item.tone}>{item.tone}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
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
