import { ConfigurationError, NotFoundError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type {
  AgentApprovalRequestInsert,
  AgentApprovalRequestUpdate,
  AgentRecordInsert,
  AgentMemoryInsert,
  AgentMessageInsert,
  AgentMessageUpdate,
  AgentPerformanceMetricInsert,
  AgentSharedContextInsert,
  AgentTaskQueueInsert,
  AgentTaskQueueUpdate,
  ExecutiveReportInsert,
  WorkflowRouteUpdate
} from "@/lib/supabase/types";
import type { AgentApprovalStatus, AgentQueueStatus } from "@operion/shared";

const ORCHESTRATION_MIGRATION = "packages/database/migrations/0003_multi_agent_architecture.sql";

interface ListTasksOptions {
  limit?: number;
  status?: AgentQueueStatus;
  assignedAgentKey?: string;
  departmentKey?: string;
}

interface ListApprovalsOptions {
  limit?: number;
  status?: AgentApprovalStatus;
}

export const orchestrationRepository = {
  async listDepartments() {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_departments")
      .select("*")
      .eq("active", true)
      .order("department_key", { ascending: true });

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data ?? [];
  },

  async listAgents() {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_definitions")
      .select("*")
      .order("department_key", { ascending: true })
      .order("role", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data ?? [];
  },

  async upsertAgent(payload: AgentRecordInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_definitions")
      .upsert(payload, { onConflict: "agent_key" })
      .select("*")
      .single();

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data;
  },

  async listWorkflowRoutes(activeOnly = true) {
    const supabase = getSupabaseAdmin();
    let query = supabase.from("workflow_routes").select("*").order("workflow_key", { ascending: true });

    if (activeOnly) {
      query = query.eq("active", true);
    }

    const { data, error } = await query;

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data ?? [];
  },

  async getWorkflowRoute(workflowKey: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("workflow_routes")
      .select("*")
      .eq("workflow_key", workflowKey)
      .eq("active", true)
      .maybeSingle();

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    if (!data) {
      throw new NotFoundError(`Workflow route not found: ${workflowKey}`);
    }

    return data;
  },

  async updateWorkflowRoute(workflowKey: string, payload: WorkflowRouteUpdate) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("workflow_routes")
      .update(payload)
      .eq("workflow_key", workflowKey)
      .select("*")
      .single();

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data;
  },

  async listTasks(options: ListTasksOptions = {}) {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("agent_task_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(options.limit ?? 100);

    if (options.status) {
      query = query.eq("status", options.status);
    }

    if (options.assignedAgentKey) {
      query = query.eq("assigned_agent_key", options.assignedAgentKey);
    }

    if (options.departmentKey) {
      query = query.eq("department_key", options.departmentKey);
    }

    const { data, error } = await query;

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data ?? [];
  },

  async createTask(payload: AgentTaskQueueInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("agent_task_queue").insert(payload).select("*").single();

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data;
  },

  async updateTask(id: string, payload: AgentTaskQueueUpdate) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("agent_task_queue").update(payload).eq("id", id).select("*").single();

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data;
  },

  async claimTask(id: string, payload: AgentTaskQueueUpdate, allowedStatuses: AgentQueueStatus[] = ["queued", "assigned"]) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_task_queue")
      .update(payload)
      .eq("id", id)
      .in("status", allowedStatuses)
      .select("*")
      .maybeSingle();

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data;
  },

  async listMessages(taskId?: string) {
    const supabase = getSupabaseAdmin();
    let query = supabase.from("agent_messages").select("*").order("created_at", { ascending: true }).limit(100);

    if (taskId) {
      query = query.eq("task_id", taskId);
    }

    const { data, error } = await query;

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data ?? [];
  },

  async createMessage(payload: AgentMessageInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("agent_messages").insert(payload).select("*").single();

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data;
  },

  async updateMessage(id: string, payload: AgentMessageUpdate) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("agent_messages").update(payload).eq("id", id).select("*").single();

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data;
  },

  async listMemory() {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_memory")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data ?? [];
  },

  async upsertMemory(payload: AgentMemoryInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_memory")
      .upsert(payload, { onConflict: "scope,scope_key,memory_key" })
      .select("*")
      .single();

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data;
  },

  async listSharedContext() {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_shared_context")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data ?? [];
  },

  async upsertSharedContext(payload: AgentSharedContextInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_shared_context")
      .upsert(payload, { onConflict: "context_key" })
      .select("*")
      .single();

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data;
  },

  async listApprovals(options: ListApprovalsOptions = {}) {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("agent_approval_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(options.limit ?? 100);

    if (options.status) {
      query = query.eq("status", options.status);
    }

    const { data, error } = await query;

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data ?? [];
  },

  async createApproval(payload: AgentApprovalRequestInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("agent_approval_requests").insert(payload).select("*").single();

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data;
  },

  async updateApproval(id: string, payload: AgentApprovalRequestUpdate) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_approval_requests")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data;
  },

  async listPerformanceMetrics(limit = 100) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agent_performance_metrics")
      .select("*")
      .order("metric_date", { ascending: false })
      .limit(limit);

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data ?? [];
  },

  async createPerformanceMetric(payload: AgentPerformanceMetricInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("agent_performance_metrics").insert(payload).select("*").single();

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data;
  },

  async listExecutiveReports(limit = 30) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("executive_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data ?? [];
  },

  async createExecutiveReport(payload: ExecutiveReportInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("executive_reports").insert(payload).select("*").single();

    if (error) {
      throwOrchestrationDatabaseError(error);
    }

    return data;
  }
};

export function isOrchestrationMigrationMissing(error: unknown) {
  return error instanceof ConfigurationError && error.message.includes("0003");
}

function throwOrchestrationDatabaseError(error: { code?: string; message?: string }): never {
  const message = error.message ?? "";
  if (
    error.code === "42P01" ||
    message.includes("agent_departments") ||
    message.includes("agent_definitions") ||
    message.includes("agent_task_queue") ||
    message.includes("agent_messages") ||
    message.includes("agent_memory") ||
    message.includes("agent_shared_context") ||
    message.includes("workflow_routes") ||
    message.includes("agent_approval_requests") ||
    message.includes("agent_performance_metrics") ||
    message.includes("executive_reports")
  ) {
    throw new ConfigurationError("Multi-agent migration 0003 has not been applied to Supabase", {
      migration: ORCHESTRATION_MIGRATION
    });
  }

  throw error;
}
