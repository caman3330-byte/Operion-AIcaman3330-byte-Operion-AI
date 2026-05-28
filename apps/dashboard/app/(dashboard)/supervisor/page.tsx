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
  Workflow,
  XCircle
} from "lucide-react";
import { getSupervisorSummary } from "@/lib/agent-orchestration/orchestrator";
import { getProductionSupervisorSummary } from "@/lib/data/supervisor-command";
import { getOperatorDashboardSummary } from "@/lib/operator-dashboard/service";
import { getApplicationWorkflowTimelines } from "@/lib/operator-dashboard/workflow-timeline";
import { getLaunchMonitoringSnapshot } from "@/lib/operations/monitoring";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { MetricCard } from "@/components/metrics/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkflowActionButtons } from "@/components/supervisor/workflow-action-buttons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SupervisorPage({
  searchParams
}: {
  searchParams?: Promise<{ approvalFilter?: string }>;
}) {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;
  const params = await searchParams;
  const approvalFilter = normalizeApprovalFilter(params?.approvalFilter);

  const [summary, production, operator, monitoring, timelines] = await Promise.all([
    getSupervisorSummary(),
    getProductionSupervisorSummary(),
    getOperatorDashboardSummary({ limit: 8 }),
    getLaunchMonitoringSnapshot({ limit: 60 }),
    getApplicationWorkflowTimelines(4)
  ]);
  const emailTotal = production.emailOperations.sent + production.emailOperations.failed;
  const emailSuccessRate = emailTotal === 0 ? 100 : Math.round((production.emailOperations.sent / emailTotal) * 100);
  const activeApplications =
    production.lifecycle.raw + production.lifecycle.qualified + production.lifecycle.reviewed + production.lifecycle.routed;
  const founderMetrics = [
    ["Active applications", String(activeApplications), "Open merchant files"],
    ["Pending reviews", String(production.pendingApprovals + production.underwritingQueue), "Approvals + funding review"],
    ["AI workflows running", String(production.aiQueued + production.aiRunning), `${production.aiFailed} failed or blocked`],
    ["Lender routes today", String(production.lenderMatches), "Routing records monitored"],
    ["Failed workflows", String(operator.workflows.metrics.failureCount), `${operator.workflows.metrics.retryCount} retry event(s)`],
    ["Upload activity", `${production.operationalMetrics.uploadCompletionRate}%`, `${production.operationalMetrics.uploadsPending} pending`],
    ["Email delivery health", `${emailSuccessRate}%`, `${production.emailOperations.failed} failed`],
    ["Underwriting queue", String(production.underwritingQueue), "Queued or escalated"]
  ];
  const pendingLenderResponses = timelines.filter((timeline) =>
    timeline.steps.some((step) => step.key === "waiting_lender_response" && step.state === "active")
  ).length;
  const pendingApprovalCount = Math.max(production.pendingApprovals, summary.pending_approvals);
  const queuedAiCount = production.aiQueued + production.aiRunning;
  const blockedAiCount = production.aiFailed;
  const workflowExceptionCount = summary.failed_tasks + monitoring.counters.workflowFailures;
  const oldestQueuedAgeLabel = formatQueueAge(production.operationalMetrics.oldestAiQueuedAgeHours);
  const reviewTasks = summary.tasks
    .filter((task) => task.status === "queued" || task.status === "assigned" || task.status === "blocked" || task.status === "failed")
    .map((task) => ({ ...task, ageHours: taskAgeHours(task) }))
    .sort(sortReviewTasks);
  const scopedReviewTasks = reviewTasks.map((task) => ({ ...task, scope: classifyOperationalScope(task).scope }));
  const liveReviewTasks = scopedReviewTasks.filter((task) => task.scope === "live");
  const qaReviewTasks = scopedReviewTasks.filter((task) => task.scope === "qa");
  const unresolvedLiveWorkflows = liveReviewTasks.filter((task) => task.status !== "completed" && task.status !== "cancelled");
  const pendingFounderApprovals = summary.approvals
    .filter((approval) => approval.status === "pending")
    .map((approval) => ({
      ...approval,
      ageHours: taskAgeHours(approval),
      scope: classifyOperationalScope(approval).scope
    }))
    .sort(sortOldestFirst);
  const pendingLiveApprovals = pendingFounderApprovals.filter((approval) => approval.scope === "live").length;
  const pendingQaApprovals = pendingFounderApprovals.length - pendingLiveApprovals;
  const oldestPendingApprovalAgeLabel = formatQueueAge(pendingFounderApprovals[0]?.ageHours ?? null);
  const missingDocumentApprovals = pendingFounderApprovals.filter(hasMissingDocumentSignal);
  const fundingReadyApprovals = pendingFounderApprovals.filter(hasFundingReadySignal);
  const highRiskApprovals = pendingFounderApprovals.filter((approval) => Number(approval.ageHours ?? 0) >= 72);
  const filteredFounderApprovals = filterApprovals(pendingFounderApprovals, approvalFilter);
  const approvalAverageAgeLabel = formatQueueAge(averageAgeHours(pendingFounderApprovals));
  const workflowStallMetrics = buildWorkflowStallMetrics(scopedReviewTasks);
  const workflowBottlenecks = buildWorkflowBottlenecks({
    approvals: pendingFounderApprovals,
    reviewTasks: scopedReviewTasks,
    missingDocumentCount: missingDocumentApprovals.length
  });
  const approvalFilters = [
    { key: "oldest", label: "Oldest first", count: pendingFounderApprovals.length },
    { key: "live", label: "Live only", count: pendingLiveApprovals },
    { key: "qa", label: "QA only", count: pendingQaApprovals },
    { key: "risk", label: "Highest risk", count: highRiskApprovals.length },
    { key: "missing_docs", label: "Missing documents", count: missingDocumentApprovals.length },
    { key: "funding_ready", label: "Funding ready", count: fundingReadyApprovals.length }
  ] satisfies Array<{ key: ApprovalFilter; label: string; count: number }>;
  const oldestReviewTaskAgeLabel = formatQueueAge(reviewTasks[0]?.ageHours ?? null);
  const oldestUnderwritingAgeLabel =
    operator.underwriting.queue.items.length > 0
      ? formatQueueAge(Math.max(...operator.underwriting.queue.items.map((item) => item.staleHours)))
      : "not aged";
  const qaReviewTaskCount = qaReviewTasks.length;
  const qaUnderwritingCount = operator.underwriting.queue.items.filter((item) => classifyOperationalScope(item).scope === "qa").length;
  const qaIntakeCount = operator.crm.intakeQueue.items.filter((item) => classifyOperationalScope(item).scope === "qa").length;
  const qaWorkflowTraceCount = operator.workflows.traces.items.filter((item) => classifyOperationalScope(item).scope === "qa").length;
  const manualReadinessScore = Math.max(
    0,
    100 -
      Math.min(28, pendingApprovalCount * 4) -
      Math.min(24, blockedAiCount * 3) -
      Math.min(18, production.underwritingQueue * 2) -
      Math.min(18, workflowExceptionCount * 3) -
      Math.min(12, monitoring.counters.retryCount * 2)
  );
  const manualReadinessTone =
    manualReadinessScore >= 80 ? "operational" : manualReadinessScore >= 60 ? "watch" : "needs review";
  const founderActionItems = [
    {
      label: "Approvals",
      count: pendingApprovalCount,
      detail:
        pendingApprovalCount > 0
          ? `Oldest pending approval is ${oldestPendingApprovalAgeLabel}.`
          : "No approval backlog.",
      tone: pendingApprovalCount > 0 ? "warning" : "success",
      icon: CheckCircle2
    },
    {
      label: "Blocked AI",
      count: blockedAiCount,
      detail:
        blockedAiCount > 0
          ? "Keep blocked items founder-reviewed until missing context is resolved."
          : "No blocked AI tasks.",
      tone: blockedAiCount > 0 ? "danger" : "success",
      icon: Bot
    },
    {
      label: "AI Queue",
      count: queuedAiCount,
      detail: queuedAiCount > 0 ? `Oldest queued task is ${oldestQueuedAgeLabel}.` : "No active AI queue pressure.",
      tone: queuedAiCount > 0 ? "warning" : "success",
      icon: Workflow
    },
    {
      label: "Underwriting",
      count: production.underwritingQueue,
      detail:
        production.underwritingQueue > 0 ? "Manual review needed before lender routing." : "No underwriting queue backlog.",
      tone: production.underwritingQueue > 0 ? "warning" : "success",
      icon: FileText
    },
    {
      label: "Workflow Exceptions",
      count: workflowExceptionCount,
      detail:
        workflowExceptionCount > 0
          ? `Oldest review task is ${oldestReviewTaskAgeLabel}.`
          : "No workflow exceptions reported.",
      tone: workflowExceptionCount > 0 ? "danger" : "success",
      icon: AlertTriangle
    }
  ];
  const workflowAgingItems = [
    {
      label: "Oldest queued AI",
      value: oldestQueuedAgeLabel,
      detail: `${queuedAiCount} active AI task(s)`
    },
    {
      label: "Oldest review task",
      value: oldestReviewTaskAgeLabel,
      detail: `${reviewTasks.length} queued, blocked, or failed task(s)`
    },
    {
      label: "Oldest underwriting item",
      value: oldestUnderwritingAgeLabel,
      detail: `${production.underwritingQueue} application(s) in review`
    },
    {
      label: "Stale workflow signals",
      value: String(monitoring.counters.workflowFailures + monitoring.counters.staleLeads),
      detail: `${monitoring.counters.retryCount} retry event(s)`
    }
  ];
  const qaVisibilityItems = [
    ["Review tasks", qaReviewTaskCount, `${reviewTasks.length} active review task(s)`],
    ["Underwriting", qaUnderwritingCount, `${operator.underwriting.queue.items.length} visible item(s)`],
    ["Intake", qaIntakeCount, `${operator.crm.intakeQueue.items.length} visible item(s)`],
    ["Workflow traces", qaWorkflowTraceCount, `${operator.workflows.traces.items.length} recent trace(s)`]
  ];

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

      <Card className="overflow-hidden border-primary/20 bg-[radial-gradient(circle_at_top_left,rgba(215,183,106,0.10),transparent_38%),rgba(255,255,255,0.025)]">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Founder Operations Header</CardTitle>
            <Badge variant={operator.health === "healthy" ? "success" : operator.health === "critical" ? "destructive" : "warning"}>
              {operator.health}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {founderMetrics.map(([label, value, detail]) => (
            <div key={label} className="rounded-md border border-white/[0.10] bg-black/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
              <p className="mt-2 text-xl font-semibold text-white">{value}</p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-primary/25 bg-primary/5 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Founder Action Queue</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Manual priorities for controlled live beta operations.</p>
          </div>
          <Badge variant={manualReadinessScore >= 80 ? "success" : manualReadinessScore >= 60 ? "warning" : "destructive"}>
            {manualReadinessScore}/100 {manualReadinessTone}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {founderActionItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-md border bg-background/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-2xl font-semibold tracking-normal text-white">{item.count}</p>
                  </div>
                  <Icon
                    className={
                      item.tone === "danger"
                        ? "h-5 w-5 text-destructive"
                        : item.tone === "warning"
                          ? "h-5 w-5 text-amber-600"
                          : "h-5 w-5 text-emerald-600"
                    }
                  />
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">{item.detail}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workflow Aging Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {workflowAgingItems.map((item) => (
            <div key={item.label} className="rounded-md border bg-white/[0.025] p-3">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-lg font-semibold text-white">{item.value}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>QA / Live Separation</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {qaVisibilityItems.map(([label, value, detail]) => (
            <div key={label} className="rounded-md border bg-white/[0.025] p-3">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
              <p className="mt-2 text-lg font-semibold text-white">{value} QA</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <ApprovalActionCenter
        activeFilter={approvalFilter}
        averageAgeLabel={approvalAverageAgeLabel}
        bottlenecks={workflowBottlenecks}
        filters={approvalFilters}
        fundingReadyCount={fundingReadyApprovals.length}
        liveCount={pendingLiveApprovals}
        missingDocumentCount={missingDocumentApprovals.length}
        oldestApproval={pendingFounderApprovals[0] ?? null}
        qaCount={pendingQaApprovals}
        stallMetrics={workflowStallMetrics}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <QueuePanel title="Live-Only Queue View" tasks={liveReviewTasks} />
        <QueuePanel title="QA-Only Queue View" tasks={qaReviewTasks} />
        <QueuePanel title="Unresolved Live Workflows" tasks={unresolvedLiveWorkflows} />
      </div>

      <PendingApprovalsPanel
        activeFilter={approvalFilter}
        approvals={filteredFounderApprovals}
        liveCount={pendingLiveApprovals}
        qaCount={pendingQaApprovals}
      />

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
        <MetricCard title="Email Success" value={`${emailSuccessRate}%`} detail="Tracked SendGrid/outreach log success" icon={Mail} tone={production.emailOperations.failed > 0 ? "warning" : "success"} />
        <MetricCard title="Lender Responses Pending" value={String(pendingLenderResponses)} detail="Submitted packages awaiting desk response" icon={Workflow} tone={pendingLenderResponses > 0 ? "warning" : "success"} />
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

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-4 w-4 text-primary" />
              Merchant Workflow Timeline
            </CardTitle>
            <Badge variant="outline">Supervisor only</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {timelines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No application lifecycle records available in the current window.</p>
          ) : (
            timelines.map((timeline) => (
              <div key={timeline.applicationId} className="rounded-md border border-white/[0.10] bg-white/[0.025] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{timeline.businessName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {timeline.currentStage} / {timeline.completionRate}% complete / last activity {formatDateTime(timeline.lastActivityAt)}
                    </p>
                  </div>
                  <Badge variant={timeline.status === "funded" ? "success" : timeline.status === "rejected" ? "destructive" : "secondary"}>
                    {timeline.status.replaceAll("_", " ")}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-9">
                  {timeline.steps.map((step) => (
                    <div key={step.key} className="rounded-md border border-white/[0.08] bg-black/20 p-2">
                      <p className="min-h-8 text-[11px] font-medium leading-4 text-white">{step.label}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{step.state}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
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
            tone: item.stale || item.riskTier === "critical" ? "warning" : "secondary",
            scope: classifyOperationalScope(item).scope
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
            tone: "secondary",
            scope: classifyOperationalScope(item).scope
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
            tone: item.status === "failed" ? "destructive" : item.status === "retried" ? "warning" : "secondary",
            scope: classifyOperationalScope(item).scope
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

      <div className="grid gap-4 xl:grid-cols-4">
        <QueuePanel
          title="Queued / Blocked Tasks"
          tasks={scopedReviewTasks.filter((task) => task.status === "queued" || task.status === "assigned" || task.status === "blocked")}
        />
        <QueuePanel title="Running Tasks" tasks={summary.tasks.filter((task) => task.status === "running").map((task) => ({ ...task, ageHours: taskAgeHours(task) }))} />
        <QueuePanel title="Completed Tasks" tasks={summary.tasks.filter((task) => task.status === "completed").map((task) => ({ ...task, ageHours: taskAgeHours(task) }))} />
        <QueuePanel title="Failed Tasks" tasks={scopedReviewTasks.filter((task) => task.status === "failed")} />
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

function QueuePanel({
  title,
  tasks
}: {
  title: string;
  tasks: Array<{
    id: string;
    title: string;
    assigned_agent_key: string;
    workflow_key?: string | null;
    status?: string;
    priority?: string | null;
    approval_id?: string | null;
    context?: unknown;
    ageHours?: number | null;
    scope?: "live" | "qa";
  }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks in this state.</p>
        ) : (
          tasks.slice(0, 6).map((task) => {
            const scope = task.scope ?? classifyOperationalScope(task).scope;
            return (
            <div key={task.id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{task.title}</p>
                {task.status ? (
                  <Badge variant={task.status === "blocked" || task.status === "failed" ? "destructive" : "secondary"}>
                    {task.status}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {task.workflow_key ?? "manual"} / {task.assigned_agent_key}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant={(task.ageHours ?? 0) >= 72 ? "warning" : "outline"}>{formatQueueAge(task.ageHours ?? null)}</Badge>
                {task.approval_id ? <Badge variant="warning">approval needed</Badge> : null}
                {task.priority ? <Badge variant="outline">{task.priority}</Badge> : null}
                <Badge variant={scope === "qa" ? "warning" : "outline"}>
                  {scope === "qa" ? "QA" : "live"}
                </Badge>
              </div>
              <WorkflowActionButtons taskId={task.id} scope={scope} status={task.status} />
            </div>
          );
          })
        )}
      </CardContent>
    </Card>
  );
}

type ApprovalFilter = "oldest" | "live" | "qa" | "risk" | "missing_docs" | "funding_ready";

type SupervisorApprovalItem = {
  id: string;
  title: string;
  approval_type: string;
  requested_by_agent_key: string;
  task_id: string | null;
  created_at: string;
  details?: unknown;
  ageHours?: number | null;
  scope?: "live" | "qa";
};

function ApprovalActionCenter({
  activeFilter,
  averageAgeLabel,
  bottlenecks,
  filters,
  fundingReadyCount,
  liveCount,
  missingDocumentCount,
  oldestApproval,
  qaCount,
  stallMetrics
}: {
  activeFilter: ApprovalFilter;
  averageAgeLabel: string;
  bottlenecks: Array<{ label: string; value: number; detail: string; tone: "outline" | "warning" | "destructive" }>;
  filters: Array<{ key: ApprovalFilter; label: string; count: number }>;
  fundingReadyCount: number;
  liveCount: number;
  missingDocumentCount: number;
  oldestApproval: SupervisorApprovalItem | null;
  qaCount: number;
  stallMetrics: Array<{ label: string; value: number; detail: string; tone: "outline" | "warning" | "destructive" }>;
}) {
  return (
    <Card className="border-amber-500/30 bg-gradient-to-b from-amber-500/[0.08] to-background">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Approval Action Center</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Founder-gated approvals and stalled workflow intelligence.</p>
          </div>
          <Badge variant={oldestApproval ? approvalAgeBucket(oldestApproval.ageHours ?? null).variant : "success"}>
            {oldestApproval ? approvalAgeBucket(oldestApproval.ageHours ?? null).label : "clear"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ActionCenterStat
            label="oldest pending approval"
            value={oldestApproval ? formatQueueAge(oldestApproval.ageHours ?? null) : "none"}
            detail={oldestApproval?.title ?? "No founder approval gate is open."}
            tone={oldestApproval ? approvalAgeBucket(oldestApproval.ageHours ?? null).variant : "outline"}
          />
          <ActionCenterStat label="average approval age" value={averageAgeLabel} detail={`${liveCount} live / ${qaCount} QA`} />
          <ActionCenterStat
            label="missing documents"
            value={String(missingDocumentCount)}
            detail="Approval text or context references documents, uploads, or statements."
            tone={missingDocumentCount > 0 ? "warning" : "outline"}
          />
          <ActionCenterStat
            label="funding ready"
            value={String(fundingReadyCount)}
            detail="Distribution, lender, or routing approvals ready for founder review."
            tone={fundingReadyCount > 0 ? "warning" : "outline"}
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Quick filters</p>
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => {
              const active = activeFilter === filter.key;
              return (
                <a
                  key={filter.key}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors",
                    active
                      ? "border-amber-400 bg-amber-400/15 text-amber-100"
                      : "border-border bg-background/70 text-muted-foreground hover:border-amber-500/60 hover:text-foreground"
                  )}
                  href={`/supervisor?approvalFilter=${filter.key}#pending-approvals`}
                >
                  <span>{filter.label}</span>
                  <Badge variant={filter.count > 0 ? "outline" : "secondary"}>{filter.count}</Badge>
                </a>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <OperationalSignalGroup title="Workflow Bottlenecks" items={bottlenecks} />
          <OperationalSignalGroup title="Workflow Stall Detection" items={stallMetrics} />
        </div>
      </CardContent>
    </Card>
  );
}

function ActionCenterStat({
  label,
  value,
  detail,
  tone = "outline"
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "outline" | "secondary" | "warning" | "destructive";
}) {
  return (
    <div className={cn("rounded-md border bg-background/80 p-3", tone === "destructive" ? "border-destructive/60" : tone === "warning" ? "border-amber-500/60" : "")}>
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function OperationalSignalGroup({
  title,
  items
}: {
  title: string;
  items: Array<{ label: string; value: number; detail: string; tone: "outline" | "warning" | "destructive" }>;
}) {
  return (
    <div className="rounded-md border bg-background/70 p-3">
      <p className="text-sm font-medium text-white">{title}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-md border bg-white/[0.025] p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{item.label}</p>
              <Badge variant={item.tone}>{item.value}</Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PendingApprovalsPanel({
  activeFilter,
  approvals,
  liveCount,
  qaCount
}: {
  activeFilter: ApprovalFilter;
  approvals: SupervisorApprovalItem[];
  liveCount: number;
  qaCount: number;
}) {
  const oldestAgeLabel = formatQueueAge(approvals[0]?.ageHours ?? null);
  const approvalTypes = approvals.reduce<Record<string, number>>((counts, approval) => {
    const label = approval.approval_type.replaceAll("_", " ");
    counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }, {});
  const approvalTypeSummary = Object.entries(approvalTypes)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 3)
    .map(([label, count]) => `${count} ${label}`)
    .join(" / ");

  return (
    <Card id="pending-approvals">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Pending Founder Approvals</CardTitle>
          <Badge variant={approvals.length > 0 ? "warning" : "success"}>{approvals.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {approvals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No approval requests are waiting on founder review.</p>
        ) : (
          <>
            <div className="grid gap-2 md:grid-cols-3">
              <MiniApprovalStat label="oldest gate" value={oldestAgeLabel} />
              <MiniApprovalStat label="live / QA" value={`${liveCount} / ${qaCount}`} />
              <MiniApprovalStat label="top types" value={approvalTypeSummary || "pending review"} />
            </div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {approvalFilterLabel(activeFilter)} approvals
            </p>
            {approvals.slice(0, 8).map((approval) => {
              const scope = approval.scope ?? classifyOperationalScope(approval).scope;
              const ageBucket = approvalAgeBucket(approval.ageHours ?? taskAgeHours(approval));
              return (
                <div
                  key={approval.id}
                  className={cn(
                    "rounded-md border p-3",
                    ageBucket.key === "7d+" ? "border-destructive/60 bg-destructive/[0.05]" : ageBucket.key === "72h+" ? "border-amber-500/60 bg-amber-500/[0.04]" : ""
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 text-sm font-medium">{approval.title}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={ageBucket.variant}>{ageBucket.label}</Badge>
                      <Badge variant="warning">{approval.approval_type.replaceAll("_", " ")}</Badge>
                      <Badge variant={scope === "qa" ? "warning" : "outline"}>{scope === "qa" ? "QA" : "live"}</Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {approval.requested_by_agent_key} / {formatQueueAge(approval.ageHours ?? taskAgeHours(approval))} / task{" "}
                    {approval.task_id ?? "unlinked"}
                  </p>
                </div>
              );
            })}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MiniApprovalStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white/[0.025] p-3">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
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
    scope?: "live" | "qa";
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
                <div className="flex flex-wrap gap-2">
                  <Badge variant={item.scope === "qa" ? "warning" : "outline"}>{item.scope === "qa" ? "QA" : "live"}</Badge>
                  <Badge variant={item.tone}>{item.tone}</Badge>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function normalizeApprovalFilter(value: string | undefined): ApprovalFilter {
  const allowed: ApprovalFilter[] = ["oldest", "live", "qa", "risk", "missing_docs", "funding_ready"];
  return allowed.includes(value as ApprovalFilter) ? (value as ApprovalFilter) : "oldest";
}

function approvalFilterLabel(filter: ApprovalFilter) {
  if (filter === "live") return "Live-only";
  if (filter === "qa") return "QA-only";
  if (filter === "risk") return "Highest-risk";
  if (filter === "missing_docs") return "Missing-document";
  if (filter === "funding_ready") return "Funding-ready";
  return "Oldest-first";
}

function filterApprovals<T extends SupervisorApprovalItem>(approvals: T[], filter: ApprovalFilter) {
  if (filter === "live") return approvals.filter((approval) => approval.scope === "live");
  if (filter === "qa") return approvals.filter((approval) => approval.scope === "qa");
  if (filter === "risk") return approvals.filter((approval) => Number(approval.ageHours ?? 0) >= 72);
  if (filter === "missing_docs") return approvals.filter(hasMissingDocumentSignal);
  if (filter === "funding_ready") return approvals.filter(hasFundingReadySignal);
  return approvals;
}

function approvalAgeBucket(ageHours: number | null): {
  key: "<24h" | "24-72h" | "72h+" | "7d+";
  label: string;
  variant: "outline" | "secondary" | "warning" | "destructive";
} {
  const age = Number(ageHours ?? 0);
  if (age >= 168) return { key: "7d+", label: "7d+", variant: "destructive" };
  if (age >= 72) return { key: "72h+", label: "72h+", variant: "warning" };
  if (age >= 24) return { key: "24-72h", label: "24-72h", variant: "secondary" };
  return { key: "<24h", label: "<24h", variant: "outline" };
}

function averageAgeHours(items: Array<{ ageHours?: number | null }>) {
  const ages = items.map((item) => item.ageHours).filter((age): age is number => typeof age === "number");
  if (ages.length === 0) return null;
  return Number((ages.reduce((total, age) => total + age, 0) / ages.length).toFixed(1));
}

function buildWorkflowBottlenecks({
  approvals,
  reviewTasks,
  missingDocumentCount
}: {
  approvals: SupervisorApprovalItem[];
  reviewTasks: Array<{ title: string; workflow_key?: string | null; status?: string; approval_id?: string | null; ageHours?: number | null; context?: unknown }>;
  missingDocumentCount: number;
}) {
  const founderActionCount = approvals.filter((approval) => !hasMissingDocumentSignal(approval)).length;
  const lenderRoutingCount = reviewTasks.filter(hasLenderRoutingSignal).length + approvals.filter(hasFundingReadySignal).length;
  const criticalAgingCount = approvals.filter((approval) => Number(approval.ageHours ?? 0) >= 168).length;

  return [
    {
      label: "missing docs",
      value: missingDocumentCount,
      detail: "Needs document or upload follow-up before approval can move cleanly.",
      tone: missingDocumentCount > 0 ? "warning" : "outline"
    },
    {
      label: "founder action",
      value: founderActionCount,
      detail: "Approval gates waiting on a human decision, not automation.",
      tone: founderActionCount > 0 ? "warning" : "outline"
    },
    {
      label: "lender routing",
      value: lenderRoutingCount,
      detail: "Funding distribution or lender matching items waiting for review.",
      tone: lenderRoutingCount > 0 ? "warning" : "outline"
    },
    {
      label: "critical aging",
      value: criticalAgingCount,
      detail: "Pending approvals aged seven days or more.",
      tone: criticalAgingCount > 0 ? "destructive" : "outline"
    }
  ] satisfies Array<{ label: string; value: number; detail: string; tone: "outline" | "warning" | "destructive" }>;
}

function buildWorkflowStallMetrics(
  reviewTasks: Array<{ title: string; workflow_key?: string | null; status?: string; approval_id?: string | null; ageHours?: number | null; context?: unknown }>
) {
  const inactive24h = reviewTasks.filter((task) => Number(task.ageHours ?? 0) >= 24).length;
  const inactive72h = reviewTasks.filter((task) => Number(task.ageHours ?? 0) >= 72).length;
  const founderReview = reviewTasks.filter((task) => Boolean(task.approval_id) || task.status === "blocked").length;
  const lenderRouting = reviewTasks.filter(hasLenderRoutingSignal).length;

  return [
    {
      label: "inactive >24h",
      value: inactive24h,
      detail: "Open workflow tasks with no recent state movement for at least one day.",
      tone: inactive24h > 0 ? "warning" : "outline"
    },
    {
      label: "inactive >72h",
      value: inactive72h,
      detail: "Stalled items that should be reviewed before broader live onboarding.",
      tone: inactive72h > 0 ? "destructive" : "outline"
    },
    {
      label: "manual review",
      value: founderReview,
      detail: "Items awaiting founder or supervisor review.",
      tone: founderReview > 0 ? "warning" : "outline"
    },
    {
      label: "lender routing",
      value: lenderRouting,
      detail: "Items that appear to be waiting on lender matching or distribution review.",
      tone: lenderRouting > 0 ? "warning" : "outline"
    }
  ] satisfies Array<{ label: string; value: number; detail: string; tone: "outline" | "warning" | "destructive" }>;
}

function hasMissingDocumentSignal(record: unknown) {
  const text = recordText(record);
  return text.includes("document") || text.includes("upload") || text.includes("statement") || text.includes("bank_statement") || text.includes("missing docs");
}

function hasFundingReadySignal(record: unknown) {
  const text = recordText(record);
  return text.includes("distribution") || text.includes("lender") || text.includes("routing") || text.includes("funding") || text.includes("offer");
}

function hasLenderRoutingSignal(record: unknown) {
  const text = recordText(record);
  return text.includes("lender") || text.includes("routing") || text.includes("distribution") || text.includes("match");
}

function recordText(record: unknown) {
  return JSON.stringify(record ?? {}).toLowerCase();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 4 : 2
  }).format(value);
}

function formatQueueAge(value: number | null) {
  if (value === null) {
    return "not aged";
  }

  if (value < 1) {
    return "under 1 hour old";
  }

  if (value < 24) {
    return `${value.toFixed(1)} hours old`;
  }

  return `${(value / 24).toFixed(1)} days old`;
}

function taskAgeHours(task: { updated_at?: string | null; created_at?: string | null }) {
  const timestamp = task.updated_at ?? task.created_at;
  if (!timestamp) {
    return null;
  }

  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Number(((Date.now() - parsed) / 3600000).toFixed(1));
}

function sortReviewTasks<T extends { status?: string; priority?: string | null; ageHours?: number | null }>(a: T, b: T) {
  return taskUrgency(b) - taskUrgency(a) || Number(b.ageHours ?? 0) - Number(a.ageHours ?? 0);
}

function sortOldestFirst<T extends { ageHours?: number | null }>(a: T, b: T) {
  return Number(b.ageHours ?? 0) - Number(a.ageHours ?? 0);
}

function taskUrgency(task: { status?: string; priority?: string | null; ageHours?: number | null }) {
  const statusScore = task.status === "blocked" || task.status === "failed" ? 40 : task.status === "queued" ? 20 : 10;
  const priorityScore = task.priority === "critical" ? 30 : task.priority === "high" ? 20 : task.priority === "medium" ? 10 : 0;
  const ageScore = (task.ageHours ?? 0) >= 72 ? 20 : (task.ageHours ?? 0) >= 24 ? 10 : 0;
  return statusScore + priorityScore + ageScore;
}

function classifyOperationalScope(record: unknown): { scope: "live" | "qa"; label: "live" | "QA" } {
  const text = JSON.stringify(record ?? {}).toLowerCase();
  const isQa =
    text.includes('"is_test_data":true') ||
    text.includes('"test_mode":true') ||
    text.includes('"simulation":true') ||
    text.includes("simulation") ||
    text.includes("operion-e2e") ||
    text.includes("live-verification") ||
    text.includes("approval verification") ||
    text.includes(".test.operion.ai");

  return isQa ? { scope: "qa", label: "QA" } : { scope: "live", label: "live" };
}
