import { Activity, AlertTriangle, Bot, Brain, CheckCircle2, Circle, Clock, Gauge, ShieldCheck, Target } from "lucide-react";
import { buildAutonomousCommandCenterSnapshot } from "@/lib/autonomous-company/command-center";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AutonomousOperationsPage() {
  const snapshot = await buildAutonomousCommandCenterSnapshot();
  const goal = snapshot.goal;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Operion Capital</p>
            <h1 className="mt-1 text-3xl font-semibold">Autonomous Operations</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge status={snapshot.company_state.status} />
              <Badge variant="outline">Autonomy: {snapshot.company_state.autonomy_level}</Badge>
              <Badge variant={snapshot.company_state.emergency_stop ? "destructive" : "outline"}>
                Emergency stop: {snapshot.company_state.emergency_stop ? "ON" : "OFF"}
              </Badge>
            </div>
          </div>
          <div className="min-w-[260px] rounded-md border p-4">
            <p className="text-sm text-muted-foreground">Company Goal</p>
            <p className="mt-1 text-lg font-semibold">{goal.title}</p>
            <div className="mt-3 h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(goal.progress_percentage, 100)}%` }} />
            </div>
            <p className="mt-2 text-sm">
              <span className="font-semibold">{goal.current}</span> / {goal.target} · {goal.progress_percentage}% · {goal.remaining} remaining
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-2 border-b pb-4">
        <h2 className="text-lg font-semibold">Durable Company Cycle</h2>
        <p>{snapshot.durable_runtime.current_cycle ? `Cycle ${snapshot.durable_runtime.current_cycle.sequence}: ${snapshot.durable_runtime.current_cycle.phase}` : "Idle: no unfinished cycle"}</p>
        <p className="text-sm text-muted-foreground">{snapshot.durable_runtime.scheduler}. Production autonomy is off.</p>
      </section>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Gauge className="h-5 w-5" /> Operations Manager
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusLine label="Current status" value={snapshot.operations_manager.status} />
            <p className="rounded-md bg-muted p-3 text-sm">{snapshot.operations_manager.current_briefing}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Completed today" value={snapshot.today.completed} />
              <Metric label="In progress" value={snapshot.today.in_progress} />
              <Metric label="Blocked" value={snapshot.today.blocked} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Queued" value={snapshot.task_counts.queued} />
              <Metric label="Running" value={snapshot.task_counts.running} />
              <Metric label="Retrying" value={snapshot.task_counts.retrying} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5" /> AI Usage
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Metric label="Cost today" value={`$${Number(snapshot.ai_usage.cost ?? 0).toFixed(4)}`} />
            <Metric label="Tokens" value={snapshot.ai_usage.tokens} />
            <Metric label="Requests" value={snapshot.ai_usage.requests} />
            <Metric label="Failures" value={snapshot.ai_usage.failed_requests} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5" /> Acquisition
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Discovered" value={snapshot.acquisition.candidates_discovered} />
          <Metric label="Enriched" value={snapshot.acquisition.candidates_enriched} />
          <Metric label="Verified" value={snapshot.acquisition.verified_merchants} />
          <Metric label="Rejected" value={snapshot.acquisition.rejected_candidates} />
          <Metric label="Duplicates" value={snapshot.acquisition.duplicates} />
          <Metric label="Active sources" value={snapshot.acquisition.active_sources} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-5 w-5" /> Learning
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Evaluations" value={snapshot.learning.recent_evaluations.length} />
            <Metric label="Lessons" value={snapshot.learning.recent_lessons.length} />
            <Metric label="Strategy changes" value={snapshot.learning.strategy_changes.length} />
          </div>
          {snapshot.learning.recent_lessons.length === 0 ? <EmptyLine text="No learning lessons recorded yet." /> : null}
          {snapshot.learning.recent_lessons.slice(0, 5).map((lesson: any) => (
            <div key={lesson.id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{lesson.conclusion}</p>
                <Badge variant="outline">{Math.round(Number(lesson.confidence ?? 0) * 100)}%</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{lesson.lesson_type}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-5 w-5" /> CEO Brief
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {Object.entries(snapshot.ceo_questions).map(([key, value]) => (
            <div key={key} className="rounded-md border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{formatQuestionKey(key)}</p>
              <p className="mt-1 text-sm">{Array.isArray(value) ? value.join(" ") || "No data." : String(value)}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="h-5 w-5" /> Departments
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {snapshot.departments.map((department) => (
            <div key={department.key} className="rounded-md border p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{department.name}</h2>
                <StatusBadge status={department.status} />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {department.workers.map((worker) => (
                  <div key={worker.agent_key} className="rounded-md border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{formatAgentName(worker.agent_key)}</p>
                      <SmallStatus status={worker.status} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Completed {worker.tasks_completed} · Failed {worker.tasks_failed} · Success {Math.round(worker.success_rate * 100)}%
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5" /> Live Tasks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.live_tasks.length === 0 ? <EmptyLine text="No acquisition tasks yet." /> : null}
            {snapshot.live_tasks.slice(0, 8).map((task) => (
              <div key={task.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{task.title}</p>
                  <Badge variant="outline">{task.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{task.assigned_agent_key}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" /> Live Events
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.live_events.length === 0 ? <EmptyLine text="No autonomous events yet." /> : null}
            {snapshot.live_events.slice(0, 8).map((event: any) => (
              <div key={event.event_id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{event.event_type}</p>
                  <Badge variant={event.severity === "ERROR" || event.severity === "CRITICAL" ? "destructive" : "outline"}>{event.severity}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(event.timestamp).toLocaleString()}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5" /> Approvals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.approvals.length === 0 ? <EmptyLine text="No founder approvals pending." /> : null}
            {snapshot.approvals.slice(0, 6).map((approval) => (
              <div key={approval.id} className="rounded-md border p-3">
                <p className="font-medium">{approval.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{approval.approval_type}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5" /> Incidents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.incidents.length === 0 ? <EmptyLine text="No acquisition incidents." /> : null}
            {snapshot.incidents.slice(0, 6).map((incident: any) => (
              <div key={incident.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{incident.title}</p>
                  <Badge variant={incident.severity === "ERROR" || incident.severity === "CRITICAL" ? "destructive" : "outline"}>{incident.status}</Badge>
                </div>
                {incident.description ? <p className="mt-1 text-xs text-muted-foreground">{incident.description}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <StatusBadge status={value} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "EMERGENCY_STOP" || status === "ERROR" ? "destructive" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

function SmallStatus({ status }: { status: string }) {
  const active = status === "WORKING" || status === "OPERATIONAL";
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Circle className={`h-2.5 w-2.5 ${active ? "fill-emerald-500 text-emerald-500" : "fill-muted text-muted"}`} />
      {status}
    </span>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{text}</p>;
}

function formatAgentName(agentKey: string) {
  return agentKey
    .replace(/_agent$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatQuestionKey(key: string) {
  return key.replace(/_/g, " ");
}
