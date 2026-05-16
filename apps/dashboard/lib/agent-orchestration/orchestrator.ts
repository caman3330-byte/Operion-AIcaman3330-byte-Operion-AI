import type {
  AgentDefinition,
  AgentDepartment,
  AgentDepartmentType,
  AgentPerformanceMetric,
  AgentQueueStatus,
  AgentTaskQueueItem,
  Alert,
  ExecutiveReport,
  ExecutiveReportType,
  Json,
  ManagerAgentPriority,
  WorkflowRoute
} from "@operion/shared";
import { writeAuditLog } from "@/lib/audit";
import { apiUsageRepository } from "@/lib/repositories/api-usage";
import { alertsRepository } from "@/lib/repositories/alerts";
import { isOrchestrationMigrationMissing, orchestrationRepository } from "@/lib/repositories/orchestration";
import { agentRegistry } from "@/lib/manager-agent/registry";
import { dispatchN8nWorkflow } from "@/lib/n8n";

export interface RouteWorkflowInput {
  workflowKey: string;
  title: string;
  instructions: string;
  context?: Json | null;
  priority?: ManagerAgentPriority;
  createdBy: string;
}

export interface SupervisorDepartmentSummary {
  department_key: string;
  name: string;
  type: AgentDepartmentType;
  manager_agent_key: string | null;
  active_agents: number;
  queued_tasks: number;
  running_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  pending_approvals: number;
  estimated_cost_usd: number;
}

export interface SupervisorSummary {
  source: "supabase" | "registry_fallback";
  migration_required: boolean;
  migration_path?: string;
  active_agents: number;
  running_tasks: number;
  queued_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  alerts_count: number;
  critical_alerts_count: number;
  pending_approvals: number;
  total_estimated_cost_usd: number;
  ai_usage: Awaited<ReturnType<typeof apiUsageRepository.summary>>;
  departments: SupervisorDepartmentSummary[];
  agents: AgentDefinition[];
  tasks: AgentTaskQueueItem[];
  workflow_routes: WorkflowRoute[];
  alerts: Alert[];
  metrics: AgentPerformanceMetric[];
  executive_reports: ExecutiveReport[];
}

const MIGRATION_PATH = "packages/database/migrations/0003_multi_agent_architecture.sql";
const SYSTEM_CREATED_AT = "1970-01-01T00:00:00.000Z";

export async function routeWorkflow(input: RouteWorkflowInput) {
  const route = await orchestrationRepository.getWorkflowRoute(input.workflowKey);
  const status: AgentQueueStatus = route.requires_approval ? "blocked" : "queued";
  const approvalPolicy = asRecord(route.approval_policy);
  const approvalType = stringFromRecord(approvalPolicy, "approval_type") ?? "founder_approval";

  let task = await orchestrationRepository.createTask({
    workflow_key: route.workflow_key,
    assigned_agent_key: route.primary_agent_key,
    department_key: route.department_key,
    title: input.title,
    instructions: input.instructions,
    context: input.context ?? null,
    priority: input.priority ?? "medium",
    status,
    requires_approval: route.requires_approval,
    created_by: input.createdBy
  });

  const approval = route.requires_approval
    ? await orchestrationRepository.createApproval({
        task_id: task.id,
        approval_type: approvalType,
        requested_by_agent_key: route.primary_agent_key,
        assigned_to: "founder",
        title: `${route.name}: ${input.title}`,
        details: {
          workflow_key: route.workflow_key,
          task_id: task.id,
          route_name: route.name,
          department_key: route.department_key,
          primary_agent_key: route.primary_agent_key,
          context: input.context ?? null,
          approval_policy: route.approval_policy ?? {}
        } as Json,
        status: "pending"
      })
    : null;

  if (approval) {
    task = await orchestrationRepository.updateTask(task.id, {
      approval_id: approval.id,
      status: "blocked"
    });
  }

  const fromAgent = route.fallback_agent_key ?? resolveDepartmentManager(route.department_key);
  const message = await orchestrationRepository.createMessage({
    task_id: task.id,
    from_agent_key: fromAgent,
    to_agent_key: route.primary_agent_key,
    message_type: route.requires_approval ? "escalation" : "handoff",
    subject: route.requires_approval ? "Workflow queued pending approval" : "Workflow task routed",
    body: input.instructions,
    context: {
      workflow_key: route.workflow_key,
      route_name: route.name,
      approval_id: approval?.id ?? null
    } as Json
  });

  await orchestrationRepository.upsertSharedContext({
    context_key: `workflow:${route.workflow_key}:${task.id}`,
    entity_type: "agent_task_queue",
    entity_id: task.id,
    payload: {
      workflow_key: route.workflow_key,
      task_id: task.id,
      assigned_agent_key: route.primary_agent_key,
      department_key: route.department_key,
      created_by: input.createdBy,
      context: input.context ?? null
    } as Json,
    created_by_agent_key: fromAgent
  });

  await dispatchN8nWorkflow({
    workflowKey: route.workflow_key,
    event: "workflow_routed",
    payload: {
      task_id: task.id,
      workflow_key: route.workflow_key,
      assigned_agent_key: route.primary_agent_key,
      approval_id: approval?.id ?? null,
      context: input.context ?? null
    } as Json
  });

  await writeAuditLog({
    eventType: "workflow_routed",
    actorType: input.createdBy === "n8n_workflow" ? "n8n_workflow" : input.createdBy.includes("@") ? "founder" : "system",
    actorId: input.createdBy,
    entityType: "manager_agent",
    entityId: task.id,
    metadata: {
      workflow_key: route.workflow_key,
      assigned_agent_key: route.primary_agent_key,
      requires_approval: route.requires_approval,
      approval_id: approval?.id ?? null
    } as Json
  });

  return { route, task, approval, message };
}

export async function getSupervisorSummary(): Promise<SupervisorSummary> {
  const [alerts, aiUsage] = await Promise.all([
    alertsRepository.listUnresolved(50).catch(() => []),
    apiUsageRepository.summary(30).catch(() => ({
      days: 30,
      total_cost_usd: 0,
      successful_calls: 0,
      failed_calls: 0,
      by_service: { anthropic: 0, openai: 0, apollo: 0, sendgrid: 0, stripe: 0 }
    }))
  ]);

  try {
    const [departments, agents, tasks, approvals, metrics, routes, reports] = await Promise.all([
      orchestrationRepository.listDepartments(),
      orchestrationRepository.listAgents(),
      orchestrationRepository.listTasks({ limit: 250 }),
      orchestrationRepository.listApprovals({ limit: 100 }),
      orchestrationRepository.listPerformanceMetrics(100),
      orchestrationRepository.listWorkflowRoutes(true),
      orchestrationRepository.listExecutiveReports(20)
    ]);

    const normalizedAgents = agents.map(agentRecordToDefinition);
    const departmentSummaries = departments.map((department) =>
      buildDepartmentSummary({
        department,
        agents: normalizedAgents,
        tasks,
        pendingApprovalCount: approvals.filter(
          (approval) => approval.status === "pending" && approval.requested_by_agent_key === department.manager_agent_key
        ).length,
        metrics
      })
    );

    return {
      source: "supabase",
      migration_required: false,
      active_agents: normalizedAgents.length,
      running_tasks: countByStatus(tasks, "running"),
      queued_tasks: countByStatus(tasks, "queued") + countByStatus(tasks, "assigned") + countByStatus(tasks, "blocked"),
      completed_tasks: countByStatus(tasks, "completed"),
      failed_tasks: countByStatus(tasks, "failed"),
      alerts_count: alerts.length,
      critical_alerts_count: alerts.filter((alert) => alert.severity === "CRITICAL").length,
      pending_approvals: approvals.filter((approval) => approval.status === "pending").length,
      total_estimated_cost_usd: sumTaskCosts(tasks) + aiUsage.total_cost_usd,
      ai_usage: aiUsage,
      departments: departmentSummaries,
      agents: normalizedAgents,
      tasks,
      workflow_routes: routes,
      alerts,
      metrics,
      executive_reports: reports
    };
  } catch (error) {
    if (!isOrchestrationMigrationMissing(error)) {
      throw error;
    }

    const departments = getRegistryDepartments();
    return {
      source: "registry_fallback",
      migration_required: true,
      migration_path: MIGRATION_PATH,
      active_agents: agentRegistry.length,
      running_tasks: 0,
      queued_tasks: 0,
      completed_tasks: 0,
      failed_tasks: 0,
      alerts_count: alerts.length,
      critical_alerts_count: alerts.filter((alert) => alert.severity === "CRITICAL").length,
      pending_approvals: 0,
      total_estimated_cost_usd: aiUsage.total_cost_usd,
      ai_usage: aiUsage,
      departments: departments.map((department) =>
        buildDepartmentSummary({
          department,
          agents: agentRegistry,
          tasks: [],
          pendingApprovalCount: 0,
          metrics: []
        })
      ),
      agents: agentRegistry,
      tasks: [],
      workflow_routes: [],
      alerts,
      metrics: [],
      executive_reports: []
    };
  }
}

export async function generateExecutiveReport(input: {
  reportType?: ExecutiveReportType;
  periodStart?: string;
  periodEnd?: string;
  requestedBy: string;
}) {
  const periodEnd = input.periodEnd ?? new Date().toISOString();
  const periodStart =
    input.periodStart ?? new Date(new Date(periodEnd).getTime() - 24 * 60 * 60 * 1000).toISOString();
  const summary = await getSupervisorSummary();

  const report = await orchestrationRepository.createExecutiveReport({
    report_type: input.reportType ?? "daily",
    period_start: periodStart,
    period_end: periodEnd,
    summary: buildExecutiveNarrative(summary),
    kpis: {
      active_agents: summary.active_agents,
      queued_tasks: summary.queued_tasks,
      running_tasks: summary.running_tasks,
      completed_tasks: summary.completed_tasks,
      failed_tasks: summary.failed_tasks,
      pending_approvals: summary.pending_approvals,
      alerts_count: summary.alerts_count,
      critical_alerts_count: summary.critical_alerts_count,
      total_estimated_cost_usd: summary.total_estimated_cost_usd
    } as Json,
    department_summaries: summary.departments as unknown as Json,
    alerts: summary.alerts.map((alert) => ({
      id: alert.id,
      severity: alert.severity,
      alert_type: alert.alert_type,
      message: alert.message,
      created_at: alert.created_at
    })) as Json,
    approvals_required: {
      pending_count: summary.pending_approvals
    } as Json,
    ai_activity_summary: {
      days: summary.ai_usage.days,
      successful_calls: summary.ai_usage.successful_calls,
      failed_calls: summary.ai_usage.failed_calls,
      total_cost_usd: summary.ai_usage.total_cost_usd,
      by_service: summary.ai_usage.by_service
    } as Json,
    generated_by_agent_key: "executive_manager_agent"
  });

  await writeAuditLog({
    eventType: "executive_report_generated",
    actorType: input.requestedBy === "n8n_workflow" ? "n8n_workflow" : "founder",
    actorId: input.requestedBy,
    entityType: "manager_agent",
    entityId: report.id,
    metadata: {
      report_type: report.report_type,
      period_start: report.period_start,
      period_end: report.period_end
    } as Json
  });

  return report;
}

function resolveDepartmentManager(departmentKey: string) {
  const manager = agentRegistry.find(
    (agent) => agent.department === departmentKey && (agent.role === "department_manager" || agent.role === "executive_manager")
  );

  return manager?.id ?? "executive_manager_agent";
}

function buildExecutiveNarrative(summary: SupervisorSummary) {
  const failureNote =
    summary.failed_tasks > 0
      ? `${summary.failed_tasks} failed task(s) require review.`
      : "No failed agent tasks are currently recorded.";
  const approvalNote =
    summary.pending_approvals > 0
      ? `${summary.pending_approvals} founder approval(s) are pending.`
      : "No founder approvals are pending.";

  return [
    `Operion AI is running ${summary.active_agents} configured agents across ${summary.departments.length} departments.`,
    `${summary.running_tasks} task(s) are running and ${summary.queued_tasks} task(s) are queued or blocked.`,
    `${failureNote} ${approvalNote}`,
    `Estimated AI and operational usage cost for the reporting window is $${summary.total_estimated_cost_usd.toFixed(4)}.`
  ].join(" ");
}

function buildDepartmentSummary(input: {
  department: AgentDepartment;
  agents: AgentDefinition[];
  tasks: AgentTaskQueueItem[];
  pendingApprovalCount: number;
  metrics: AgentPerformanceMetric[];
}): SupervisorDepartmentSummary {
  const departmentTasks = input.tasks.filter((task) => task.department_key === input.department.department_key);
  const departmentMetrics = input.metrics.filter((metric) => metric.department_key === input.department.department_key);

  return {
    department_key: input.department.department_key,
    name: input.department.name,
    type: input.department.type,
    manager_agent_key: input.department.manager_agent_key,
    active_agents: input.agents.filter((agent) => agent.department === input.department.type).length,
    queued_tasks:
      countByStatus(departmentTasks, "queued") + countByStatus(departmentTasks, "assigned") + countByStatus(departmentTasks, "blocked"),
    running_tasks: countByStatus(departmentTasks, "running"),
    completed_tasks: countByStatus(departmentTasks, "completed"),
    failed_tasks: countByStatus(departmentTasks, "failed"),
    pending_approvals: input.pendingApprovalCount,
    estimated_cost_usd:
      sumTaskCosts(departmentTasks) +
      departmentMetrics.reduce((sum, metric) => sum + Number(metric.estimated_cost_usd ?? 0), 0)
  };
}

function agentRecordToDefinition(record: Awaited<ReturnType<typeof orchestrationRepository.listAgents>>[number]): AgentDefinition {
  return {
    id: record.agent_key,
    name: record.name,
    department: record.department_key as AgentDepartmentType,
    role: record.role,
    manager_id: record.manager_agent_key,
    purpose: record.purpose,
    owns: jsonStringArray(record.owns),
    constraints: jsonStringArray(record.constraints),
    tools: jsonStringArray(record.tools),
    escalation_triggers: jsonStringArray(record.escalation_triggers)
  };
}

function getRegistryDepartments(): AgentDepartment[] {
  const departments = new Map<AgentDepartmentType, AgentDepartment>();

  for (const agent of agentRegistry) {
    if (departments.has(agent.department)) {
      continue;
    }

    departments.set(agent.department, {
      id: `registry-${agent.department}`,
      department_key: agent.department,
      name: departmentName(agent.department),
      type: agent.department,
      manager_agent_key: resolveDepartmentManager(agent.department),
      description: null,
      active: true,
      created_at: SYSTEM_CREATED_AT,
      updated_at: SYSTEM_CREATED_AT
    });
  }

  return Array.from(departments.values());
}

function departmentName(department: AgentDepartmentType) {
  const names: Record<AgentDepartmentType, string> = {
    executive: "Executive",
    operations: "Operations",
    sales: "Sales",
    marketing: "Marketing",
    support: "Support",
    success: "Client Success",
    finance: "Finance",
    compliance: "Compliance",
    analytics: "Analytics"
  };

  return names[department];
}

function countByStatus(tasks: AgentTaskQueueItem[], status: AgentQueueStatus) {
  return tasks.filter((task) => task.status === status).length;
}

function sumTaskCosts(tasks: AgentTaskQueueItem[]) {
  return tasks.reduce((sum, task) => sum + Number(task.cost_estimate_usd ?? 0), 0);
}

function jsonStringArray(value: Json): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asRecord(value: Json | null): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json>) : {};
}

function stringFromRecord(record: Record<string, Json>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : null;
}
