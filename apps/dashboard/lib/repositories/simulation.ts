import type { AcquisitionProviderStatus, DiagnosticHealthStatus, SimulationRunStatus } from "@operion/shared";
import { ConfigurationError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type {
  AcquisitionProviderInsert,
  AcquisitionProviderUpdate,
  DiagnosticSnapshotInsert,
  ProductionReadinessReportInsert,
  SimulationLeadInsert,
  SimulationLeadUpdate,
  SimulationRunInsert,
  SimulationRunUpdate,
  WorkerControlStateUpdate,
  WorkflowExecutionTraceInsert
} from "@/lib/supabase/types";

const SIMULATION_MIGRATION = "packages/database/migrations/0005_internal_testing_simulation.sql";

export const simulationRepository = {
  async listRuns(limit = 50) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("simulation_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwSimulationDatabaseError(error);
    return data ?? [];
  },

  async getRun(id: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("simulation_runs").select("*").eq("id", id).single();
    if (error) throwSimulationDatabaseError(error);
    return data;
  },

  async createRun(payload: SimulationRunInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("simulation_runs").insert(payload).select("*").single();
    if (error) throwSimulationDatabaseError(error);
    return data;
  },

  async updateRun(id: string, payload: SimulationRunUpdate) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("simulation_runs").update(payload).eq("id", id).select("*").single();
    if (error) throwSimulationDatabaseError(error);
    return data;
  },

  async listRunLeads(simulationRunId: string, limit = 100) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("simulation_leads")
      .select("*")
      .eq("simulation_run_id", simulationRunId)
      .order("generated_index", { ascending: true })
      .limit(limit);
    if (error) throwSimulationDatabaseError(error);
    return data ?? [];
  },

  async createSimulationLeads(payloads: SimulationLeadInsert[]) {
    if (payloads.length === 0) return [];
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("simulation_leads").insert(payloads).select("*");
    if (error) throwSimulationDatabaseError(error);
    return data ?? [];
  },

  async updateSimulationLead(id: string, payload: SimulationLeadUpdate) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("simulation_leads").update(payload).eq("id", id).select("*").single();
    if (error) throwSimulationDatabaseError(error);
    return data;
  },

  async listProviders() {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("acquisition_providers")
      .select("*")
      .order("provider_key", { ascending: true });
    if (error) throwSimulationDatabaseError(error);
    return data ?? [];
  },

  async upsertProvider(payload: AcquisitionProviderInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("acquisition_providers")
      .upsert(payload, { onConflict: "provider_key" })
      .select("*")
      .single();
    if (error) throwSimulationDatabaseError(error);
    return data;
  },

  async updateProvider(providerKey: string, payload: AcquisitionProviderUpdate) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("acquisition_providers")
      .update(payload)
      .eq("provider_key", providerKey)
      .select("*")
      .single();
    if (error) throwSimulationDatabaseError(error);
    return data;
  },

  async createTrace(payload: WorkflowExecutionTraceInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("workflow_execution_traces").insert(payload).select("*").single();
    if (error) throwSimulationDatabaseError(error);
    return data;
  },

  async listTraces(limit = 100, simulationRunId?: string) {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("workflow_execution_traces")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (simulationRunId) {
      query = query.eq("simulation_run_id", simulationRunId);
    }
    const { data, error } = await query;
    if (error) throwSimulationDatabaseError(error);
    return data ?? [];
  },

  async getWorkerControls() {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("worker_control_state").select("*").eq("control_key", "global").maybeSingle();
    if (error) throwSimulationDatabaseError(error);
    return data;
  },

  async updateWorkerControls(payload: WorkerControlStateUpdate) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("worker_control_state")
      .upsert({ control_key: "global", ...payload }, { onConflict: "control_key" })
      .select("*")
      .single();
    if (error) throwSimulationDatabaseError(error);
    return data;
  },

  async createDiagnosticSnapshot(payload: DiagnosticSnapshotInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("diagnostic_snapshots").insert(payload).select("*").single();
    if (error) throwSimulationDatabaseError(error);
    return data;
  },

  async listDiagnosticSnapshots(limit = 20) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("diagnostic_snapshots")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwSimulationDatabaseError(error);
    return data ?? [];
  },

  async createReadinessReport(payload: ProductionReadinessReportInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("production_readiness_reports").insert(payload).select("*").single();
    if (error) throwSimulationDatabaseError(error);
    return data;
  },

  async listReadinessReports(limit = 10) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("production_readiness_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwSimulationDatabaseError(error);
    return data ?? [];
  },

  async countRunsByStatus(status: SimulationRunStatus) {
    return countRows("simulation_runs", { status });
  },

  async countProvidersByStatus(status: AcquisitionProviderStatus) {
    return countRows("acquisition_providers", { status });
  },

  async countDiagnosticsByStatus(status: DiagnosticHealthStatus) {
    return countRows("diagnostic_snapshots", { health_status: status });
  }
};

export function isSimulationMigrationMissing(error: unknown) {
  return error instanceof ConfigurationError && error.message.includes("0005");
}

async function countRows(table: string, filters: Record<string, string | number | boolean> = {}) {
  const supabase = getSupabaseAdmin();
  let query = supabase.from(table as never).select("id", { count: "exact", head: true });
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key as never, value as never);
  }
  const { count, error } = await query;
  if (error) throwSimulationDatabaseError(error);
  return count ?? 0;
}

function throwSimulationDatabaseError(error: { code?: string; message?: string }): never {
  const message = error.message ?? "";
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    [
      "simulation_runs",
      "simulation_leads",
      "acquisition_providers",
      "workflow_execution_traces",
      "worker_control_state",
      "diagnostic_snapshots",
      "production_readiness_reports"
    ].some((table) => message.includes(table))
  ) {
    throw new ConfigurationError("Internal testing/simulation migration 0005 has not been applied to Supabase", {
      migration: SIMULATION_MIGRATION,
      prerequisite: "packages/database/migrations/0004_lead_acquisition_outreach.sql"
    });
  }

  throw error;
}
