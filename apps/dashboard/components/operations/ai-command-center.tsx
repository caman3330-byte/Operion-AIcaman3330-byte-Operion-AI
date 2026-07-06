import { Activity, AlertTriangle, Bot, CheckCircle2, Clock3, Cpu, DollarSign, History, ListChecks, Mail, ServerCog, ShieldCheck, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AiCommandCenterModel, CommandCenterHealth } from "@/lib/operations/ai-command-center";
import { cn, formatDateTime } from "@/lib/utils";

export function AiCommandCenter({ model }: { model: AiCommandCenterModel }) {
  const queuedCount = model.taskManager.queued.length;
  const runningCount = model.taskManager.running.length;
  const failedCount = model.taskManager.failed.length;
  const completedCount = model.taskManager.completedToday.length;

  return (
    <Card className="border-primary/30 bg-[radial-gradient(circle_at_top_left,rgba(215,183,106,0.10),transparent_45%),rgba(255,255,255,0.025)]">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">AI Operating System</p>
            <CardTitle className="mt-1">Operion AI Command Center</CardTitle>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Registered AI departments, worker queues, task manager state, scheduler health, API usage, and supervisor failure detection.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <HealthBadge health={model.system.systemHealth} label="System" />
            <HealthBadge health={model.system.workerHealth} label="Workers" />
            <HealthBadge health={model.system.apiHealth} label="API" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <CommandStat label="Departments" value={String(model.departments.length)} detail="registered" icon={Bot} health="healthy" />
          <CommandStat label="Running" value={String(runningCount)} detail="active tasks" icon={Activity} health={runningCount > 0 ? "watch" : "healthy"} />
          <CommandStat label="Queued" value={String(queuedCount)} detail="waiting or blocked" icon={Clock3} health={queuedCount > 0 ? "watch" : "healthy"} />
          <CommandStat label="Completed Today" value={String(completedCount)} detail="task manager" icon={CheckCircle2} health="healthy" />
          <CommandStat label="Failed" value={String(failedCount)} detail="needs review" icon={AlertTriangle} health={failedCount > 0 ? "critical" : "healthy"} />
          <CommandStat
            label="AI Cost"
            value={formatCurrency(model.system.aiUsage.totalCostUsd)}
            detail={`${model.system.aiUsage.successfulCalls} ok / ${model.system.aiUsage.failedCalls} failed`}
            icon={DollarSign}
            health={model.system.apiHealth}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <DepartmentGrid departments={model.departments} />
          <SupervisorHealth model={model} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <WorkerManager model={model} />
          <QueueManager model={model} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <CostDashboard model={model} />
          <ApiHealthDashboard model={model} />
        </div>

        <SendGridLifecyclePanel model={model} />

        <div className="grid gap-4 xl:grid-cols-2">
          <TaskTable title="Running Tasks" tasks={model.taskManager.running} emptyText="No running task is recorded." />
          <TaskTable title="Queue / Blocked Tasks" tasks={model.taskManager.queued} emptyText="No queued or blocked task is recorded." />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <TaskTable title="Failed Tasks" tasks={model.taskManager.failed} emptyText="No failed task is recorded." compact />
          <TaskTable title="Completed Today" tasks={model.taskManager.completedToday} emptyText="No completed task has been recorded today." compact />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <TimelinePanel title="Audit Timeline" icon="audit" items={model.auditTimeline} emptyText="No AI decision or founder approval audit entries are recorded." />
          <TimelinePanel title="Founder Activity Today" icon="founder" items={model.founderActivityFeed} emptyText="No founder activity is recorded for the current window." />
        </div>
      </CardContent>
    </Card>
  );
}

function DepartmentGrid({ departments }: { departments: AiCommandCenterModel["departments"] }) {
  return (
    <div className="rounded-md border bg-background/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Department Registry</p>
          <p className="mt-1 text-xs text-muted-foreground">Every department reports queue, task, worker, health, retries, and completion state.</p>
        </div>
        <ListChecks className="h-5 w-5 text-primary" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {departments.map((department) => (
          <div key={department.key} className="rounded-md border border-white/10 bg-white/[0.025] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-white">{department.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{department.workerName}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <HealthBadge health={department.health} />
                <Badge variant={department.registered ? "success" : "warning"}>{department.registered ? "registered" : "registry only"}</Badge>
              </div>
            </div>
            <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{department.currentTask}</p>
            <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
              <Mini label="queue" value={department.queue} />
              <Mini label="errors" value={department.errors} />
              <Mini label="retries" value={department.retries} />
              <Mini label="today" value={department.completedToday} />
            </div>
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
              <TextMini label="model" value={formatTracked(department.assignedModel)} />
              <TextMini label="usage" value={formatTracked(department.apiUsage)} />
              <TextMini label="cost" value={formatTrackedCurrency(department.costUsd)} />
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-primary" style={{ width: `${department.progress}%` }} />
            </div>
            <div className="mt-2 flex justify-between gap-2 text-xs text-muted-foreground">
              <span>{department.started ? formatDateTime(department.started) : "not started"}</span>
              <span>{department.eta ?? "ETA n/a"}</span>
            </div>
            <p className="mt-2 truncate text-xs text-muted-foreground">Last completed: {department.lastCompletedTask ?? "Not Tracked"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkerManager({ model }: { model: AiCommandCenterModel }) {
  return (
    <div className="rounded-md border bg-background/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Worker Manager</p>
          <p className="mt-1 text-xs text-muted-foreground">Authoritative worker heartbeat, current task, queue, retry, and hung-worker state.</p>
        </div>
        <Workflow className="h-5 w-5 text-primary" />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-5">
        <Mini label="active" value={model.workerManager.active.length} />
        <Mini label="paused" value={model.workerManager.paused.length} />
        <Mini label="failed" value={model.workerManager.failed.length} />
        <Mini label="retry" value={model.workerManager.retryLoops.length} />
        <Mini label="hung" value={model.workerManager.hung.length} />
      </div>
      <div className="mt-4 space-y-2">
        {model.workerManager.all.map((worker) => (
          <div key={`${worker.department}-${worker.workerName}`} className="rounded-md border border-white/10 bg-white/[0.025] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-white">{worker.workerName}</p>
                <p className="mt-1 text-xs text-muted-foreground">{worker.department} / {worker.currentTask}</p>
              </div>
              <Badge variant={workerStatusVariant(worker.status)}>{worker.status}</Badge>
            </div>
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
              <TextMini label="queue" value={worker.queueName ?? "Not Tracked"} />
              <TextMini label="queue size" value={String(worker.queue)} />
              <TextMini label="model" value={formatTracked(worker.assignedModel)} />
              <TextMini label="avg runtime" value={formatRuntime(worker.averageExecutionMs)} />
              <TextMini label="last seen" value={worker.lastSeen ? formatDateTime(worker.lastSeen) : "Not Tracked"} />
              <TextMini label="last done" value={worker.lastCompletedTask ?? "Not Tracked"} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QueueManager({ model }: { model: AiCommandCenterModel }) {
  return (
    <div className="rounded-md border bg-background/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Queue Manager</p>
          <p className="mt-1 text-xs text-muted-foreground">Pending, running, completed, failed, and delayed job state.</p>
        </div>
        <ListChecks className="h-5 w-5 text-primary" />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {model.queueManager.map((queue) => (
          <div key={queue.status} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.025] p-3">
            <div>
              <p className="text-sm font-medium capitalize text-white">{queue.status.replaceAll("_", " ")}</p>
              <p className="mt-1 text-xs text-muted-foreground">Oldest: {formatTracked(queue.oldestAgeMinutes)} min</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-semibold text-white">{queue.count}</p>
              <HealthBadge health={queue.health} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CostDashboard({ model }: { model: AiCommandCenterModel }) {
  return (
    <div className="rounded-md border bg-background/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Cost Dashboard</p>
          <p className="mt-1 text-xs text-muted-foreground">Aggregates tracked provider usage; missing telemetry is labeled directly.</p>
        </div>
        <DollarSign className="h-5 w-5 text-primary" />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {model.costDashboard.map((item) => (
          <div key={item.service} className="rounded-md border border-white/10 bg-white/[0.025] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold capitalize text-white">{item.service}</p>
              <HealthBadge health={item.health} />
            </div>
            <p className="mt-2 text-lg font-semibold text-white">{formatTrackedCurrency(item.costUsd)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatTracked(item.successfulCalls)} ok / {formatTracked(item.failedCalls)} failed
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApiHealthDashboard({ model }: { model: AiCommandCenterModel }) {
  return (
    <div className="rounded-md border bg-background/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">API Health Dashboard</p>
          <p className="mt-1 text-xs text-muted-foreground">Configuration status for live integrations without exposing secrets.</p>
        </div>
        <ShieldCheck className="h-5 w-5 text-primary" />
      </div>
      <div className="mt-4 space-y-2">
        {model.apiHealthDashboard.map((item) => (
          <div key={item.service} className="rounded-md border border-white/10 bg-white/[0.025] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">{item.service}</p>
              <div className="flex gap-2">
                <Badge variant={item.configured ? "success" : "outline"}>{item.status.replaceAll("_", " ")}</Badge>
                <HealthBadge health={item.health} />
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SendGridLifecyclePanel({ model }: { model: AiCommandCenterModel }) {
  return (
    <div className="rounded-md border bg-background/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">SendGrid Email Lifecycle</p>
          <p className="mt-1 text-xs text-muted-foreground">Queue, webhook, retry, and latency signals from existing email tables only.</p>
        </div>
        <Mail className="h-5 w-5 text-primary" />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {model.sendgridLifecycle.map((metric) => (
          <div key={metric.label} className="rounded-md border border-white/10 bg-white/[0.025] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{metric.label}</p>
              <HealthBadge health={metric.health} />
            </div>
            <p className="mt-2 text-xl font-semibold text-white">{formatTracked(metric.value)}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{metric.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SupervisorHealth({ model }: { model: AiCommandCenterModel }) {
  const checks = [
    { label: "Hung workers", value: model.supervisor.hungWorkers, health: model.supervisor.hungWorkers > 0 ? "critical" : "healthy" },
    { label: "Failed workers", value: model.supervisor.failedWorkers, health: model.supervisor.failedWorkers > 0 ? "critical" : "healthy" },
    { label: "Retry loops", value: model.supervisor.retryLoops, health: model.supervisor.retryLoops > 0 ? "watch" : "healthy" },
    { label: "Dead queues", value: model.supervisor.deadQueues, health: model.supervisor.deadQueues > 0 ? "critical" : "healthy" }
  ] as const;

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-background/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Supervisor Monitor</p>
            <p className="mt-1 text-xs text-muted-foreground">Detects hung workers, failures, retry loops, and dead queues.</p>
          </div>
          <ServerCog className="h-5 w-5 text-primary" />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {checks.map((check) => (
            <div key={check.label} className="rounded-md border border-white/10 bg-white/[0.025] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{check.label}</p>
                <HealthBadge health={check.health as CommandCenterHealth} />
              </div>
              <p className="mt-2 text-2xl font-semibold text-white">{check.value}</p>
            </div>
          ))}
        </div>
        {model.supervisor.alerts.length > 0 ? (
          <div className="mt-4 space-y-2">
            {model.supervisor.alerts.map((alert) => (
              <div key={alert.label} className="rounded-md border border-amber-500/30 bg-amber-500/[0.05] p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-white">{alert.label}</p>
                  <HealthBadge health={alert.severity} />
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{alert.detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No supervisor exceptions detected.</p>
        )}
      </div>

      <div className="rounded-md border bg-background/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Scheduler / Queue Health</p>
            <p className="mt-1 text-xs text-muted-foreground">Read from existing scheduler flags and queue state.</p>
          </div>
          <Cpu className="h-5 w-5 text-primary" />
        </div>
        <div className="mt-3 grid gap-2">
          <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.025] px-3 py-2 text-sm">
            <span className="text-muted-foreground">Scheduler</span>
            <HealthBadge health={model.system.schedulerHealth} />
          </div>
          {model.system.queues.map((queue) => (
            <div key={queue.label} className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.025] px-3 py-2 text-sm">
              <span className="text-muted-foreground">{queue.label}</span>
              <span className="flex items-center gap-2">
                <span className="font-semibold text-white">{queue.count}</span>
                <HealthBadge health={queue.health} />
              </span>
            </div>
          ))}
          <div className="mt-2 rounded-md border border-white/10 bg-white/[0.025] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Last scheduler run</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {model.schedulerManager.lastRun
                    ? `${model.schedulerManager.lastRun.scheduler_key} / ${model.schedulerManager.lastRun.status}`
                    : "Not Tracked"}
                </p>
              </div>
              <Badge variant={model.schedulerManager.failed.length > 0 ? "destructive" : model.schedulerManager.lastRun ? "success" : "outline"}>
                {model.schedulerManager.lastRun ? formatRuntime(model.schedulerManager.lastRun.duration_ms ?? "Not Tracked") : "Not Tracked"}
              </Badge>
            </div>
            <div className="mt-3 space-y-2">
              {model.schedulerManager.recent.slice(0, 5).map((run) => (
                <div key={run.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-muted-foreground">{run.scheduler_key}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge variant={run.status === "failed" ? "destructive" : run.status === "disabled" ? "warning" : "outline"}>{run.status}</Badge>
                    <span className="text-muted-foreground">{formatDateTime(run.started_at)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskTable({
  compact = false,
  emptyText,
  tasks,
  title
}: {
  compact?: boolean;
  emptyText: string;
  tasks: AiCommandCenterModel["taskManager"]["recent"];
  title: string;
}) {
  return (
    <div className="rounded-md border bg-background/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{title}</p>
        <Badge variant={tasks.length > 0 ? "outline" : "secondary"}>{tasks.length}</Badge>
      </div>
      {tasks.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <Table className="mt-3">
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Worker</TableHead>
              {!compact ? <TableHead>Logs / Result</TableHead> : null}
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.slice(0, compact ? 6 : 8).map((task) => (
              <TableRow key={`${task.source}-${task.taskId}`}>
                <TableCell>
                  <p className="max-w-[220px] truncate font-medium text-white">{task.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{task.taskId.slice(0, 8)} / {task.priority}</p>
                </TableCell>
                <TableCell className="capitalize">{task.department.replaceAll("_", " ")}</TableCell>
                <TableCell>
                  <p className="max-w-[180px] truncate">{task.assignedWorker}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{task.source}</p>
                </TableCell>
                {!compact ? (
                  <TableCell>
                    <p className="max-w-[260px] truncate text-xs text-muted-foreground">{task.errors ?? task.logs[0] ?? task.result ?? "No log recorded"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {task.dependencies.length} dependencies / {task.retries} retries / {formatTracked(task.assignedModel)} / {formatTrackedCurrency(task.costUsd)}
                    </p>
                  </TableCell>
                ) : null}
                <TableCell>
                  <Badge variant={statusVariant(task.status)}>{task.status.replaceAll("_", " ")}</Badge>
                  <p className="mt-1 text-xs text-muted-foreground">{task.started ? formatDateTime(task.started) : formatDateTime(task.created)}</p>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function TimelinePanel({
  emptyText,
  icon,
  items,
  title
}: {
  emptyText: string;
  icon: "audit" | "founder";
  items: AiCommandCenterModel["auditTimeline"];
  title: string;
}) {
  const Icon = icon === "audit" ? History : Activity;
  return (
    <div className="rounded-md border bg-background/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">Read from existing audit records only.</p>
        </div>
        <Icon className="h-5 w-5 text-primary" />
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-md border border-white/10 bg-white/[0.025] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">{item.event.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.actor} / {item.entity} / {item.decision}</p>
                </div>
                <span className="text-xs text-muted-foreground">{formatDateTime(item.timestamp)}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CommandStat({
  detail,
  health,
  icon: Icon,
  label,
  value
}: {
  detail: string;
  health: CommandCenterHealth;
  icon: typeof Bot;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-background/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
        </div>
        <Icon className={cn("h-5 w-5", iconColor(health))} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-black/25 px-2 py-1">
      <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold text-white">{value}</p>
    </div>
  );
}

function TextMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-black/25 px-2 py-1">
      <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-semibold text-white">{value}</p>
    </div>
  );
}

function HealthBadge({ health, label }: { health: CommandCenterHealth; label?: string }) {
  return <Badge variant={healthVariant(health)}>{label ? `${label}: ${health}` : health}</Badge>;
}

function healthVariant(health: CommandCenterHealth) {
  if (health === "critical") return "destructive";
  if (health === "watch") return "warning";
  if (health === "healthy") return "success";
  return "outline";
}

function statusVariant(status: string) {
  if (status === "failed" || status === "cancelled") return "destructive";
  if (status === "blocked" || status === "queued" || status === "assigned" || status === "pending_approval") return "warning";
  if (status === "completed" || status === "sent" || status === "delivered") return "success";
  return "outline";
}

function workerStatusVariant(status: string) {
  if (status === "failed" || status === "hung") return "destructive";
  if (status === "paused" || status === "offline") return "warning";
  if (status === "active") return "success";
  return "outline";
}

function iconColor(health: CommandCenterHealth) {
  if (health === "critical") return "text-destructive";
  if (health === "watch") return "text-amber-500";
  return "text-primary";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 4 : 2
  }).format(value);
}

function formatTracked(value: string | number | "Not Tracked") {
  return value === "Not Tracked" ? "Not Tracked" : String(value);
}

function formatTrackedCurrency(value: number | "Not Tracked") {
  return value === "Not Tracked" ? "Not Tracked" : formatCurrency(value);
}

function formatRuntime(value: number | "Not Tracked") {
  if (value === "Not Tracked") return "Not Tracked";
  if (value < 1000) return `${value}ms`;
  return `${Math.round(value / 1000)}s`;
}
