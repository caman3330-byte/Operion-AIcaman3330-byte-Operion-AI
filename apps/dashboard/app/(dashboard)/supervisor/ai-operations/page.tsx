import { Activity, AlertTriangle, Bot, Braces, Clock3, Cpu, DatabaseZap, Gauge, Mail, Route, ShieldCheck, TimerReset } from "lucide-react";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { MetricCard } from "@/components/metrics/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getOperatorDashboardSummary } from "@/lib/operator-dashboard/service";

export const dynamic = "force-dynamic";

const agents = [
  { name: "Qualification Agent", key: "qualification_agent", provider: "OpenAI", stage: "Qualification", icon: Bot },
  { name: "Underwriting Agent", key: "underwriting_agent", provider: "Claude", stage: "Underwriting", icon: Braces },
  { name: "Outreach Agent", key: "outreach_agent", provider: "OpenAI", stage: "Outreach", icon: Mail },
  { name: "CRM Agent", key: "crm_agent", provider: "OpenAI", stage: "CRM", icon: DatabaseZap },
  { name: "Lender Matching Agent", key: "lender_matching_agent", provider: "Claude", stage: "Lender Match", icon: Route },
  { name: "Risk Agent", key: "risk_agent", provider: "Claude", stage: "Risk", icon: ShieldCheck },
  { name: "Fraud Agent", key: "fraud_agent", provider: "Claude", stage: "Fraud", icon: AlertTriangle },
  { name: "Reporting Agent", key: "reporting_agent", provider: "Claude", stage: "Reporting", icon: Gauge },
  { name: "Email Automation Agent", key: "email_automation_agent", provider: "OpenAI", stage: "Email", icon: Mail },
  { name: "Document Analysis Agent", key: "document_analysis_agent", provider: "Claude", stage: "Documents", icon: Cpu }
] as const;

const workflowStages = ["Lead", "Qualification", "Underwriting", "Risk", "Lender Match", "Outreach", "Approval", "Funding"];

export default async function AiOperationsPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;

  const summary = await getOperatorDashboardSummary({ limit: 80 });
  const executions = summary.ai.executions.items;
  const traces = summary.workflows.traces.items;
  const activeExecutions = executions.filter((item) => item.status === "running" || item.status === "queued").length;
  const openQueueDepth =
    summary.underwriting.metrics.pendingReviews +
    summary.crm.intakeQueue.items.length +
    summary.workflows.metrics.retryCount +
    activeExecutions;
  const totalInputTokens = executions.reduce((sum, item) => sum + (item.input_tokens ?? 0), 0);
  const totalOutputTokens = executions.reduce((sum, item) => sum + (item.output_tokens ?? 0), 0);
  const totalCost = executions.reduce((sum, item) => sum + (item.cost_estimate_usd ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">AI Operations Center</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-white">Supervisor Agent Control</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Live visibility across model execution, queue pressure, routing stages, retries, failures, token usage, and operational workflow health.
          </p>
        </div>
        <Badge variant={summary.health === "healthy" ? "success" : summary.health === "critical" ? "destructive" : "warning"}>
          {summary.health}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Active Tasks" value={String(activeExecutions)} detail={`${openQueueDepth} total queue pressure`} icon={Activity} tone={openQueueDepth > 10 ? "warning" : "success"} />
        <MetricCard title="AI Failures" value={String(summary.ai.metrics.failedExecutions)} detail={`${summary.workflows.metrics.retryCount} retry event(s)`} icon={AlertTriangle} tone={summary.ai.metrics.failedExecutions > 0 ? "danger" : "success"} />
        <MetricCard title="Latency" value={summary.ai.metrics.averageLatencyMs ? `${summary.ai.metrics.averageLatencyMs}ms` : "n/a"} detail="Average AI execution latency" icon={Clock3} />
        <MetricCard title="AI Cost" value={formatCurrency(totalCost)} detail={`${totalInputTokens + totalOutputTokens} tracked tokens`} icon={Gauge} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workflow Map</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
            {workflowStages.map((stage, index) => (
              <div key={stage} className="rounded-md border border-white/[0.12] bg-white/[0.03] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Step {index + 1}</p>
                <p className="mt-2 text-sm font-medium text-white">{stage}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Operational Agents</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {agents.map((agent) => {
              const Icon = agent.icon;
              const related = executions.filter((item) => includesText(item.message, agent.stage) || includesText(String(item.metadata), agent.key));
              const failures = related.filter((item) => item.status === "failed").length;
              return (
                <div key={agent.key} className="rounded-md border border-white/[0.12] bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="rounded-md bg-primary/10 p-2 text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">{agent.provider} / {agent.stage}</p>
                      </div>
                    </div>
                    <Badge variant={failures > 0 ? "warning" : "success"}>{failures > 0 ? "review" : "ready"}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <MiniMetric label="Tasks" value={String(related.length)} />
                    <MiniMetric label="Failures" value={String(failures)} />
                    <MiniMetric label="Latency" value={averageLatency(related)} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Provider Usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(summary.ai.metrics.byProvider).length === 0 ? (
              <p className="text-sm text-muted-foreground">No AI provider usage recorded in the current window.</p>
            ) : (
              Object.entries(summary.ai.metrics.byProvider).map(([provider, count]) => (
                <div key={provider} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium text-white">{provider}</p>
                    <p className="text-xs text-muted-foreground">Tracked execution logs</p>
                  </div>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))
            )}
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
              OpenAI is positioned for support, outreach, CRM automation, and structured extraction. Claude is positioned for underwriting, lender reasoning, risk review, and executive summaries.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>AI Activity Stream</CardTitle>
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
                {executions.slice(0, 12).map((item) => (
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
            <CardTitle>Workflow Execution Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Latency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {traces.slice(0, 12).map((trace) => (
                  <TableRow key={trace.id}>
                    <TableCell>{trace.workflow_key}</TableCell>
                    <TableCell>{trace.step_key}</TableCell>
                    <TableCell><Badge variant={trace.status === "failed" ? "destructive" : trace.status === "completed" ? "success" : "secondary"}>{trace.status}</Badge></TableCell>
                    <TableCell>{trace.latency_ms ? `${trace.latency_ms}ms` : "n/a"}</TableCell>
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

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/[0.08] bg-white/[0.025] p-2">
      <p className="text-[10px] uppercase tracking-[0.12em]">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
    </div>
  );
}

function includesText(value: string, needle: string) {
  return value.toLowerCase().includes(needle.toLowerCase());
}

function averageLatency(items: { latency_ms: number | null }[]) {
  const values = items.map((item) => item.latency_ms).filter((value): value is number => typeof value === "number");
  if (values.length === 0) return "n/a";
  return `${Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)}ms`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 4 : 2
  }).format(value);
}
