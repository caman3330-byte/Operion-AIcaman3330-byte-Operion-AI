import type { AgentQueueStatus, AgentTaskQueueItem, Json } from "@operion/shared";
import { ConfigurationError } from "@/lib/errors";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type {
  AgentEventInput,
  AgentEvaluationRecord,
  AgentLessonRecord,
  AgentRuntimeState,
  AgentStrategyUpdateRecord,
  AgentWorkStatus,
  CompanyOperatingState,
  IncidentInput,
  ToolPermission,
  ToolRegistryItem,
  ToolRunCompletion,
  ToolRunInput,
  ToolRunStatus
} from "@/lib/autonomous-company/types";

const AUTONOMOUS_MIGRATION = "packages/database/migrations/0032_autonomous_company_os_milestone_1.sql";

export const autonomousRepository = {
  async getCompanyState(): Promise<CompanyOperatingState> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("company_operating_state" as never)
      .select("*")
      .eq("company_key" as never, "operion" as never)
      .maybeSingle();
    if (error) throwAutonomousDatabaseError(error);
    if (!data) {
      throw new ConfigurationError("Autonomous company migration 0032 has not seeded company operating state", {
        migration: AUTONOMOUS_MIGRATION
      });
    }
    return data as unknown as CompanyOperatingState;
  },

  async updateCompanyState(payload: Partial<CompanyOperatingState>) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("company_operating_state" as never)
      .update(payload as never)
      .eq("company_key" as never, "operion" as never)
      .select("*")
      .single();
    if (error) throwAutonomousDatabaseError(error);
    return data as unknown as CompanyOperatingState;
  },

  async refreshVerifiedMerchantGoal(readOnly = false) {
    const metrics = await acquisitionRepository.merchantAcquisitionDepartmentMetrics();
    const current = metrics.verified_merchants;
    const supabase = getSupabaseAdmin();
    const existing = await supabase.from("company_goals" as never).select("*").eq("goal_key" as never, "verified_merchants_500" as never).maybeSingle();
    if (existing.error) throw existing.error;
    const goal = existing.data as unknown as {title?: string; target?: number} | null;
    const target = Number(goal?.target ?? 500);
    if (readOnly) {
      if (!goal) throw new ConfigurationError("No configured merchant acquisition goal");
      return {goal: {...goal, current, target} as Record<string, unknown>, metrics};
    }
    const { data, error } = await supabase
      .from("company_goals" as never)
      .upsert(
        {
          goal_key: "verified_merchants_500",
          title: goal?.title ?? "Reach 500 verified merchant candidates.",
          department_key: "merchant_acquisition",
          target,
          current,
          metric_source: "merchant_acquisition_candidates",
          status: current >= target ? "complete" : "active",
          metadata: {
            review_policy: "founder_review_before_crm_import",
            metrics
          } satisfies Json
        } as never,
        { onConflict: "goal_key" }
      )
      .select("*")
      .single();
    if (error) throwAutonomousDatabaseError(error);
    return { goal: data as unknown as Record<string, unknown>, metrics };
  },

  async refreshAcquisitionDepartmentGoal(metrics: Json) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("department_goals" as never)
      .upsert(
        {
          goal_key: "merchant_acquisition_efficiency",
          department_key: "merchant_acquisition",
          title: "Generate qualified verified merchant candidates efficiently while maintaining source quality.",
          metrics,
          status: "active"
        } as never,
        { onConflict: "goal_key" }
      )
      .select("*")
      .single();
    if (error) throwAutonomousDatabaseError(error);
    return data as unknown as Record<string, unknown>;
  },

  async listRuntimeStates(): Promise<AgentRuntimeState[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_runtime_state" as never)
      .select("*")
      .order("agent_key" as never, { ascending: true });
    if (error) throwAutonomousDatabaseError(error);
    return (data ?? []) as unknown as AgentRuntimeState[];
  },

  async upsertRuntimeState(agentKey: string, payload: Partial<AgentRuntimeState>) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_runtime_state" as never)
      .upsert({ agent_key: agentKey, ...payload } as never, { onConflict: "agent_key" })
      .select("*")
      .single();
    if (error) throwAutonomousDatabaseError(error);
    return data as unknown as AgentRuntimeState;
  },

  async markAgentStarted(agentKey: string, taskId: string, provider?: string | null, model?: string | null) {
    const now = new Date().toISOString();
    return this.upsertRuntimeState(agentKey, {
      status: "WORKING",
      current_task_id: taskId,
      last_task_id: taskId,
      heartbeat_at: now,
      last_started_at: now,
      last_error: null,
      current_provider: provider ?? null,
      current_model: model ?? null
    });
  },

  async markAgentHeartbeat(agentKey: string, taskId?: string | null) {
    return this.upsertRuntimeState(agentKey, {
      status: "WORKING",
      current_task_id: taskId ?? null,
      heartbeat_at: new Date().toISOString()
    });
  },

  async markAgentCompleted(agentKey: string, taskId: string, latencyMs: number, costUsd = 0, tokensUsed = 0) {
    const current = await this.getRuntimeState(agentKey);
    const completed = (current?.tasks_completed ?? 0) + 1;
    const failed = current?.tasks_failed ?? 0;
    const priorLatency = current?.average_latency_ms ?? 0;
    const averageLatency = Math.round(((priorLatency * Math.max(completed - 1, 0)) + latencyMs) / completed);
    return this.upsertRuntimeState(agentKey, {
      status: "IDLE",
      current_task_id: null,
      last_task_id: taskId,
      heartbeat_at: new Date().toISOString(),
      last_completed_at: new Date().toISOString(),
      tasks_completed: completed,
      success_rate: completed + failed === 0 ? 0 : completed / (completed + failed),
      average_latency_ms: averageLatency,
      estimated_cost: Number((Number(current?.estimated_cost ?? 0) + costUsd).toFixed(6)),
      tokens_used: Number(current?.tokens_used ?? 0) + tokensUsed
    });
  },

  async markAgentFailed(agentKey: string, taskId: string, errorMessage: string, status: AgentWorkStatus = "ERROR") {
    const current = await this.getRuntimeState(agentKey);
    const completed = current?.tasks_completed ?? 0;
    const failed = (current?.tasks_failed ?? 0) + 1;
    return this.upsertRuntimeState(agentKey, {
      status,
      current_task_id: null,
      last_task_id: taskId,
      heartbeat_at: new Date().toISOString(),
      last_error: errorMessage,
      tasks_failed: failed,
      success_rate: completed + failed === 0 ? 0 : completed / (completed + failed)
    });
  },

  async pauseAcquisitionAgents(reason: string) {
    const agents = await this.listRuntimeStates();
    await Promise.all(
      agents
        .filter((agent) => agent.agent_key.includes("acquisition") || ACQUISITION_AGENT_KEYS.has(agent.agent_key))
        .map((agent) => this.upsertRuntimeState(agent.agent_key, { status: "PAUSED", last_error: reason }))
    );
  },

  async getRuntimeState(agentKey: string): Promise<AgentRuntimeState | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_runtime_state" as never)
      .select("*")
      .eq("agent_key" as never, agentKey as never)
      .maybeSingle();
    if (error) throwAutonomousDatabaseError(error);
    return (data as unknown as AgentRuntimeState | null) ?? null;
  },

  async listToolRegistry(): Promise<ToolRegistryItem[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_tool_registry" as never)
      .select("*")
      .order("tool_key" as never, { ascending: true });
    if (error) throwAutonomousDatabaseError(error);
    return (data ?? []) as unknown as ToolRegistryItem[];
  },

  async getTool(toolKey: string): Promise<ToolRegistryItem | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_tool_registry" as never)
      .select("*")
      .eq("tool_key" as never, toolKey as never)
      .maybeSingle();
    if (error) throwAutonomousDatabaseError(error);
    return (data as unknown as ToolRegistryItem | null) ?? null;
  },

  async createToolRun(input: ToolRunInput, permissionDecision: ToolPermission) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_tool_runs" as never)
      .insert({
        tool_key: input.toolKey,
        task_id: input.taskId ?? null,
        agent_key: input.agentKey ?? null,
        permission_decision: permissionDecision,
        status: permissionDecision === "DENIED" || permissionDecision === "APPROVAL_REQUIRED" ? "blocked" : "started",
        input: input.input ?? {}
      } as never)
      .select("*")
      .single();
    if (error) throwAutonomousDatabaseError(error);
    return data as unknown as { id: string };
  },

  async completeToolRun(id: string, status: ToolRunStatus, completion: ToolRunCompletion = {}) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_tool_runs" as never)
      .update({
        status,
        output: completion.output ?? null,
        error_message: completion.errorMessage ?? null,
        latency_ms: completion.latencyMs ?? null,
        estimated_cost: completion.estimatedCost ?? 0,
        completed_at: new Date().toISOString()
      } as never)
      .eq("id" as never, id as never)
      .select("*")
      .single();
    if (error) throwAutonomousDatabaseError(error);
    return data as unknown as Record<string, unknown>;
  },

  async recordEvent(input: AgentEventInput) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_events" as never)
      .insert({
        event_type: input.eventType,
        actor_agent_id: input.actorAgentId ?? null,
        department: input.department ?? null,
        task_id: input.taskId ?? null,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        payload: input.payload ?? {},
        severity: input.severity ?? "INFO"
      } as never)
      .select("*")
      .single();
    if (error) throwAutonomousDatabaseError(error);
    return data as unknown as Record<string, unknown>;
  },

  async listEvents(limit = 100) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_events" as never)
      .select("*")
      .order("timestamp" as never, { ascending: false })
      .limit(limit);
    if (error) throwAutonomousDatabaseError(error);
    return data ?? [];
  },

  async createIncident(input: IncidentInput) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_incidents" as never)
      .insert({
        incident_type: input.incidentType,
        severity: input.severity ?? "WARN",
        title: input.title,
        description: input.description ?? null,
        actor_agent_id: input.actorAgentId ?? null,
        department: input.department ?? null,
        task_id: input.taskId ?? null,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        payload: input.payload ?? {}
      } as never)
      .select("*")
      .single();
    if (error) throwAutonomousDatabaseError(error);
    return data as unknown as Record<string, unknown>;
  },

  async listIncidents(limit = 50) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_incidents" as never)
      .select("*")
      .order("created_at" as never, { ascending: false })
      .limit(limit);
    if (error) throwAutonomousDatabaseError(error);
    return data ?? [];
  },

  async recordDecision(agentKey: string, decisionType: string, input: Json, output: Json, taskId?: string | null, rationale?: string | null) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_decision_logs" as never)
      .insert({
        agent_key: agentKey,
        decision_type: decisionType,
        task_id: taskId ?? null,
        input,
        output,
        rationale: rationale ?? null
      } as never)
      .select("*")
      .single();
    if (error) throwAutonomousDatabaseError(error);
    return data as unknown as Record<string, unknown>;
  },

  async listDecisions(limit = 25) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_decision_logs" as never)
      .select("*")
      .order("created_at" as never, { ascending: false })
      .limit(limit);
    if (error) throwAutonomousDatabaseError(error);
    return data ?? [];
  },

  async upsertEvaluation(payload: {
    evaluation_key: string;
    window_start: string;
    window_end: string;
    source_id?: string | null;
    agent_key?: string | null;
    task_id?: string | null;
    evaluation_type: AgentEvaluationRecord["evaluation_type"];
    metrics: Json;
    outcome: AgentEvaluationRecord["outcome"];
    evidence: Json;
    evaluator?: string;
  }) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_evaluations" as never)
      .upsert(payload as never, { onConflict: "evaluation_key" })
      .select("*")
      .single();
    if (error) throwAutonomousDatabaseError(error);
    return data as unknown as AgentEvaluationRecord;
  },

  async listEvaluations(limit = 25): Promise<AgentEvaluationRecord[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_evaluations" as never)
      .select("*")
      .order("created_at" as never, { ascending: false })
      .limit(limit);
    if (error) throwAutonomousDatabaseError(error);
    return (data ?? []) as unknown as AgentEvaluationRecord[];
  },

  async upsertLesson(payload: {
    lesson_key: string;
    evaluation_id?: string | null;
    source_id?: string | null;
    agent_key?: string | null;
    task_id?: string | null;
    lesson_type: AgentLessonRecord["lesson_type"];
    conclusion: string;
    confidence: number;
    evidence: Json;
    created_by?: string;
  }) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_lessons" as never)
      .upsert(payload as never, { onConflict: "lesson_key" })
      .select("*")
      .single();
    if (error) throwAutonomousDatabaseError(error);
    return data as unknown as AgentLessonRecord;
  },

  async listLessons(limit = 25): Promise<AgentLessonRecord[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_lessons" as never)
      .select("*")
      .order("created_at" as never, { ascending: false })
      .limit(limit);
    if (error) throwAutonomousDatabaseError(error);
    return (data ?? []) as unknown as AgentLessonRecord[];
  },

  async upsertStrategyUpdate(payload: {
    strategy_key: string;
    lesson_id?: string | null;
    source_id?: string | null;
    agent_key?: string | null;
    task_id?: string | null;
    strategy_type: AgentStrategyUpdateRecord["strategy_type"];
    previous_value?: Json | null;
    new_value: Json;
    reason: string;
    evidence: Json;
    applied?: boolean;
    applied_at?: string | null;
    created_by?: string;
  }) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_strategy_updates" as never)
      .upsert(payload as never, { onConflict: "strategy_key" })
      .select("*")
      .single();
    if (error) throwAutonomousDatabaseError(error);
    return data as unknown as AgentStrategyUpdateRecord;
  },

  async listStrategyUpdates(limit = 25): Promise<AgentStrategyUpdateRecord[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_strategy_updates" as never)
      .select("*")
      .order("created_at" as never, { ascending: false })
      .limit(limit);
    if (error) throwAutonomousDatabaseError(error);
    return (data ?? []) as unknown as AgentStrategyUpdateRecord[];
  },

  async getActiveSourceStrategy(limit = 25): Promise<AgentStrategyUpdateRecord[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_strategy_updates" as never)
      .select("*")
      .eq("strategy_type" as never, "source_priority" as never)
      .eq("applied" as never, true as never)
      .order("created_at" as never, { ascending: false })
      .limit(limit);
    if (error) throwAutonomousDatabaseError(error);
    return (data ?? []) as unknown as AgentStrategyUpdateRecord[];
  },

  async todaysBudget(scope: "company" | "department" | "agent" | "task", scopeKey: string, budgetUsd: number) {
    const supabase = getSupabaseAdmin();
    const existing = await supabase.from("agent_budget_windows" as never).select("*").eq("scope" as never, scope as never)
      .eq("scope_key" as never, scopeKey as never).eq("window_date" as never, new Date().toISOString().slice(0,10) as never).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return existing.data as unknown as {spent_usd: number; budget_usd: number; tasks_started: number};
    const { data, error } = await supabase
      .from("agent_budget_windows" as never)
      .upsert({ scope, scope_key: scopeKey, budget_usd: budgetUsd } as never, { onConflict: "scope,scope_key,window_date" })
      .select("*")
      .single();
    if (error) throwAutonomousDatabaseError(error);
    return data as unknown as { spent_usd: number; budget_usd: number; tasks_started: number };
  },

  async incrementBudget(scope: "company" | "department" | "agent" | "task", scopeKey: string, patch: { spentUsd?: number; tokensUsed?: number; tasksStarted?: number; tasksCompleted?: number }) {
    const supabase = getSupabaseAdmin();
    const budget = await this.todaysBudget(scope, scopeKey, 0);
    const { data, error } = await supabase
      .from("agent_budget_windows" as never)
      .update({
        spent_usd: Number(budget.spent_usd ?? 0) + Number(patch.spentUsd ?? 0),
        tokens_used: Number((budget as any).tokens_used ?? 0) + Number(patch.tokensUsed ?? 0),
        tasks_started: Number(budget.tasks_started ?? 0) + Number(patch.tasksStarted ?? 0),
        tasks_completed: Number((budget as any).tasks_completed ?? 0) + Number(patch.tasksCompleted ?? 0)
      } as never)
      .eq("scope" as never, scope as never)
      .eq("scope_key" as never, scopeKey as never)
      .eq("window_date" as never, new Date().toISOString().slice(0, 10) as never)
      .select("*")
      .single();
    if (error) throwAutonomousDatabaseError(error);
    return data as unknown as Record<string, unknown>;
  },

  async listRecentTasks(limit = 50, departmentKey = "merchant_acquisition") {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_task_queue")
      .select("*")
      .eq("department_key", departmentKey)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwAutonomousDatabaseError(error);
    return (data ?? []) as AgentTaskQueueItem[];
  },

  async countTasks(status: AgentQueueStatus, departmentKey = "merchant_acquisition") {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from("agent_task_queue")
      .select("id", { count: "exact", head: true })
      .eq("department_key", departmentKey)
      .eq("status", status);
    if (error) throwAutonomousDatabaseError(error);
    return count ?? 0;
  }
};

export function throwAutonomousDatabaseError(error: { code?: string; message?: string }): never {
  const message = error.message ?? "";
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    [
      "company_operating_state",
      "company_goals",
      "department_goals",
      "agent_runtime_state",
      "agent_tool_registry",
      "agent_tool_runs",
      "agent_budget_windows",
      "agent_events",
      "agent_incidents",
      "agent_decision_logs",
      "agent_evaluations",
      "agent_lessons",
      "agent_strategy_updates"
    ].some((table) => message.includes(table))
  ) {
    throw new ConfigurationError("Autonomous company migration 0032 has not been applied to Supabase", {
      migration: AUTONOMOUS_MIGRATION
    });
  }
  throw error;
}

const ACQUISITION_AGENT_KEYS = new Set([
  "acquisition_manager_agent",
  "source_discovery_agent",
  "source_scanner_agent",
  "merchant_research_agent",
  "contact_verification_agent",
  "merchant_qualification_agent",
  "deduplication_agent",
  "acquisition_monitor_agent"
]);
