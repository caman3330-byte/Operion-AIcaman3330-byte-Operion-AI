import { ConfigurationError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type {
  ManagerAgentRunInsert,
  ManagerAgentRunUpdate,
  ManagerAgentTaskInsert,
  ManagerAgentTaskUpdate
} from "@/lib/supabase/types";

export const managerAgentRepository = {
  async listRuns(limit = 50) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("manager_agent_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throwManagerAgentDatabaseError(error);
    }

    return data ?? [];
  },

  async createRun(payload: ManagerAgentRunInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("manager_agent_runs").insert(payload).select("*").single();

    if (error) {
      throwManagerAgentDatabaseError(error);
    }

    return data;
  },

  async updateRun(id: string, payload: ManagerAgentRunUpdate) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("manager_agent_runs").update(payload).eq("id", id).select("*").single();

    if (error) {
      throwManagerAgentDatabaseError(error);
    }

    return data;
  },

  async listTasks(runId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("manager_agent_tasks")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });

    if (error) {
      throwManagerAgentDatabaseError(error);
    }

    return data ?? [];
  },

  async createTasks(payload: ManagerAgentTaskInsert[]) {
    if (payload.length === 0) {
      return [];
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("manager_agent_tasks").insert(payload).select("*");

    if (error) {
      throwManagerAgentDatabaseError(error);
    }

    return data ?? [];
  },

  async updateTask(id: string, payload: ManagerAgentTaskUpdate) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("manager_agent_tasks").update(payload).eq("id", id).select("*").single();

    if (error) {
      throwManagerAgentDatabaseError(error);
    }

    return data;
  }
};

function throwManagerAgentDatabaseError(error: { code?: string; message?: string }): never {
  if (error.code === "42P01" || error.message?.includes("manager_agent_")) {
    throw new ConfigurationError("Manager-agent migration 0002 has not been applied to Supabase", {
      migration: "packages/database/migrations/0002_manager_agent_orchestration.sql"
    });
  }

  throw error;
}
