import type { AgentTaskQueueItem, AiTask, Json } from "@operion/shared";
import { getConfigurationStatus } from "@/lib/env";
import { auditLogRepository } from "@/lib/repositories/audit-log";
import { apiUsageRepository } from "@/lib/repositories/api-usage";
import { orchestrationRepository } from "@/lib/repositories/orchestration";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type CommandCenterHealth = "healthy" | "watch" | "critical" | "unknown";
export type CommandCenterStatus = "idle" | "queued" | "running" | "blocked" | "failed" | "completed";
export type TrackedValue<T> = T | "Not Tracked";

interface WorkerHeartbeatRow {
  worker_name: string;
  department: string;
  status: "online" | "offline" | "running" | "idle" | "failed";
  queue_name: string | null;
  queue_size: number;
  current_task: string | null;
  last_completed_task: string | null;
  last_heartbeat_at: string;
  last_started_at: string | null;
  last_completed_at: string | null;
  average_execution_ms: number | null;
  last_duration_ms: number | null;
  error_message: string | null;
  metadata: Json;
}

interface SchedulerExecutionRunRow {
  id: string;
  scheduler_key: string;
  route_path: string;
  cron_schedule: string | null;
  status: "started" | "completed" | "failed" | "skipped" | "disabled";
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  worker_name: string | null;
  queue_name: string | null;
  queue_affected: number;
  success: boolean | null;
  error_message: string | null;
  environment_flag: string | null;
  environment_flag_enabled: boolean | null;
  metadata: Json;
}

export interface AiCommandCenterDepartment {
  key: string;
  name: string;
  status: CommandCenterStatus;
  health: CommandCenterHealth;
  workerName: string;
  currentTask: string;
  queue: number;
  progress: number;
  started: string | null;
  eta: string | null;
  assignedModel: TrackedValue<string>;
  apiUsage: TrackedValue<string>;
  costUsd: TrackedValue<number>;
  errors: number;
  retries: number;
  lastCompletedTask: string | null;
  completedToday: number;
  registered: boolean;
}

export interface AiCommandCenterTask {
  taskId: string;
  source: "agent_task_queue" | "ai_tasks" | "acquisition_jobs" | "outreach_email_queue";
  priority: string;
  department: string;
  assignedWorker: string;
  status: string;
  created: string;
  started: string | null;
  finished: string | null;
  title: string;
  logs: string[];
  result: string | null;
  dependencies: string[];
  errors: string | null;
  retries: number;
  ageMinutes: number;
  assignedModel: TrackedValue<string>;
  apiUsage: TrackedValue<string>;
  costUsd: TrackedValue<number>;
}

export interface AiCommandCenterWorker {
  workerName: string;
  department: string;
  status: "active" | "paused" | "failed" | "hung" | "idle" | "offline";
  currentTask: string;
  queue: number;
  progress: number;
  eta: string | null;
  assignedModel: TrackedValue<string>;
  apiUsage: TrackedValue<string>;
  costUsd: TrackedValue<number>;
  retries: number;
  errors: number;
  lastCompletedTask: string | null;
  lastSeen: string | null;
  queueName: string | null;
  averageExecutionMs: TrackedValue<number>;
}

export interface AiCommandCenterCostItem {
  service: string;
  costUsd: TrackedValue<number>;
  successfulCalls: TrackedValue<number>;
  failedCalls: TrackedValue<number>;
  health: CommandCenterHealth;
}

export interface AiCommandCenterIntegrationHealth {
  service: string;
  configured: boolean;
  status: "configured" | "missing" | "not_tracked";
  health: CommandCenterHealth;
  detail: string;
}

export interface AiCommandCenterTimelineItem {
  id: string;
  timestamp: string;
  actor: string;
  event: string;
  entity: string;
  decision: string;
  detail: string;
}

export interface SendGridLifecycleMetric {
  label: string;
  value: TrackedValue<number | string>;
  detail: string;
  health: CommandCenterHealth;
}

export interface AiCommandCenterModel {
  generatedAt: string;
  departments: AiCommandCenterDepartment[];
  taskManager: {
    all: AiCommandCenterTask[];
    running: AiCommandCenterTask[];
    queued: AiCommandCenterTask[];
    completedToday: AiCommandCenterTask[];
    failed: AiCommandCenterTask[];
    recent: AiCommandCenterTask[];
  };
  workerManager: {
    active: AiCommandCenterWorker[];
    paused: AiCommandCenterWorker[];
    failed: AiCommandCenterWorker[];
    retryLoops: AiCommandCenterWorker[];
    hung: AiCommandCenterWorker[];
    all: AiCommandCenterWorker[];
  };
  schedulerManager: {
    recent: SchedulerExecutionRunRow[];
    failed: SchedulerExecutionRunRow[];
    disabled: SchedulerExecutionRunRow[];
    lastRun: SchedulerExecutionRunRow | null;
  };
  queueManager: Array<{ status: string; count: number; oldestAgeMinutes: TrackedValue<number>; health: CommandCenterHealth }>;
  costDashboard: AiCommandCenterCostItem[];
  apiHealthDashboard: AiCommandCenterIntegrationHealth[];
  auditTimeline: AiCommandCenterTimelineItem[];
  founderActivityFeed: AiCommandCenterTimelineItem[];
  sendgridLifecycle: SendGridLifecycleMetric[];
  supervisor: {
    hungWorkers: number;
    failedWorkers: number;
    retryLoops: number;
    deadQueues: number;
    alerts: Array<{ label: string; detail: string; severity: CommandCenterHealth }>;
  };
  system: {
    apiHealth: CommandCenterHealth;
    schedulerHealth: CommandCenterHealth;
    workerHealth: CommandCenterHealth;
    systemHealth: CommandCenterHealth;
    aiUsage: {
      totalCostUsd: number;
      successfulCalls: number;
      failedCalls: number;
      byService: Record<string, number>;
    };
    queues: Array<{ label: string; count: number; health: CommandCenterHealth }>;
  };
}

type DepartmentRegistration = {
  key: string;
  name: string;
  workerName: string;
  taskMatches: string[];
  agentMatches: string[];
};

const DEPARTMENTS: DepartmentRegistration[] = [
  {
    key: "merchant_intelligence",
    name: "Merchant Intelligence",
    workerName: "merchant_intelligence_scheduler",
    taskMatches: ["merchant_intelligence", "source_discovery", "source_testing"],
    agentMatches: ["lead_generation_agent", "operations_manager_agent"]
  },
  {
    key: "merchant_acquisition",
    name: "Merchant Acquisition",
    workerName: "lead_acquisition_agent",
    taskMatches: ["lead_acquisition", "business_discovery", "lead_ingestion", "enrichment", "merchant_sources"],
    agentMatches: ["lead_generation_agent"]
  },
  {
    key: "crm",
    name: "CRM",
    workerName: "crm_agent",
    taskMatches: ["crm", "intake", "crm_activity"],
    agentMatches: ["operations_manager_agent"]
  },
  {
    key: "supervisor",
    name: "Supervisor",
    workerName: "executive_manager_agent",
    taskMatches: ["supervisor", "executive", "workflow_recovery", "reporting"],
    agentMatches: ["executive_manager_agent", "reporting_agent"]
  },
  {
    key: "underwriting",
    name: "Underwriting",
    workerName: "underwriting_agent",
    taskMatches: ["underwriting", "lead_qualification", "document_processing", "risk"],
    agentMatches: ["underwriting_agent", "risk_fraud_agent"]
  },
  {
    key: "lender_routing",
    name: "Lender Routing",
    workerName: "lender_discovery_agent",
    taskMatches: ["lender", "routing", "distribution", "matching", "lender_recommendation"],
    agentMatches: ["sales_agent"]
  },
  {
    key: "marketing",
    name: "Marketing",
    workerName: "marketing_agent",
    taskMatches: ["marketing", "campaign", "content", "social"],
    agentMatches: ["marketing_agent", "social_media_agent", "content_seo_agent"]
  },
  {
    key: "support",
    name: "Support",
    workerName: "customer_support_agent",
    taskMatches: ["support", "customer_support"],
    agentMatches: ["customer_support_agent", "client_success_agent"]
  },
  {
    key: "analytics",
    name: "Analytics",
    workerName: "analytics_agent",
    taskMatches: ["analytics", "reporting", "snapshot"],
    agentMatches: ["analytics_agent", "reporting_agent"]
  },
  {
    key: "finance",
    name: "Finance",
    workerName: "finance_accounting_agent",
    taskMatches: ["finance", "invoice", "cost", "revenue"],
    agentMatches: ["finance_accounting_agent"]
  }
];

const ACTIVE_STATUSES = new Set(["queued", "assigned", "running", "blocked", "sending", "pending_approval"]);
const FAILED_STATUSES = new Set(["failed", "cancelled"]);
const COMPLETE_STATUSES = new Set(["completed", "sent", "delivered"]);
const HUNG_MINUTES = 90;

export async function buildAiCommandCenterModel(): Promise<AiCommandCenterModel> {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [agentTasks, aiTasks, aiTaskLogs, acquisitionJobs, outreachQueue, outreachHistory, workerStates, workerHeartbeats, schedulerRuns, usage, auditEntries] = await Promise.all([
    orchestrationRepository.listTasks({ limit: 300 }).catch(() => []),
    collect<AiTask>(getSupabaseAdmin().from("ai_tasks").select("*").order("created_at", { ascending: false }).limit(300)),
    collect<{ ai_task_id: string; status: string; message: string; provider: string | null; model: string | null; input_tokens: number | null; output_tokens: number | null; cost_estimate_usd: number | null; created_at: string }>(
      getSupabaseAdmin().from("ai_task_logs").select("ai_task_id,status,message,provider,model,input_tokens,output_tokens,cost_estimate_usd,created_at").order("created_at", { ascending: false }).limit(300)
    ),
    collect<Record<string, unknown>>(getSupabaseAdmin().from("acquisition_jobs").select("*").order("created_at", { ascending: false }).limit(100)),
    collect<Record<string, unknown>>(getSupabaseAdmin().from("outreach_email_queue").select("*").order("created_at", { ascending: false }).limit(100)),
    collect<Record<string, unknown>>(getSupabaseAdmin().from("outreach_history").select("*").order("created_at", { ascending: false }).limit(300)),
    collect<Record<string, unknown>>(getSupabaseAdmin().from("worker_control_state").select("*").limit(20)),
    collect<WorkerHeartbeatRow>((getSupabaseAdmin() as any).from("worker_heartbeats").select("*").order("last_heartbeat_at", { ascending: false }).limit(50)),
    collect<SchedulerExecutionRunRow>((getSupabaseAdmin() as any).from("scheduler_execution_runs").select("*").order("started_at", { ascending: false }).limit(100)),
    apiUsageRepository.summary(1).catch(() => ({
      days: 1,
      total_cost_usd: 0,
      successful_calls: 0,
      failed_calls: 0,
      by_service: { anthropic: 0, openai: 0, apollo: 0, sendgrid: 0, stripe: 0 }
    })),
    auditLogRepository.list({ limit: 120 }).catch(() => [])
  ]);

  const normalizedTasks = [
    ...agentTasks.map(normalizeAgentTask),
    ...aiTasks.map((task) => normalizeAiTask(task, aiTaskLogs.filter((log) => log.ai_task_id === task.id))),
    ...acquisitionJobs.map(normalizeAcquisitionJob),
    ...outreachQueue.map(normalizeOutreachQueueItem)
  ].sort((left, right) => Date.parse(right.created) - Date.parse(left.created));

  const departments = DEPARTMENTS.map((department) => buildDepartmentState(department, normalizedTasks, agentTasks, since));
  const running = normalizedTasks.filter((task) => ["running", "sending"].includes(task.status));
  const queued = normalizedTasks.filter((task) => ["queued", "assigned", "blocked", "pending_approval"].includes(task.status)).slice(0, 12);
  const completedToday = normalizedTasks.filter((task) => task.finished && task.finished >= since && COMPLETE_STATUSES.has(task.status));
  const failed = normalizedTasks.filter((task) => FAILED_STATUSES.has(task.status)).slice(0, 12);
  const workers = buildWorkerManager(departments, normalizedTasks, workerStates, workerHeartbeats);
  const schedulerManager = buildSchedulerManager(schedulerRuns);

  const hungWorkers = running.filter((task) => task.ageMinutes >= HUNG_MINUTES).length;
  const retryLoops = normalizedTasks.filter((task) => task.retries >= 3).length;
  const failedWorkers = failed.length;
  const deadQueues = departments.filter((department) => department.queue > 0 && department.health === "critical").length;
  const config = getConfigurationStatus();
  const workersPaused = workerStates.some((row) => Boolean(row.workers_paused));
  const apiHealth: CommandCenterHealth = usage.failed_calls > usage.successful_calls && usage.failed_calls > 0 ? "critical" : usage.failed_calls > 0 ? "watch" : "healthy";
  const schedulerConfigured = config.acquisitionScheduler || config.merchantIntelligenceScheduler || config.internalApi;
  const schedulerHealth: CommandCenterHealth = schedulerManager.failed.length > 0
    ? "critical"
    : schedulerManager.lastRun
      ? schedulerManager.disabled.length > 0 ? "watch" : "healthy"
      : workersPaused ? "watch" : schedulerConfigured ? "watch" : "watch";
  const offlineWorkers = workers.filter((worker) => worker.status === "offline").length;
  const workerHealth = failedWorkers > 0 || hungWorkers > 0 ? "critical" : retryLoops > 0 || offlineWorkers > 0 ? "watch" : "healthy";
  const systemHealth = [apiHealth, schedulerHealth, workerHealth].includes("critical")
    ? "critical"
    : [apiHealth, schedulerHealth, workerHealth].includes("watch")
      ? "watch"
      : "healthy";

  return {
    generatedAt: now.toISOString(),
    departments,
    taskManager: {
      all: normalizedTasks,
      running: running.slice(0, 12),
      queued,
      completedToday: completedToday.slice(0, 12),
      failed,
      recent: normalizedTasks.slice(0, 20)
    },
    workerManager: {
      active: workers.filter((worker) => worker.status === "active"),
      paused: workers.filter((worker) => worker.status === "paused"),
      failed: workers.filter((worker) => worker.status === "failed"),
      retryLoops: workers.filter((worker) => worker.retries >= 3),
      hung: workers.filter((worker) => worker.status === "hung"),
      all: workers
    },
    schedulerManager,
    queueManager: buildQueueManager(normalizedTasks),
    costDashboard: buildCostDashboard(usage.by_service, usage.successful_calls, usage.failed_calls),
    apiHealthDashboard: buildApiHealthDashboard(config, usage.by_service),
    auditTimeline: buildTimeline(auditEntries).slice(0, 10),
    founderActivityFeed: buildTimeline(auditEntries).filter((entry) => entry.actor.toLowerCase().includes("founder")).slice(0, 10),
    sendgridLifecycle: buildSendGridLifecycle(outreachQueue, outreachHistory, auditEntries),
    supervisor: {
      hungWorkers,
      failedWorkers,
      retryLoops,
      deadQueues,
      alerts: buildSupervisorAlerts({ hungWorkers, failedWorkers, retryLoops, deadQueues, workersPaused, offlineWorkers, schedulerFailures: schedulerManager.failed.length })
    },
    system: {
      apiHealth,
      schedulerHealth,
      workerHealth,
      systemHealth,
      aiUsage: {
        totalCostUsd: usage.total_cost_usd,
        successfulCalls: usage.successful_calls,
        failedCalls: usage.failed_calls,
        byService: usage.by_service
      },
      queues: buildQueueSummary(normalizedTasks)
    }
  };
}

function buildDepartmentState(
  department: DepartmentRegistration,
  tasks: AiCommandCenterTask[],
  agentTasks: AgentTaskQueueItem[],
  since: string
): AiCommandCenterDepartment {
  const departmentTasks = tasks.filter((task) => task.department === department.key);
  const activeTasks = departmentTasks.filter((task) => ACTIVE_STATUSES.has(task.status));
  const failedTasks = departmentTasks.filter((task) => FAILED_STATUSES.has(task.status));
  const retryCount = departmentTasks.reduce((sum, task) => sum + task.retries, 0);
  const runningTask = activeTasks.find((task) => task.status === "running") ?? activeTasks[0] ?? null;
  const lastCompletedTask = departmentTasks.find((task) => task.finished && COMPLETE_STATUSES.has(task.status)) ?? null;
  const completedToday = departmentTasks.filter((task) => task.finished && task.finished >= since && COMPLETE_STATUSES.has(task.status)).length;
  const registered = agentTasks.some((task) => department.agentMatches.includes(task.assigned_agent_key));
  const status = normalizeDepartmentStatus(runningTask, activeTasks, failedTasks);
  const hung = runningTask ? runningTask.ageMinutes >= HUNG_MINUTES : false;
  const health: CommandCenterHealth =
    failedTasks.length > 0 || hung ? "critical" : activeTasks.some((task) => task.status === "blocked") || retryCount >= 3 ? "watch" : "healthy";

  return {
    key: department.key,
    name: department.name,
    status,
    health,
    workerName: runningTask?.assignedWorker ?? department.workerName,
    currentTask: runningTask?.title ?? "No active task",
    queue: activeTasks.length,
    progress: calculateProgress(runningTask, activeTasks, completedToday),
    started: runningTask?.started ?? null,
    eta: estimateEta(runningTask),
    assignedModel: runningTask?.assignedModel ?? lastCompletedTask?.assignedModel ?? "Not Tracked",
    apiUsage: runningTask?.apiUsage ?? lastCompletedTask?.apiUsage ?? "Not Tracked",
    costUsd: sumTrackedCosts(departmentTasks),
    errors: failedTasks.length,
    retries: retryCount,
    lastCompletedTask: lastCompletedTask?.title ?? null,
    completedToday,
    registered
  };
}

function normalizeAgentTask(task: AgentTaskQueueItem): AiCommandCenterTask {
  const result = readResult(task.result_summary);
  return {
    taskId: task.id,
    source: "agent_task_queue",
    priority: task.priority,
    department: mapDepartment(task.department_key, `${task.workflow_key ?? ""} ${task.title} ${task.instructions}`),
    assignedWorker: task.assigned_agent_key,
    status: task.status,
    created: task.created_at,
    started: task.started_at,
    finished: task.completed_at,
    title: task.title,
    logs: task.error_message ? [task.error_message] : [],
    result,
    dependencies: readDependencies(task.context, task.parent_task_id, task.approval_id),
    errors: task.error_message,
    retries: readRetries(task.context),
    ageMinutes: ageMinutes(task.started_at ?? task.updated_at ?? task.created_at),
    assignedModel: "Not Tracked",
    apiUsage: "Not Tracked",
    costUsd: task.cost_estimate_usd ?? "Not Tracked"
  };
}

function normalizeAiTask(task: AiTask, logs: Array<{ status: string; message: string; provider: string | null; model: string | null; input_tokens: number | null; output_tokens: number | null; cost_estimate_usd: number | null; created_at: string }>): AiCommandCenterTask {
  const usageLog = logs.find((log) => log.model || log.input_tokens || log.output_tokens || log.cost_estimate_usd);
  return {
    taskId: task.id,
    source: "ai_tasks",
    priority: task.priority,
    department: mapDepartment(task.assigned_agent, task.task_type),
    assignedWorker: task.assigned_agent,
    status: task.status,
    created: task.created_at,
    started: task.started_at,
    finished: task.completed_at,
    title: task.task_type.replaceAll("_", " "),
    logs: logs.slice(0, 3).map((log) => `${log.status}: ${log.message}`),
    result: readResult(task.result_payload),
    dependencies: [task.lead_id, task.business_application_id].filter((value): value is string => Boolean(value)),
    errors: task.error_message,
    retries: Number(task.attempts ?? 0),
    ageMinutes: ageMinutes(task.started_at ?? task.updated_at ?? task.created_at),
    assignedModel: usageLog?.model ?? "Not Tracked",
    apiUsage: usageLog ? `${usageLog.input_tokens ?? 0} in / ${usageLog.output_tokens ?? 0} out` : "Not Tracked",
    costUsd: task.cost_estimate_usd ?? usageLog?.cost_estimate_usd ?? "Not Tracked"
  };
}

function normalizeAcquisitionJob(job: Record<string, unknown>): AiCommandCenterTask {
  return {
    taskId: String(job.id ?? "acquisition-job"),
    source: "acquisition_jobs",
    priority: "medium",
    department: "merchant_acquisition",
    assignedWorker: String(job.assigned_agent_key ?? "lead_acquisition_agent"),
    status: String(job.status ?? "queued"),
    created: String(job.created_at ?? new Date(0).toISOString()),
    started: stringOrNull(job.started_at),
    finished: stringOrNull(job.completed_at),
    title: String(job.job_type ?? "acquisition job").replaceAll("_", " "),
    logs: job.error_message ? [String(job.error_message)] : [],
    result: readResult(job.result_summary ?? job.counts ?? null),
    dependencies: [job.source_id, job.approval_id].filter((value): value is string => typeof value === "string" && value.length > 0),
    errors: stringOrNull(job.error_message),
    retries: readRetries(job.parameters),
    ageMinutes: ageMinutes(stringOrNull(job.started_at) ?? String(job.updated_at ?? job.created_at ?? new Date(0).toISOString())),
    assignedModel: "Not Tracked",
    apiUsage: "Not Tracked",
    costUsd: "Not Tracked"
  };
}

function normalizeOutreachQueueItem(item: Record<string, unknown>): AiCommandCenterTask {
  return {
    taskId: String(item.id ?? "outreach-email"),
    source: "outreach_email_queue",
    priority: item.status === "failed" ? "high" : "medium",
    department: "marketing",
    assignedWorker: String(item.created_by_agent_key ?? "outreach_agent"),
    status: String(item.status ?? "queued"),
    created: String(item.created_at ?? new Date(0).toISOString()),
    started: stringOrNull(item.scheduled_at),
    finished: stringOrNull(item.sent_at),
    title: String(item.subject ?? "outreach email"),
    logs: item.last_error ? [String(item.last_error)] : [],
    result: item.provider_message_id ? `Provider id ${String(item.provider_message_id)}` : null,
    dependencies: [item.lead_id, item.campaign_id, item.approval_id].filter((value): value is string => typeof value === "string" && value.length > 0),
    errors: stringOrNull(item.last_error),
    retries: Number(item.retry_count ?? 0),
    ageMinutes: ageMinutes(String(item.updated_at ?? item.created_at ?? new Date(0).toISOString())),
    assignedModel: "Not Tracked",
    apiUsage: "Not Tracked",
    costUsd: "Not Tracked"
  };
}

function buildWorkerManager(
  departments: AiCommandCenterDepartment[],
  tasks: AiCommandCenterTask[],
  workerStates: Array<Record<string, unknown>>,
  heartbeats: WorkerHeartbeatRow[]
): AiCommandCenterWorker[] {
  const workersPaused = workerStates.some((row) => Boolean(row.workers_paused));
  return departments.map((department) => {
    const heartbeat = heartbeats.find((row) => row.worker_name === department.workerName);
    const workerTasks = tasks.filter((task) => task.department === department.key || task.assignedWorker === department.workerName);
    const activeTasks = workerTasks.filter((task) => ACTIVE_STATUSES.has(task.status));
    const failedTasks = workerTasks.filter((task) => FAILED_STATUSES.has(task.status));
    const runningTask = activeTasks.find((task) => task.status === "running") ?? activeTasks[0] ?? null;
    const lastCompletedTask = workerTasks.find((task) => task.finished && COMPLETE_STATUSES.has(task.status)) ?? null;
    const heartbeatOffline = heartbeat ? ageMinutes(heartbeat.last_heartbeat_at) > 15 : false;
    const heartbeatStatus: AiCommandCenterWorker["status"] | null = heartbeat
      ? heartbeatOffline
        ? "offline"
        : heartbeat.status === "running"
          ? "active"
          : heartbeat.status === "failed"
            ? "failed"
            : "idle"
      : null;
    const status: AiCommandCenterWorker["status"] = workersPaused
      ? "paused"
      : heartbeatStatus
        ? heartbeatStatus
      : runningTask && runningTask.ageMinutes >= HUNG_MINUTES
        ? "hung"
        : failedTasks.length > 0
          ? "failed"
          : runningTask
            ? "active"
            : "idle";

    return {
      workerName: heartbeat?.worker_name ?? runningTask?.assignedWorker ?? department.workerName,
      department: department.name,
      status,
      currentTask: heartbeat?.current_task ?? runningTask?.title ?? "No active task",
      queue: heartbeat?.queue_size ?? activeTasks.length,
      progress: department.progress,
      eta: estimateEta(runningTask),
      assignedModel: runningTask?.assignedModel ?? lastCompletedTask?.assignedModel ?? "Not Tracked",
      apiUsage: runningTask?.apiUsage ?? lastCompletedTask?.apiUsage ?? "Not Tracked",
      costUsd: sumTrackedCosts(workerTasks),
      retries: workerTasks.reduce((sum, task) => sum + task.retries, 0),
      errors: failedTasks.length,
      lastCompletedTask: heartbeat?.last_completed_task ?? lastCompletedTask?.title ?? null,
      lastSeen: heartbeat?.last_heartbeat_at ?? runningTask?.started ?? lastCompletedTask?.finished ?? null,
      queueName: heartbeat?.queue_name ?? null,
      averageExecutionMs: heartbeat?.average_execution_ms ?? "Not Tracked"
    };
  });
}

function buildSchedulerManager(runs: SchedulerExecutionRunRow[]) {
  return {
    recent: runs.slice(0, 10),
    failed: runs.filter((run) => run.status === "failed" || run.success === false).slice(0, 10),
    disabled: runs.filter((run) => run.status === "disabled").slice(0, 10),
    lastRun: runs[0] ?? null
  };
}

function buildSupervisorAlerts(input: {
  hungWorkers: number;
  failedWorkers: number;
  retryLoops: number;
  deadQueues: number;
  workersPaused: boolean;
  offlineWorkers: number;
  schedulerFailures: number;
}) {
  const alerts: Array<{ label: string; detail: string; severity: CommandCenterHealth }> = [];
  if (input.hungWorkers > 0) alerts.push({ label: "Hung workers", detail: `${input.hungWorkers} running task(s) are older than ${HUNG_MINUTES} minutes.`, severity: "critical" });
  if (input.failedWorkers > 0) alerts.push({ label: "Failed workers", detail: `${input.failedWorkers} failed task(s) need review.`, severity: "critical" });
  if (input.retryLoops > 0) alerts.push({ label: "Retry loops", detail: `${input.retryLoops} task(s) have retry pressure.`, severity: "watch" });
  if (input.deadQueues > 0) alerts.push({ label: "Dead queues", detail: `${input.deadQueues} department queue(s) have critical active blockers.`, severity: "critical" });
  if (input.workersPaused) alerts.push({ label: "Workers paused", detail: "Worker control state indicates paused execution.", severity: "watch" });
  if (input.offlineWorkers > 0) alerts.push({ label: "Offline workers", detail: `${input.offlineWorkers} worker heartbeat(s) are older than 15 minutes.`, severity: "watch" });
  if (input.schedulerFailures > 0) alerts.push({ label: "Scheduler failures", detail: `${input.schedulerFailures} scheduler execution(s) failed in recent durable history.`, severity: "critical" });
  return alerts;
}

function buildQueueSummary(tasks: AiCommandCenterTask[]) {
  const statuses = ["queued", "assigned", "running", "blocked", "failed", "completed"];
  return statuses.map((status) => {
    const count = tasks.filter((task) => task.status === status).length;
    const health: CommandCenterHealth = status === "failed" && count > 0 ? "critical" : status === "blocked" && count > 0 ? "watch" : "healthy";
    return { label: status.replaceAll("_", " "), count, health };
  });
}

function buildQueueManager(tasks: AiCommandCenterTask[]) {
  const statuses = ["pending_approval", "queued", "assigned", "running", "blocked", "completed", "failed", "delayed"];
  return statuses.map((status) => {
    const rows = tasks.filter((task) => task.status === status || (status === "delayed" && task.status === "queued" && task.ageMinutes > HUNG_MINUTES));
    const oldestAgeMinutes: TrackedValue<number> = rows.length > 0 ? Math.max(...rows.map((task) => task.ageMinutes)) : "Not Tracked";
    const health: CommandCenterHealth =
      status === "failed" && rows.length > 0
        ? "critical"
        : ["blocked", "delayed"].includes(status) && rows.length > 0
          ? "watch"
          : "healthy";
    return { status, count: rows.length, oldestAgeMinutes, health };
  });
}

function buildCostDashboard(byService: Record<string, number>, successfulCalls: number, failedCalls: number): AiCommandCenterCostItem[] {
  const trackedServices = ["openai", "anthropic", "google", "sendgrid", "supabase", "vercel"];
  return trackedServices.map((service) => {
    const costUsd = byService[service];
    const tracked = typeof costUsd === "number";
    return {
      service,
      costUsd: tracked ? costUsd : "Not Tracked",
      successfulCalls: service === "openai" || service === "anthropic" ? successfulCalls : "Not Tracked",
      failedCalls: service === "openai" || service === "anthropic" ? failedCalls : "Not Tracked",
      health: tracked && failedCalls > successfulCalls && failedCalls > 0 ? "critical" : tracked ? "healthy" : "unknown"
    };
  });
}

function buildApiHealthDashboard(config: ReturnType<typeof getConfigurationStatus>, byService: Record<string, number>): AiCommandCenterIntegrationHealth[] {
  const services = [
    ["OpenAI", config.openai, "openai"],
    ["Anthropic", config.anthropic, "anthropic"],
    ["Google APIs", config.google, "google"],
    ["SendGrid", config.sendgrid, "sendgrid"],
    ["Supabase", config.supabase, "supabase"],
    ["Vercel", true, "vercel"],
    ["Apollo", config.apollo, "apollo"],
    ["Cloudflare", config.cloudflare, "cloudflare"],
    ["Zoho", config.zoho, "zoho"]
  ] as const;

  return services.map(([service, configured, usageKey]) => ({
    service,
    configured,
    status: configured ? "configured" : "missing",
    health: configured ? "healthy" : "unknown",
    detail: configured
      ? typeof byService[usageKey] === "number"
        ? "Configured; usage cost tracked when calls are recorded."
        : "Configured; live usage telemetry Not Tracked."
      : "Credential/configuration missing or disabled."
  }));
}

function buildSendGridLifecycle(
  queue: Array<Record<string, unknown>>,
  history: Array<Record<string, unknown>>,
  auditEntries: Array<Record<string, unknown>>
): SendGridLifecycleMetric[] {
  const eventCounts = auditEntries.reduce<Record<string, number>>((acc, entry) => {
    const eventType = String(entry.event_type ?? "");
    if (eventType.startsWith("sendgrid_")) {
      const event = eventType.replace("sendgrid_", "");
      acc[event] = (acc[event] ?? 0) + 1;
    }
    return acc;
  }, {});
  const sentRows = queue.filter((row) => stringOrNull(row.sent_at));
  const averageLatency = average(
    sentRows
      .map((row) => {
        const created = Date.parse(String(row.created_at ?? ""));
        const sent = Date.parse(String(row.sent_at ?? ""));
        if (!Number.isFinite(created) || !Number.isFinite(sent)) return null;
        return Math.max(0, Math.round((sent - created) / 1000));
      })
      .filter((value): value is number => value !== null)
  );

  return [
    lifecycleMetric("Queued emails", countStatus(queue, ["queued", "pending_approval"]), "outreach_email_queue status queued or pending approval.", "healthy"),
    lifecycleMetric("Sending", countStatus(queue, ["sending"]), "outreach_email_queue status sending.", "watch"),
    lifecycleMetric("Delivered", eventCounts.delivered ?? "Not Tracked", "SendGrid delivered webhook events recorded in audit log.", eventCounts.delivered ? "healthy" : "unknown"),
    lifecycleMetric("Opened", history.filter((row) => row.opened === true).length, "outreach_history opened flag updated by SendGrid open/click events.", "healthy"),
    lifecycleMetric("Clicked", eventCounts.click ?? "Not Tracked", "SendGrid click webhook events recorded in audit log only.", eventCounts.click ? "healthy" : "unknown"),
    lifecycleMetric("Deferred", eventCounts.deferred ?? countLastError(queue, "sendgrid_deferred"), "Deferred webhook events or queue error markers.", eventCounts.deferred ? "watch" : "unknown"),
    lifecycleMetric("Bounce", eventCounts.bounce ?? countLastError(queue, "sendgrid_bounce"), "Bounce webhook events or queue error markers.", eventCounts.bounce ? "critical" : "healthy"),
    lifecycleMetric("Spam report", eventCounts.spamreport ?? countLastError(queue, "sendgrid_spamreport"), "Spam report webhook events or queue error markers.", eventCounts.spamreport ? "critical" : "healthy"),
    lifecycleMetric("Dropped", eventCounts.dropped ?? countLastError(queue, "sendgrid_dropped"), "Dropped webhook events or queue error markers.", eventCounts.dropped ? "critical" : "healthy"),
    lifecycleMetric("Webhook failures", "Not Tracked", "Invalid webhook attempts are rejected but not persisted as durable metrics.", "unknown"),
    lifecycleMetric("Retries", sum(queue.map((row) => Number(row.retry_count ?? 0))), "Sum of outreach_email_queue retry_count.", "healthy"),
    lifecycleMetric("Average send latency", averageLatency === null ? "Not Tracked" : `${averageLatency}s`, "Average created_at to sent_at latency for sent queue rows.", averageLatency === null ? "unknown" : "healthy")
  ];
}

function lifecycleMetric(label: string, value: TrackedValue<number | string>, detail: string, health: CommandCenterHealth): SendGridLifecycleMetric {
  return { label, value, detail, health };
}

function buildTimeline(entries: Array<Record<string, unknown>>): AiCommandCenterTimelineItem[] {
  return entries.map((entry) => ({
    id: String(entry.id ?? `${entry.event_type ?? "event"}-${entry.created_at ?? ""}`),
    timestamp: String(entry.created_at ?? new Date(0).toISOString()),
    actor: String(entry.actor_type ?? entry.actor_id ?? "system"),
    event: String(entry.event_type ?? "activity"),
    entity: String(entry.entity_type ?? "unknown"),
    decision: inferDecision(entry),
    detail: readResult(entry.metadata ?? entry.details ?? entry.summary ?? null) ?? "No detail recorded"
  }));
}

function inferDecision(entry: Record<string, unknown>) {
  const text = `${entry.event_type ?? ""} ${entry.metadata ? readResult(entry.metadata) : ""}`.toLowerCase();
  if (text.includes("approve")) return "Founder approval";
  if (text.includes("reject")) return "Founder rejection";
  if (text.includes("ai_task")) return "AI workflow";
  if (text.includes("import")) return "CRM import";
  return "Recorded activity";
}

function normalizeDepartmentStatus(
  runningTask: AiCommandCenterTask | null,
  activeTasks: AiCommandCenterTask[],
  failedTasks: AiCommandCenterTask[]
): CommandCenterStatus {
  if (runningTask?.status === "running") return "running";
  if (failedTasks.length > 0) return "failed";
  if (activeTasks.some((task) => task.status === "blocked")) return "blocked";
  if (activeTasks.length > 0) return "queued";
  return "idle";
}

function mapDepartment(departmentOrAgent: string | null | undefined, text: string) {
  const normalized = `${departmentOrAgent ?? ""} ${text}`.toLowerCase();
  const explicit = DEPARTMENTS.find((department) => department.key === departmentOrAgent || department.name.toLowerCase() === departmentOrAgent);
  if (explicit) return explicit.key;

  return DEPARTMENTS.find((department) => department.taskMatches.some((match) => normalized.includes(match)))?.key ?? "supervisor";
}

function calculateProgress(task: AiCommandCenterTask | null, activeTasks: AiCommandCenterTask[], completedToday: number) {
  if (task?.status === "running") return 50;
  if (activeTasks.some((item) => item.status === "blocked")) return 25;
  if (activeTasks.length > 0) return 10;
  if (completedToday > 0) return 100;
  return 0;
}

function estimateEta(task: AiCommandCenterTask | null) {
  if (!task || task.status !== "running") return null;
  const remaining = Math.max(5, 45 - task.ageMinutes);
  return `${Math.round(remaining)} min`;
}

function sumTrackedCosts(tasks: AiCommandCenterTask[]): TrackedValue<number> {
  const costs = tasks.map((task) => task.costUsd).filter((value): value is number => typeof value === "number");
  return costs.length > 0 ? costs.reduce((sum, value) => sum + value, 0) : "Not Tracked";
}

function countStatus(rows: Array<Record<string, unknown>>, statuses: string[]) {
  return rows.filter((row) => statuses.includes(String(row.status ?? ""))).length;
}

function countLastError(rows: Array<Record<string, unknown>>, marker: string) {
  return rows.filter((row) => String(row.last_error ?? "").includes(marker)).length;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(sum(values) / values.length);
}

function readDependencies(context: Json | null, parentTaskId: string | null, approvalId: string | null) {
  const dependencies = [parentTaskId, approvalId].filter((value): value is string => Boolean(value));
  if (context && typeof context === "object" && !Array.isArray(context)) {
    for (const key of ["lead_id", "business_application_id", "source_id", "approval_id"]) {
      const value = context[key];
      if (typeof value === "string") dependencies.push(value);
    }
  }
  return [...new Set(dependencies)];
}

function readRetries(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const record = value as Record<string, unknown>;
  return Number(record.retry_count ?? record.retries ?? record.runtime_attempts ?? record.attempts ?? 0);
}

function readResult(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 180);
  try {
    return JSON.stringify(value).slice(0, 180);
  } catch {
    return null;
  }
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function ageMinutes(timestamp: string | null) {
  if (!timestamp) return 0;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round((Date.now() - parsed) / 60000));
}

async function collect<T>(query: PromiseLike<{ data: T[] | null; error: { message?: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}
