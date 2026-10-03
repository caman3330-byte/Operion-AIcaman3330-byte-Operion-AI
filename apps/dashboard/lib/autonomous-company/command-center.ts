import { buildCeoBriefing } from "@/lib/autonomous-company/acquisition-loop";
import { autonomousRepository } from "@/lib/autonomous-company/repository";
import { readLearningContext } from "@/lib/autonomous-company/learning";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { orchestrationRepository } from "@/lib/repositories/orchestration";
import { apiUsageRepository } from "@/lib/repositories/api-usage";
import { listCompanyCycles } from "./durable-cycle";

export async function buildAutonomousCommandCenterSnapshot() {
  const [cycles, briefing, tools, recentTasks, messages, approvals, usage, sourceMetrics, acquisitionMetrics, sources, learning] = await Promise.all([
    listCompanyCycles(),
    buildCeoBriefing(),
    autonomousRepository.listToolRegistry(),
    autonomousRepository.listRecentTasks(30),
    orchestrationRepository.listMessages(),
    orchestrationRepository.listApprovals({ limit: 100 }),
    apiUsageRepository.summary(1),
    acquisitionRepository.merchantIntelligenceMetrics(),
    acquisitionRepository.merchantAcquisitionDepartmentMetrics(),
    acquisitionRepository.listMerchantSources({ activeOnly: false, limit: 100 }),
    readLearningContext(10)
  ]);

  const workers = briefing.today.worker_performance;
  const taskCounts = countBy(recentTasks, "status");
  const approvalCounts = countBy(approvals, "status");
  const openIncidents = briefing.incidents.filter((incident: any) => incident.status === "OPEN");
  const operationsStatus = workers.some((worker) => worker.status === "WORKING")
    ? "WORKING"
    : briefing.company_state.status;

  return {
    durable_runtime: {current_cycle: cycles.find(cycle => cycle.status === "active") ?? null, recent_cycles: cycles, scheduler: "External authenticated wake required", production_enabled: false},
    ...briefing,
    company: {
      operating_state: briefing.company_state.status,
      emergency_stop: briefing.company_state.emergency_stop,
      current_objective: briefing.goal.title,
      reason: briefing.company_state.reason
    },
    goals: {
      ...briefing.goal,
      trend: "Verified daily velocity unavailable"
    },
    operations_manager: {
      status: operationsStatus,
      current_task: recentTasks.find((task) => task.status === "running" || task.status === "assigned") ?? null,
      last_action: briefing.recent_events[0] ?? null,
      success_rate: workers.length === 0 ? 0 : average(workers.map((worker) => Number(worker.success_rate ?? 0))),
      current_briefing: `Acquisition department is ${briefing.company_state.status.toLowerCase()}. ${sourceMetrics.active_sources} productive source(s) are available. ${briefing.goal.remaining} verified merchant(s) remain.`
    },
    departments: [
      {
        key: "merchant_acquisition",
        name: "Acquisition",
        status: workers.some((worker) => worker.status === "WORKING") ? "WORKING" : briefing.company_state.status === "PAUSED" ? "PAUSED" : "IDLE",
        workers
      }
    ],
    live_tasks: recentTasks,
    live_events: briefing.recent_events,
    task_counts: {
      queued: taskCounts.queued ?? 0,
      running: taskCounts.running ?? 0,
      completed: taskCounts.completed ?? 0,
      failed: taskCounts.failed ?? 0,
      retrying: recentTasks.filter((task) => Number(((task.context as any) ?? {}).runtime_attempts ?? 0) > 0 && task.status === "queued").length,
      blocked: taskCounts.blocked ?? 0
    },
    approvals,
    approval_counts: {
      pending: approvalCounts.pending ?? 0,
      approved: approvalCounts.approved ?? 0,
      rejected: approvalCounts.rejected ?? 0
    },
    incidents: briefing.incidents,
    incident_counts: {
      open: openIncidents.length,
      resolved: briefing.incidents.filter((incident: any) => incident.status === "RESOLVED").length,
      critical: briefing.incidents.filter((incident: any) => incident.severity === "CRITICAL").length,
      error: briefing.incidents.filter((incident: any) => incident.severity === "ERROR").length,
      warn: briefing.incidents.filter((incident: any) => incident.severity === "WARN").length
    },
    acquisition: {
      ...acquisitionMetrics,
      source_health: countBy(sources, "health_status"),
      sources: {
        total: sources.length,
        active: sources.filter((source) => source.active).length,
        approved: sources.filter((source) => source.approval_status === "approved").length,
        disabled: sources.filter((source) => !source.active || source.health_status === "disabled").length
      }
    },
    ai_usage: {
      tokens: workers.reduce((sum, worker) => sum + Number((worker as any).tokens_used ?? 0), 0),
      cost: usage.total_cost_usd,
      provider: "AI Gateway",
      latency: null,
      requests: usage.successful_calls + usage.failed_calls,
      successful_requests: usage.successful_calls ?? 0,
      failed_requests: usage.failed_calls ?? 0
    },
    learning: {
      recent_evaluations: learning.evaluations,
      recent_lessons: learning.lessons,
      strategy_changes: learning.strategy,
      source_rankings: learning.strategy
        .filter((item) => item.source_id)
        .map((item) => ({
          source_id: item.source_id,
          priority: Number(((item.new_value as any) ?? {}).priority ?? 0),
          reason: item.reason,
          created_at: item.created_at
        }))
    },
    ceo_questions: answerCeoQuestions({
      briefing,
      recentTasks,
      approvals,
      usage,
      sourceMetrics,
      acquisitionMetrics,
      learning
    }),
    tools: tools.map((tool) => ({
      tool_key: tool.tool_key,
      permission: tool.permission,
      enabled: tool.enabled,
      risk_level: tool.risk_level
    })),
    source_metrics: sourceMetrics
  };
}

function answerCeoQuestions(input: {
  briefing: Awaited<ReturnType<typeof buildCeoBriefing>>;
  recentTasks: Awaited<ReturnType<typeof autonomousRepository.listRecentTasks>>;
  approvals: Awaited<ReturnType<typeof orchestrationRepository.listApprovals>>;
  usage: Awaited<ReturnType<typeof apiUsageRepository.summary>>;
  sourceMetrics: Awaited<ReturnType<typeof acquisitionRepository.merchantIntelligenceMetrics>>;
  acquisitionMetrics: Awaited<ReturnType<typeof acquisitionRepository.merchantAcquisitionDepartmentMetrics>>;
  learning: Awaited<ReturnType<typeof readLearningContext>>;
}) {
  const failedTasks = input.recentTasks.filter((task) => task.status === "failed" || task.error_message);
  const completedToday = input.recentTasks.filter((task) => task.status === "completed" && isToday(task.completed_at));
  return {
    what_is_the_company_doing: input.briefing.company_state.emergency_stop
      ? "The company is emergency-stopped; no autonomous work should execute."
      : input.briefing.recommendations[0] ?? "Monitoring current company state.",
    current_goal: `${input.briefing.goal.current}/${input.briefing.goal.target} verified merchants (${input.briefing.goal.progress_percentage}%).`,
    agents_doing: `${input.briefing.today.in_progress} task(s) in progress, ${input.briefing.today.blocked} blocked, ${input.briefing.today.failed} failed today.`,
    completed_today: `${completedToday.length} acquisition task(s) completed today.`,
    failed: `${failedTasks.length} recent task(s) have failure evidence.`,
    why_failed: failedTasks[0]?.error_message ?? "No recent task failure reason is present.",
    learned: input.learning.lessons[0]?.conclusion ?? "No recent learning lesson has been recorded yet.",
    changed: input.learning.strategy[0]?.reason ?? "No recent strategy change has been recorded yet.",
    best_sources: input.learning.strategy.slice(0, 3).map((item) => item.reason),
    underperforming_agents: input.briefing.today.worker_performance
      .filter((worker) => Number(worker.success_rate ?? 0) < 0.8 && Number(worker.tasks_failed ?? 0) > 0)
      .map((worker) => worker.agent_key),
    approvals_needed: `${input.approvals.filter((approval) => approval.status === "pending").length} approval(s) pending.`,
    ai_usage: `${input.usage.successful_calls + input.usage.failed_calls} logged call(s), $${Number(input.usage.total_cost_usd ?? 0).toFixed(4)} estimated cost.`,
    should_happen_next: input.briefing.recommendations[0] ?? "Keep the autonomous company stopped until the next controlled validation."
  };
}

function countBy<T extends Record<string, any>>(rows: T[], key: keyof T) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const value = String(row[key] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function average(values: number[]) {
  const usable = values.filter((value) => Number.isFinite(value));
  return usable.length === 0 ? 0 : usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function isToday(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth() && date.getUTCDate() === now.getUTCDate();
}
