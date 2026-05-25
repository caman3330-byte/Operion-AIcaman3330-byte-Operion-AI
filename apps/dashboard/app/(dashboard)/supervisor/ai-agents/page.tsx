import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  Mail,
  Route,
  ShieldAlert,
  Workflow
} from "lucide-react";
import { MetricCard } from "@/components/metrics/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getProductionSupervisorSummary } from "@/lib/data/supervisor-command";
import { getOperatorDashboardSummary } from "@/lib/operator-dashboard/service";
import { getApplicationWorkflowTimelines, type ApplicationWorkflowTimeline, type WorkflowTimelineState } from "@/lib/operator-dashboard/workflow-timeline";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const workflowPath = [
  "Merchant Applied",
  "Intake AI",
  "Document AI",
  "Underwriting AI",
  "Lender Match AI",
  "Submission Queue",
  "Lender Outreach",
  "Awaiting Response"
];

export default async function SupervisorAiAgentsPage() {
  const [operator, production, timelines] = await Promise.all([
    getOperatorDashboardSummary({ limit: 90 }),
    getProductionSupervisorSummary(),
    getApplicationWorkflowTimelines(10)
  ]);

  const agents = buildAgentCards({ operator, production, timelines });
  const activeAgents = agents.filter((agent) => agent.status === "active").length;
  const degradedAgents = agents.filter((agent) => agent.health === "watch" || agent.health === "blocked").length;
  const pendingUnderwriting = production.underwritingQueue;
  const pendingLenderResponses = timelines.filter((timeline) =>
    timeline.steps.some((step) => step.key === "waiting_lender_response" && step.state === "active")
  ).length;
  const totalEmailEvents = production.emailOperations.sent + production.emailOperations.failed;
  const emailSuccessRate = totalEmailEvents === 0 ? 100 : Math.round((production.emailOperations.sent / totalEmailEvents) * 100);
  const failureDiagnostics = [
    ...operator.workflows.traces.items
      .filter((trace) => trace.status === "failed" || Boolean(trace.error_message))
      .map((trace) => ({
        id: `workflow-${trace.id}`,
        type: "Workflow failure",
        reason: trace.error_message ?? `${trace.workflow_key} failed at ${trace.step_key}`,
        retryCount: trace.attempt,
        linkedApplicationId: trace.entity_type === "business_application" ? trace.entity_id : null,
        timestamp: trace.completed_at ?? trace.started_at ?? trace.created_at,
        actionHref: trace.entity_type === "business_application" && trace.entity_id ? `/merchants/${trace.entity_id}` : "/supervisor/testing"
      })),
    ...operator.ai.executions.items
      .filter((execution) => execution.status === "failed" || execution.status === "blocked")
      .map((execution) => {
        const linkedApplicationId = readLinkedApplicationId(execution.metadata);
        return {
          id: `ai-${execution.id}`,
          type: "AI execution failure",
          reason: execution.message,
          retryCount: readNumberFromRecord(execution.metadata, "attempt") ?? readNumberFromRecord(execution.metadata, "retry_count") ?? 0,
          linkedApplicationId,
          timestamp: execution.created_at,
          actionHref: linkedApplicationId ? `/merchants/${linkedApplicationId}` : "/supervisor/testing"
        };
      })
  ].slice(0, 6);
  const systemHealthItems = [
    {
      label: "Database",
      value: production.source === "supabase" && !production.migrationRequired ? "Live" : "Watch",
      tone: production.source === "supabase" && !production.migrationRequired ? "success" : "warning",
      detail: production.source === "supabase" ? "Supabase production schema responding" : "Schema availability needs review"
    },
    {
      label: "SendGrid",
      value: production.emailOperations.sendgridConfigured ? "Ready" : "Missing",
      tone: production.emailOperations.sendgridConfigured ? "success" : "warning",
      detail: `${production.emailOperations.sent} sent / ${production.emailOperations.failed} failed`
    },
    {
      label: "Uploads",
      value: production.operationalMetrics.uploadsPending > 0 ? "Pending" : "Clear",
      tone: production.operationalMetrics.uploadsPending > 0 ? "warning" : "success",
      detail: `${production.operationalMetrics.documentsUploaded} uploaded documents tracked`
    },
    {
      label: "AI execution",
      value: production.aiFailed > 0 ? "Watch" : "Ready",
      tone: production.aiFailed > 0 ? "warning" : "success",
      detail: `${production.aiQueued + production.aiRunning} active / ${production.aiCompleted} completed`
    },
    {
      label: "Routing engine",
      value: operator.lenders.matches.error ? "Watch" : "Ready",
      tone: operator.lenders.matches.error ? "warning" : "success",
      detail: operator.lenders.matches.error ?? `${production.lenderMatches} lender match record(s)`
    },
    {
      label: "Auth/session",
      value: "Protected",
      tone: "success",
      detail: "Middleware and server dashboard guard enabled"
    },
    {
      label: "Deployment",
      value: "Production",
      tone: "success",
      detail: "Vercel alias and runtime health verified during release"
    }
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">AI Operations Visibility</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-white">Agent Workflow Center</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Real operator visibility into AI queues, merchant workflow stages, lender routing, email delivery, document processing, and failure states.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={operator.health === "healthy" ? "success" : operator.health === "critical" ? "destructive" : "warning"}>
            {operator.health}
          </Badge>
          <Badge variant="outline">{production.source === "supabase" ? "Supabase live" : "Schema watch"}</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Active AI Agents" value={String(activeAgents)} detail={`${agents.length} operational agents monitored`} icon={Bot} tone={degradedAgents > 0 ? "warning" : "success"} />
        <MetricCard title="AI Queue Metrics" value={String(production.aiQueued + production.aiRunning)} detail={`${production.aiCompleted} completed / ${production.aiFailed} blocked`} icon={Activity} tone={production.aiFailed > 0 ? "warning" : "success"} />
        <MetricCard title="Pending Underwriting" value={String(pendingUnderwriting)} detail="Applications in review states" icon={FileText} tone={pendingUnderwriting > 0 ? "warning" : "success"} />
        <MetricCard title="Pending Lender Response" value={String(pendingLenderResponses)} detail={`${production.lenderMatches} lender routing record(s)`} icon={Route} tone={pendingLenderResponses > 0 ? "warning" : "success"} />
        <MetricCard title="Upload Completion" value={`${production.operationalMetrics.uploadCompletionRate}%`} detail={`${production.operationalMetrics.documentsUploaded} uploaded / ${production.operationalMetrics.uploadsPending} pending`} icon={CheckCircle2} tone={production.operationalMetrics.uploadsPending > 0 ? "warning" : "success"} />
        <MetricCard title="Email Delivery" value={`${emailSuccessRate}%`} detail={`${production.emailOperations.sent} sent / ${production.emailOperations.failed} failed`} icon={Mail} tone={production.emailOperations.failed > 0 ? "warning" : "success"} />
        <MetricCard title="Workflow Failures" value={String(operator.workflows.metrics.failureCount)} detail={`${operator.workflows.metrics.retryCount} retry event(s)`} icon={ShieldAlert} tone={operator.workflows.metrics.failureCount > 0 ? "danger" : "success"} />
        <MetricCard title="Average AI Latency" value={operator.ai.metrics.averageLatencyMs ? `${operator.ai.metrics.averageLatencyMs}ms` : "n/a"} detail="Latest execution log window" icon={Clock3} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>System Health Center</CardTitle>
              <Badge variant={degradedAgents > 0 || failureDiagnostics.length > 0 ? "warning" : "success"}>
                {degradedAgents > 0 || failureDiagnostics.length > 0 ? "Watch" : "Launch steady"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {systemHealthItems.map((item) => (
              <div key={item.label} className="rounded-md border border-white/[0.10] bg-black/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{item.label}</p>
                  <Badge variant={item.tone}>{item.value}</Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Failure Diagnostics</CardTitle>
              <Badge variant={failureDiagnostics.length > 0 ? "warning" : "success"}>
                {failureDiagnostics.length} active item(s)
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {failureDiagnostics.length === 0 ? (
              <p className="rounded-md border border-white/[0.10] bg-black/20 p-3 text-sm text-muted-foreground">
                No workflow or AI execution failures in the current review window.
              </p>
            ) : (
              failureDiagnostics.map((failure) => (
                <div key={failure.id} className="rounded-md border border-warning/25 bg-warning/10 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{failure.type}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{failure.reason}</p>
                    </div>
                    <Badge variant="warning">Retry {failure.retryCount}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{failure.linkedApplicationId ? `Application ${failure.linkedApplicationId.slice(0, 8)}` : "No linked application"}</span>
                    <span>{formatDateTime(failure.timestamp)}</span>
                    <a href={failure.actionHref} className="font-medium text-primary hover:underline">
                      Review
                    </a>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-primary/20 bg-[radial-gradient(circle_at_top,rgba(215,183,106,0.10),transparent_42%),rgba(255,255,255,0.025)]">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-4 w-4 text-primary" />
              Live Workflow Path
            </CardTitle>
            <Badge variant="secondary">Merchant to lender desk</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
            {workflowPath.map((stage, index) => (
              <div key={stage} className="relative rounded-md border border-white/[0.10] bg-black/20 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Step {index + 1}</p>
                <p className="mt-2 min-h-10 text-sm font-medium leading-5 text-white">{stage}</p>
                <div className="mt-3 h-1 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(18, ((index + 1) / workflowPath.length) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Operational AI Agents</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => {
            const Icon = agent.icon;
            return (
              <div key={agent.name} className="rounded-md border border-white/[0.10] bg-black/20 p-4 shadow-xl shadow-black/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="relative rounded-md border border-primary/20 bg-primary/10 p-2 text-primary">
                      <span className={cn("absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full", agent.status === "active" ? "bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.9)]" : "bg-muted")} />
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">{agent.purpose}</p>
                    </div>
                  </div>
                  <Badge variant={agent.health === "blocked" ? "destructive" : agent.health === "watch" ? "warning" : "success"}>
                    {agent.health}
                  </Badge>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2">
                  <AgentMetric label="Queue" value={String(agent.queueSize)} />
                  <AgentMetric label="Done" value={String(agent.completedToday)} />
                  <AgentMetric label="Failed" value={String(agent.failedTasks)} />
                  <AgentMetric label="Retry" value={String(agent.retryCount)} />
                </div>
                <div className="mt-4 space-y-2 text-xs leading-5 text-muted-foreground">
                  <p><span className="font-medium text-white">Current task:</span> {agent.currentTask}</p>
                  <p><span className="font-medium text-white">Last action:</span> {agent.lastAction}</p>
                  <p><span className="font-medium text-white">Last execution:</span> {formatDateTime(agent.lastExecutionAt)}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Merchant Workflow Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {timelines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No merchant application timelines are available in the current window.</p>
            ) : (
              timelines.slice(0, 6).map((timeline) => <TimelineCard key={timeline.applicationId} timeline={timeline} />)
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Routing Decision Logs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {timelines.flatMap((timeline) => timeline.routingLogs.map((log) => ({ id: `${timeline.applicationId}-${log}`, businessName: timeline.businessName, log }))).slice(0, 8).map((item) => (
                <LogRow key={item.id} label={item.businessName} detail={item.log} />
              ))}
              {timelines.every((timeline) => timeline.routingLogs.length === 0) ? (
                <p className="text-sm text-muted-foreground">No lender routing decisions recorded in this review window.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Email Delivery Logs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {timelines.flatMap((timeline) => timeline.emailDeliveryLogs.map((log) => ({ id: `${timeline.applicationId}-${log}`, businessName: timeline.businessName, log }))).slice(0, 8).map((item) => (
                <LogRow key={item.id} label={item.businessName} detail={item.log} />
              ))}
              {timelines.every((timeline) => timeline.emailDeliveryLogs.length === 0) ? (
                <p className="text-sm text-muted-foreground">No merchant or lender email delivery logs recorded in this window.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Document Processing Logs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {timelines.flatMap((timeline) => timeline.documentProcessingLogs.map((log) => ({ id: `${timeline.applicationId}-${log}`, businessName: timeline.businessName, log }))).slice(0, 8).map((item) => (
                <LogRow key={item.id} label={item.businessName} detail={item.log} />
              ))}
              {timelines.every((timeline) => timeline.documentProcessingLogs.length === 0) ? (
                <p className="text-sm text-muted-foreground">No document processing logs recorded in this window.</p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>AI Execution Feed</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Latency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operator.ai.executions.items.slice(0, 10).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell><Badge variant={item.status === "failed" ? "destructive" : item.status === "completed" ? "success" : "secondary"}>{item.status}</Badge></TableCell>
                    <TableCell>{item.provider ?? "unknown"}</TableCell>
                    <TableCell className="max-w-sm truncate text-muted-foreground">{item.message}</TableCell>
                    <TableCell>{item.latency_ms ? `${item.latency_ms}ms` : "n/a"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workflow Execution Feed</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operator.workflows.traces.items.slice(0, 10).map((trace) => (
                  <TableRow key={trace.id}>
                    <TableCell>{trace.workflow_key}</TableCell>
                    <TableCell>{trace.step_key}</TableCell>
                    <TableCell><Badge variant={trace.status === "failed" ? "destructive" : trace.status === "completed" ? "success" : "secondary"}>{trace.status}</Badge></TableCell>
                    <TableCell>{formatDateTime(trace.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TimelineCard({ timeline }: { timeline: ApplicationWorkflowTimeline }) {
  return (
    <div className="rounded-md border border-white/[0.10] bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/merchants/${timeline.applicationId}`} className="text-sm font-semibold text-white hover:text-primary">
            {timeline.businessName}
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">
            {timeline.ownerName} / {formatCurrency(timeline.requestedAmount)} / {timeline.currentStage}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{timeline.completionRate}%</Badge>
          <Badge variant={timeline.status === "funded" ? "success" : timeline.status === "rejected" ? "destructive" : "secondary"}>
            {timeline.status.replaceAll("_", " ")}
          </Badge>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-9">
        {timeline.steps.map((step) => (
          <div key={step.key} className={cn("rounded-md border p-2", stepStateClass(step.state))}>
            <p className="min-h-8 text-[11px] font-medium leading-4 text-white">{step.label}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{step.state}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Last activity: {formatDateTime(timeline.lastActivityAt)}</p>
    </div>
  );
}

function AgentMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/[0.08] bg-white/[0.025] p-2">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function LogRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-md border border-white/[0.10] bg-white/[0.025] p-3">
      <p className="text-sm font-medium text-white">{label}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function buildAgentCards(input: {
  operator: Awaited<ReturnType<typeof getOperatorDashboardSummary>>;
  production: Awaited<ReturnType<typeof getProductionSupervisorSummary>>;
  timelines: ApplicationWorkflowTimeline[];
}) {
  const { operator, production, timelines } = input;
  const activeTimeline = timelines[0];
  const recentAi = operator.ai.executions.items[0];
  const recentWorkflow = operator.workflows.traces.items[0];
  const lastTimelineActivity = activeTimeline?.lastActivityAt ?? recentWorkflow?.created_at ?? recentAi?.created_at ?? null;

  return [
    {
      name: "Intake AI",
      purpose: "Validates merchant applications",
      icon: Bot,
      status: production.operationalMetrics.applicationsReceivedToday > 0 || production.applications > 0 ? "active" : "standby",
      health: operator.crm.intakeQueue.items.length > 10 ? "watch" : "healthy",
      queueSize: operator.crm.intakeQueue.items.length,
      completedToday: production.operationalMetrics.applicationsReceivedToday,
      failedTasks: 0,
      retryCount: 0,
      currentTask: operator.crm.intakeQueue.items[0]?.business_name ?? "No intake item currently queued",
      lastAction: activeTimeline ? `Tracking ${activeTimeline.currentStage}` : "Awaiting merchant intake",
      lastExecutionAt: lastTimelineActivity
    },
    {
      name: "Underwriting AI",
      purpose: "Scores funding fit and risk",
      icon: ShieldAlert,
      status: production.underwritingQueue > 0 ? "active" : "standby",
      health: operator.underwriting.metrics.highRiskApplications > 0 || operator.ai.metrics.failedExecutions > 0 ? "watch" : "healthy",
      queueSize: production.underwritingQueue,
      completedToday: operator.ai.executions.items.filter((item) => includesAny(item.message, ["underwriting", "qualification"])).length,
      failedTasks: operator.ai.executions.items.filter((item) => item.status === "failed" && includesAny(item.message, ["underwriting", "qualification"])).length,
      retryCount: operator.workflows.traces.items.filter((trace) => trace.status === "retried" && includesAny(trace.workflow_key, ["underwriting", "qualification"])).length,
      currentTask: operator.underwriting.queue.items[0]?.businessName ?? "No funding review currently queued",
      lastAction: operator.underwriting.queue.items[0]?.summary ?? "Monitoring funding review queue",
      lastExecutionAt: operator.underwriting.queue.items[0]?.updatedAt ?? recentAi?.created_at ?? null
    },
    {
      name: "Document AI",
      purpose: "Tracks uploads and package readiness",
      icon: FileText,
      status: production.operationalMetrics.uploadsPending > 0 ? "active" : "standby",
      health: production.operationalMetrics.uploadsPending > 0 ? "watch" : "healthy",
      queueSize: production.operationalMetrics.uploadsPending,
      completedToday: production.operationalMetrics.documentsUploaded,
      failedTasks: 0,
      retryCount: operator.workflows.traces.items.filter((trace) => trace.status === "retried" && includesAny(trace.workflow_key, ["document", "upload"])).length,
      currentTask: production.operationalMetrics.uploadsPending > 0 ? "Awaiting requested bank statements" : "Document queue clear",
      lastAction: `${production.operationalMetrics.uploadCompletionRate}% package completion`,
      lastExecutionAt: lastTimelineActivity
    },
    {
      name: "Lender Match AI",
      purpose: "Suggests routing targets",
      icon: Route,
      status: production.lenderMatches > 0 ? "active" : "standby",
      health: production.pendingApprovals > 0 ? "watch" : "healthy",
      queueSize: operator.lenders.matches.items.filter((match) => match.status === "recommended" || match.status === "approved").length,
      completedToday: production.lenderMatches,
      failedTasks: operator.lenders.matches.items.filter((match) => match.status === "rejected").length,
      retryCount: operator.workflows.traces.items.filter((trace) => trace.status === "retried" && includesAny(trace.workflow_key, ["lender", "routing", "match"])).length,
      currentTask: operator.lenders.matches.items[0]?.notes ?? "No active lender routing decision",
      lastAction: `${Math.round(operator.lenders.metrics.successRate * 100)}% routing success signal`,
      lastExecutionAt: operator.lenders.matches.items[0]?.updated_at ?? recentWorkflow?.created_at ?? null
    },
    {
      name: "Outreach AI",
      purpose: "Tracks lender and merchant communications",
      icon: Mail,
      status: production.emailOperations.sent > 0 ? "active" : "standby",
      health: production.emailOperations.failed > 0 ? "watch" : "healthy",
      queueSize: production.emailOperations.failed,
      completedToday: production.operationalMetrics.outreachSentToday,
      failedTasks: production.emailOperations.failed,
      retryCount: operator.workflows.traces.items.filter((trace) => trace.status === "retried" && includesAny(trace.workflow_key, ["email", "outreach"])).length,
      currentTask: production.emailOperations.failed > 0 ? "Review failed email delivery" : "Email delivery path nominal",
      lastAction: `${production.emailOperations.sent} sent / ${production.emailOperations.replies} reply signal(s)`,
      lastExecutionAt: lastTimelineActivity
    },
    {
      name: "Operations AI",
      purpose: "Monitors queues and stuck workflows",
      icon: Activity,
      status: operator.workflows.metrics.failureCount > 0 || production.aiQueued + production.aiRunning > 0 ? "active" : "standby",
      health: operator.workflows.metrics.failureCount > 0 ? "blocked" : operator.workflows.metrics.retryCount > 0 ? "watch" : "healthy",
      queueSize: production.aiQueued + production.aiRunning + operator.workflows.metrics.retryCount,
      completedToday: production.aiCompleted,
      failedTasks: operator.workflows.metrics.failureCount,
      retryCount: operator.workflows.metrics.retryCount,
      currentTask: operator.workflows.metrics.failureCount > 0 ? "Workflow failure review required" : "Monitoring operational heartbeat",
      lastAction: recentWorkflow ? `${recentWorkflow.workflow_key} / ${recentWorkflow.step_key}` : "No recent workflow trace",
      lastExecutionAt: recentWorkflow?.created_at ?? recentAi?.created_at ?? null
    }
  ] as const;
}

function stepStateClass(state: WorkflowTimelineState) {
  if (state === "complete") return "border-emerald-400/20 bg-emerald-400/10";
  if (state === "active") return "border-primary/30 bg-primary/10";
  if (state === "failed") return "border-red-400/25 bg-red-400/10";
  return "border-white/[0.08] bg-white/[0.025]";
}

function includesAny(value: string | null | undefined, needles: string[]) {
  const normalized = (value ?? "").toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

function readLinkedApplicationId(value: unknown) {
  if (!isRecord(value)) return null;
  const applicationId = value.business_application_id ?? value.businessApplicationId ?? value.application_id ?? value.applicationId;
  return typeof applicationId === "string" ? applicationId : null;
}

function readNumberFromRecord(value: unknown, key: string) {
  if (!isRecord(value)) return null;
  const candidate = value[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
