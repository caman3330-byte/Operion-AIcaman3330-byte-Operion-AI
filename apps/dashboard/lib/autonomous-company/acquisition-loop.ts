import type { AgentTaskQueueItem, Json, ManagerAgentPriority } from "@operion/shared";
import { autonomousRepository } from "@/lib/autonomous-company/repository";
import { assertBudgetAvailable, assertCompanyCanOperate, completeToolRun, failToolRun, startToolRun } from "@/lib/autonomous-company/permissions";
import { scanMerchantAcquisitionSources } from "@/lib/acquisition/merchant-source-scanner";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { chooseLearnedSourceIds, readLearningContext, runAutonomousLearningCycle } from "@/lib/autonomous-company/learning";
import { orchestrationRepository } from "@/lib/repositories/orchestration";
import { checkpoint, withDurableCycle, type DurableCycle } from "./durable-cycle";

const DEFAULT_TASK_BUDGET_USD = 0.25;

export interface CompanyLoopInput {
  requestedBy: string;
  taskLimit?: number;
  workerLimit?: number;
  dryRun?: boolean;
}

export async function runAutonomousAcquisitionCycle(input: CompanyLoopInput) {
  return withDurableCycle(cycle => runAcquisitionCycle(input, cycle));
}

async function runAcquisitionCycle(input: CompanyLoopInput, cycle: DurableCycle) {
  const startedAt = Date.parse(cycle.created_at);
  const state = await assertCompanyCanOperate("create_tasks");

  const [goalSnapshot, sourceMetrics, pendingTasks, runningTasks, learningContext, activeSources] = await Promise.all([
    autonomousRepository.refreshVerifiedMerchantGoal(),
    acquisitionRepository.merchantIntelligenceMetrics(),
    autonomousRepository.countTasks("queued"),
    autonomousRepository.countTasks("running"),
    readLearningContext(10),
    acquisitionRepository.listMerchantSources({ activeOnly: true, limit: 100 })
  ]);
  await autonomousRepository.refreshAcquisitionDepartmentGoal(sourceMetrics as Json);

  const current = Number((goalSnapshot.goal as { current?: number }).current ?? goalSnapshot.metrics.verified_merchants ?? 0);
  const target = Number((goalSnapshot.goal as { target?: number }).target ?? 500);
  const remaining = Math.max(target - current, 0);

  await autonomousRepository.recordEvent({
    eventType: "COMPANY_STARTED",
    actorAgentId: "operations_manager_agent",
    department: "merchant_acquisition",
    payload: {
      requested_by: input.requestedBy,
      autonomy_level: state.autonomy_level
    } satisfies Json
  });

  const learnedSourceRanking = chooseLearnedSourceIds(
    activeSources.filter((source) => source.approval_status === "approved" && !["blocked", "disabled"].includes(source.health_status)),
    learningContext.strategy
  );
  const strategyMode = cycle.sequence % 5 === 1 ? "explore" : "exploit";
  if (strategyMode === "explore") learnedSourceRanking.sort((a,b) => a.confidence-b.confidence || b.priority-a.priority);
  const decision = cycle.checkpoint.decision as unknown as ReturnType<typeof decideNextAcquisitionWork> || decideNextAcquisitionWork({
    current,
    target,
    remaining,
    pendingTasks,
    runningTasks,
    maxConcurrentTasks: state.max_concurrent_tasks,
    sourceMetrics,
    learnedSourceRanking,
    memoryConsidered: learningContext.memory
  });
  if (!cycle.checkpoint.decision) await checkpoint(cycle, "PLAN", { decision: decision as unknown as Json, strategy_mode: strategyMode });
  await autonomousRepository.recordDecision(
    "acquisition_manager_agent",
    "acquisition_cycle_planning",
    ({
      goal: goalSnapshot.goal,
      company_cycle_id: cycle.id,
      current_state: state,
      source_metrics: sourceMetrics,
      evidence_considered: {
        learned_source_ranking: learnedSourceRanking,
        recent_lessons: learningContext.lessons,
        recent_evaluations: learningContext.evaluations
      },
      memory_considered: learningContext.memory,
      pending_tasks: pendingTasks,
      running_tasks: runningTasks,
      model: null
    } as unknown) as Json,
    decision as unknown as Json,
    null,
    decision.briefing
  );

  const tasks: AgentTaskQueueItem[] = [];
  if (!input.dryRun) {
    for (const [index, taskPlan] of decision.tasks.slice(0, Math.min(input.taskLimit ?? 2, 2)).entries()) {
      await assertBudgetAvailable(taskPlan.assignedAgentKey, taskPlan.budgetLimitUsd);
      const task = await createAcquisitionTask(taskPlan, input.requestedBy, cycle, String(index));
      tasks.push(task);
      await autonomousRepository.recordEvent({
        eventType: "TASK_CREATED",
        actorAgentId: "acquisition_manager_agent",
        department: "merchant_acquisition",
        taskId: task.id,
        payload: {
          title: task.title,
          assigned_agent_key: task.assigned_agent_key,
          workflow_key: task.workflow_key
        } satisfies Json
      });
    }
  }
  await checkpoint(cycle, "EXECUTE", { task_ids: tasks.map(task => task.id) });

  const workerResult = input.dryRun
    ? null
    : await import("@/lib/agent-runtime/worker-runtime").then(({ runWorkerTick }) =>
        runWorkerTick({
          workerId: "autonomous-acquisition-loop",
          limit: Math.min(input.workerLimit ?? 3, state.max_concurrent_tasks),
          includeAssigned: true
          ,companyCycleId: cycle.id,
          cycleToken: cycle.lease_token
        })
      );

  const cycleTasks = (await autonomousRepository.listRecentTasks(100)).filter(task => (task as unknown as {company_cycle_id?: string}).company_cycle_id === cycle.id);
  if (cycleTasks.some(task => ["queued", "assigned", "running"].includes(task.status))) {
    await checkpoint(cycle, "WAITING", {}, "active", 300);
    return { status: "waiting", company_cycle_id: cycle.id, worker_result: workerResult };
  }

  if (!cycle.checkpoint.window_end) await checkpoint(cycle, "EVALUATE", { window_end: new Date().toISOString() });

  const learningInput = {
    taskId: tasks.at(0)?.id ?? null,
    windowStart: new Date(startedAt).toISOString(),
    windowEnd: String(cycle.checkpoint.window_end),
    ...(decision.chosen_sources?.length ? { sourceIds: decision.chosen_sources.map((source) => source.source_id) } : {})
  };
  const learningResult = input.dryRun ? null : await runAutonomousLearningCycle(learningInput);
  await checkpoint(cycle, "LEARN", { learning_result: learningResult as unknown as Json });

  const briefing = await buildCeoBriefing();
  await checkpoint(cycle, "COMPLETE", {
    briefing: briefing as unknown as Json,
    task_results: cycleTasks.map(task => ({ id: task.id, status: task.status, error: task.error_message })),
    next_action: "Read cumulative evidence and select the next eligible acquisition source"
  }, "completed", 60);
  await autonomousRepository.recordEvent({
    eventType: "AGENT_IDLE",
    actorAgentId: "acquisition_manager_agent",
    department: "merchant_acquisition",
    payload: {
      tasks_created: tasks.length,
      tasks_processed: workerResult?.processed.length ?? 0,
      evaluations_created: learningResult?.source_evaluations.length ?? 0,
      lessons_created: learningResult?.strategy_updates.length ?? 0,
      duration_ms: Date.now() - startedAt
    } satisfies Json
  });

  return {
    status: "completed",
    company_cycle_id: cycle.id,
    company_state: state.status,
    decision,
    tasks_created: tasks,
    worker_result: workerResult,
    learning_result: learningResult,
    ceo_briefing: briefing
  };
}

export async function executeSourceScannerTask(task: AgentTaskQueueItem) {
  const startedAt = Date.now();
  const { runId } = await startToolRun({
    toolKey: "SCAN_SOURCE",
    agentKey: task.assigned_agent_key,
    taskId: task.id,
    payload: task.context ?? {}
  });
  try {
    const context = asRecord(task.context);
    const result = await scanMerchantAcquisitionSources({
      assertMayContinue: () => assertCompanyCanOperate("execute_tasks"),
      requestedBy: task.assigned_agent_key,
      limit: boundedNumber(context.limit, 10, 1, 25),
      sourceLimit: boundedNumber(context.source_limit, 2, 1, 5),
      importVerified: false,
      persistCandidates: true,
      runTimeoutMs: boundedNumber(context.max_runtime_ms ?? context.run_timeout_ms, 45_000, 10_000, 55_000),
      sourceTimeoutMs: boundedNumber(context.source_timeout_ms, 25_000, 5_000, 55_000),
      pageTimeoutMs: boundedNumber(context.page_timeout_ms, 8_000, 2_000, 20_000),
      detailTimeoutMs: boundedNumber(context.detail_timeout_ms, 6_000, 2_000, 15_000),
      enrichmentTimeoutMs: boundedNumber(context.enrichment_timeout_ms, 8_000, 3_000, 25_000),
      concurrency: boundedNumber(context.concurrency, 2, 1, 3),
      maxPages: boundedNumber(context.max_pages, 3, 1, 10),
      useShards: context.use_shards !== false,
      sourceIds: Array.isArray(context.source_ids) ? context.source_ids.filter((value): value is string => typeof value === "string") : undefined,
      dryRun: context.dry_run === true
    });
    await completeToolRun(runId, result as unknown as Json, startedAt);
    await recordScanEvents(task, result);
    return {
      summary: `Source scan complete: ${result.scanned} source(s), ${result.extracted} extracted, ${result.verified} verified, ${result.rejected} rejected, ${result.duplicates} duplicate(s), ${result.imported} imported.`,
      output: result as unknown as Json,
      shouldEscalate: result.results.some((item) => item.status === "failed" || item.health_status === "blocked"),
      escalationMessage: "One or more acquisition sources failed or became blocked during autonomous scanning."
    };
  } catch (error) {
    await failToolRun(runId, error, startedAt);
    throw error;
  }
}

export async function executeAcquisitionMonitorTask(task: AgentTaskQueueItem) {
  const startedAt = Date.now();
  const { runId } = await startToolRun({
    toolKey: "READ_ACQUISITION_METRICS",
    agentKey: task.assigned_agent_key,
    taskId: task.id,
    payload: task.context ?? {}
  });
  try {
    const [metrics, sources, runtimeStates] = await Promise.all([
      acquisitionRepository.merchantAcquisitionDepartmentMetrics(),
      acquisitionRepository.listMerchantSources({ activeOnly: false, limit: 100 }),
      autonomousRepository.listRuntimeStates()
    ]);
    const degraded = sources.filter((source) => ["degraded", "blocked", "disabled"].includes(source.health_status));
    const stuckWorkers = runtimeStates.filter((agent) => agent.status === "WORKING" && agent.heartbeat_at && Date.now() - Date.parse(agent.heartbeat_at) > 10 * 60 * 1000);
    if (stuckWorkers.length > 0) {
      await autonomousRepository.createIncident({
        incidentType: "WORKER_STUCK",
        severity: "WARN",
        title: "Acquisition worker heartbeat is stale",
        description: `${stuckWorkers.length} acquisition worker(s) have stale heartbeats.`,
        actorAgentId: task.assigned_agent_key,
        department: "merchant_acquisition",
        taskId: task.id,
        payload: { workers: stuckWorkers.map((worker) => worker.agent_key) } satisfies Json
      });
    }
    await completeToolRun(runId, { metrics, degraded_sources: degraded.length, stuck_workers: stuckWorkers.length } as unknown as Json, startedAt);
    return {
      summary: `Acquisition monitor complete: ${metrics.verified_merchants} verified merchant(s), ${metrics.active_sources} active source(s), ${degraded.length} degraded/blocked/disabled source(s).`,
      output: {
        metrics,
        degraded_sources: degraded.length,
        stuck_workers: stuckWorkers.length,
        workers: runtimeStates
      } as unknown as Json,
      shouldEscalate: stuckWorkers.length > 0,
      escalationMessage: "One or more acquisition workers have stale heartbeats."
    };
  } catch (error) {
    await failToolRun(runId, error, startedAt);
    throw error;
  }
}

export async function executeAcquisitionManagerTask(task: AgentTaskQueueItem) {
  const cycle = await runAutonomousAcquisitionCycle({
    requestedBy: task.assigned_agent_key,
    taskLimit: 2,
    workerLimit: 2,
    dryRun: asRecord(task.context).dry_run === true
  });
  return {
    summary: `Acquisition manager cycle: ${cycle.status}.`,
    output: cycle as unknown as Json
  };
}

export async function buildCeoBriefing() {
  const [state, goalSnapshot, tasks, events, incidents, runtimeStates, approvals] = await Promise.all([
    autonomousRepository.getCompanyState(),
    autonomousRepository.refreshVerifiedMerchantGoal(true),
    autonomousRepository.listRecentTasks(25),
    autonomousRepository.listEvents(50),
    autonomousRepository.listIncidents(25),
    autonomousRepository.listRuntimeStates(),
    orchestrationRepository.listApprovals({ status: "pending", limit: 25 })
  ]);
  const metrics = goalSnapshot.metrics;
  const current = metrics.verified_merchants;
  const target = 500;
  const remaining = Math.max(target - current, 0);
  const completedToday = tasks.filter((task) => task.status === "completed" && isToday(task.completed_at)).length;
  const failedToday = tasks.filter((task) => task.status === "failed" && isToday(task.completed_at ?? task.updated_at)).length;
  const inProgress = tasks.filter((task) => task.status === "running" || task.status === "assigned").length;
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  return {
    today: {
      completed: completedToday,
      in_progress: inProgress,
      blocked,
      failed: failedToday,
      new_verified_merchants: null,
      source_performance: {
        active_sources: metrics.active_sources,
        sources_scanned_today: metrics.sources_scanned_today
      },
      worker_performance: runtimeStates.map((agent) => ({
        agent_key: agent.agent_key,
        status: agent.status,
        tasks_completed: agent.tasks_completed,
        tasks_failed: agent.tasks_failed,
        success_rate: agent.success_rate
      })),
      ai_cost: runtimeStates.reduce((sum, agent) => sum + Number(agent.estimated_cost ?? 0), 0),
      approvals_needed: approvals.length
    },
    goal: {
      title: String(goalSnapshot.goal.title),
      current,
      target,
      remaining,
      progress_percentage: target > 0 ? Math.min(100, Math.round((current / target) * 10000) / 100) : 0
    },
    company_state: state,
    recommendations: buildRecommendations({
      remaining,
      metrics,
      incidents: incidents as Array<{ status?: string; severity?: string; title?: string }>
    }),
    recent_events: events,
    incidents
  };
}

function decideNextAcquisitionWork(input: {
  current: number;
  target: number;
  remaining: number;
  pendingTasks: number;
  runningTasks: number;
  maxConcurrentTasks: number;
  sourceMetrics: Record<string, unknown>;
  learnedSourceRanking: Array<{ source_id: string; source_name: string; priority: number; reason: string }>;
  memoryConsidered: Array<{ memory_key?: string; memory_value?: Json; scope_key?: string }>;
}) {
  const availableSlots = Math.max(input.maxConcurrentTasks - input.pendingTasks - input.runningTasks, 0);
  const activeSources = Number(input.sourceMetrics.active_sources ?? 0);
  const failedSources = Number(input.sourceMetrics.failed_sources ?? 0);
  const selectedSources = input.learnedSourceRanking.slice(0, 1);
  const tasks: AcquisitionTaskPlan[] = [];

  if (input.remaining <= 0) {
    return {
      briefing: "The configured verified merchant target has been reached. No new acquisition work required.",
      available_slots: availableSlots,
      tasks
    };
  }

  if (availableSlots > 0 && selectedSources.length > 0) {
    tasks.push({
      title: "Scan approved merchant acquisition sources",
      instructions: `Scan productive approved merchant sources and persist verified merchant candidates for founder review only. Remaining target: ${input.remaining}.`,
      assignedAgentKey: "source_scanner_agent",
      workflowKey: "merchant_source_scan",
      priority: input.remaining > 250 ? "high" : "medium",
      budgetLimitUsd: DEFAULT_TASK_BUDGET_USD,
      context: {
        limit: 10,
        source_limit: selectedSources.length,
        source_ids: selectedSources.map((source) => source.source_id),
        learned_source_ranking: selectedSources,
        import_verified: false,
        max_runtime_ms: 45_000,
        run_timeout_ms: 45_000,
        source_timeout_ms: 25_000,
        page_timeout_ms: 8_000,
        detail_timeout_ms: 6_000,
        enrichment_timeout_ms: 8_000,
        max_pages: 3,
        concurrency: 1,
        use_shards: true,
        goal_remaining: input.remaining
      }
    });
  }

  if (availableSlots > tasks.length) {
    tasks.push({
      title: "Monitor acquisition source and worker health",
      instructions: "Inspect acquisition metrics, source health, incidents, and worker runtime state. Escalate only real failures.",
      assignedAgentKey: "acquisition_monitor_agent",
      workflowKey: "merchant_acquisition_monitor",
      priority: failedSources > 0 ? "high" : "medium",
      budgetLimitUsd: 0.05,
      context: {
        active_sources: activeSources,
        failed_sources: failedSources,
        goal_remaining: input.remaining
      }
    });
  }

  const topSource = selectedSources[0];
  return {
    briefing: `Acquisition department is operating. ${activeSources} active source(s) are available. ${input.remaining} verified merchants remain. ${tasks.length} task(s) planned.`,
    available_slots: availableSlots,
    tasks,
    chosen_action: tasks[0]?.title ?? "No task selected",
    chosen_sources: selectedSources,
    rejected_alternatives: input.learnedSourceRanking.slice(selectedSources.length, selectedSources.length + 5),
    memory_considered_count: input.memoryConsidered.length,
    reason: topSource
      ? `Prioritized ${topSource.source_name} from learned source performance evidence.`
      : "No learned source ranking was available; planner fell back to active source metrics."
  };
}

async function createAcquisitionTask(plan: AcquisitionTaskPlan, requestedBy: string, cycle?: DurableCycle, taskKey?: string) {
  const supabase = (await import("@/lib/supabase/server")).getSupabaseAdmin();
  if (cycle) {
    const { data, error } = await supabase.from("agent_task_queue").select("*").eq("company_cycle_id" as never, cycle.id as never).eq("cycle_task_key" as never, taskKey as never).maybeSingle();
    if (error) throw error;
    if (data) return data as AgentTaskQueueItem;
  }
  const task = await orchestrationRepository.createTask({
    ...(cycle ? {company_cycle_id: cycle.id, cycle_task_key: taskKey, budget_limit_usd: plan.budgetLimitUsd * 3, max_runtime_ms: 55000} : {}),
    workflow_key: plan.workflowKey,
    assigned_agent_key: plan.assignedAgentKey,
    department_key: "merchant_acquisition",
    title: plan.title,
    instructions: plan.instructions,
    context: {
      ...plan.context,
      autonomous_company_loop: true,
      crm_import: "APPROVAL_REQUIRED",
      email: "DENIED",
      lender_actions: "DENIED",
      underwriting: "DENIED"
    } satisfies Json,
    priority: plan.priority,
    status: "queued",
    requires_approval: false,
    cost_estimate_usd: plan.budgetLimitUsd,
    created_by: requestedBy
  });

  const { error: taskPolicyError } = await supabase
    .from("agent_task_queue" as never)
    .update({
      max_runtime_ms: Number(plan.context.max_runtime_ms ?? 55_000),
      max_retries: 3,
      retry_delay_seconds: 300,
      budget_limit_usd: plan.budgetLimitUsd * 3,
      tool_permissions: {
        WEB_SEARCH: "EXECUTE",
        FETCH_SOURCE: "EXECUTE",
        SCAN_SOURCE: "EXECUTE",
        EXTRACT_BUSINESS: "EXECUTE",
        VERIFY_WEBSITE: "EXECUTE",
        VERIFY_PHONE: "EXECUTE",
        EXTRACT_EMAIL: "EXECUTE",
        VERIFY_IDENTITY: "EXECUTE",
        CHECK_DUPLICATE: "EXECUTE",
        SCORE_MERCHANT: "EXECUTE",
        CREATE_MERCHANT_CANDIDATE: "EXECUTE",
        UPDATE_CANDIDATE: "EXECUTE",
        FOUNDER_REVIEW: "APPROVAL_REQUIRED",
        CRM_IMPORT: "APPROVAL_REQUIRED",
        SEND_EMAIL: "DENIED",
        LENDER_ACTION: "DENIED",
        UNDERWRITING_DECISION: "DENIED"
      }
    } as never)
    .eq("id" as never, task.id as never);
  if (taskPolicyError) throw taskPolicyError;

  return task;
}

async function recordScanEvents(
  task: AgentTaskQueueItem,
  result: Awaited<ReturnType<typeof scanMerchantAcquisitionSources>>
) {
  await autonomousRepository.recordEvent({
    eventType: "SOURCE_SCAN_COMPLETED",
    actorAgentId: task.assigned_agent_key,
    department: "merchant_acquisition",
    taskId: task.id,
    payload: result as unknown as Json,
    severity: result.results.some((item) => item.status === "failed") ? "WARN" : "INFO"
  });

  for (const source of result.results) {
    if (source.status === "failed" || source.health_status === "blocked") {
      await autonomousRepository.recordEvent({
        eventType: source.health_status === "blocked" ? "SOURCE_DEGRADED" : "SOURCE_SCAN_FAILED",
        actorAgentId: task.assigned_agent_key,
        department: "merchant_acquisition",
        taskId: task.id,
        entityType: "merchant_acquisition_source",
        entityId: source.source_id,
        payload: source as unknown as Json,
        severity: "WARN"
      });
      await autonomousRepository.createIncident({
        incidentType: source.health_status === "blocked" ? "SOURCE_BLOCKED" : "REPEATED_SOURCE_FAILURE",
        severity: "WARN",
        title: `${source.source_name} source scan degraded`,
        description: source.errors.join("; ") || "Source scan failed or became blocked.",
        actorAgentId: task.assigned_agent_key,
        department: "merchant_acquisition",
        taskId: task.id,
        entityType: "merchant_acquisition_source",
        entityId: source.source_id,
        payload: source as unknown as Json
      });
    }

    if (source.verified_businesses > 0) {
      await autonomousRepository.recordEvent({
        eventType: "MERCHANT_VERIFIED",
        actorAgentId: task.assigned_agent_key,
        department: "merchant_acquisition",
        taskId: task.id,
        entityType: "merchant_acquisition_source",
        entityId: source.source_id,
        payload: {
          source_name: source.source_name,
          verified_businesses: source.verified_businesses,
          crm_import: "not_performed"
        } satisfies Json
      });
    }
  }
}

function buildRecommendations(input: {
  remaining: number;
  metrics: Awaited<ReturnType<typeof acquisitionRepository.merchantAcquisitionDepartmentMetrics>>;
  incidents: Array<{ status?: string; severity?: string; title?: string }>;
}) {
  const recommendations = [];
  if (input.remaining > 0 && input.metrics.active_sources > 0) {
    recommendations.push(`Continue controlled source scans. ${input.remaining} verified merchant(s) remain.`);
  }
  if (input.metrics.active_sources === 0) {
    recommendations.push("Find and test replacement acquisition sources before the next scan cycle.");
  }
  if (input.metrics.pending_imports > 0) {
    recommendations.push(`${input.metrics.pending_imports} verified merchant candidate(s) are ready for founder review before CRM import.`);
  }
  if (input.incidents.some((incident) => incident.status === "OPEN")) {
    recommendations.push("Review open acquisition incidents before increasing scheduler frequency.");
  }
  return recommendations;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
}

function asRecord(value: Json | null): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json>) : {};
}

function isToday(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth() && date.getUTCDate() === now.getUTCDate();
}

interface AcquisitionTaskPlan {
  title: string;
  instructions: string;
  assignedAgentKey: string;
  workflowKey: string;
  priority: ManagerAgentPriority;
  budgetLimitUsd: number;
  context: Record<string, Json>;
}
