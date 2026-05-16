import type { Json } from "@operion/shared";
import { writeAuditLog } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { simulationRepository } from "@/lib/repositories/simulation";

export async function updateWorkerControl(input: {
  action: "pause" | "resume" | "stress_mode";
  enabled?: boolean;
  reason: string;
  updatedBy: string;
}) {
  const controls = await simulationRepository.updateWorkerControls({
    workers_paused: input.action === "pause" ? true : input.action === "resume" ? false : undefined,
    stress_mode_enabled: input.action === "stress_mode" ? Boolean(input.enabled) : undefined,
    reason: input.reason,
    updated_by: input.updatedBy,
    updated_at: new Date().toISOString()
  });

  await writeAuditLog({
    eventType: `worker_control_${input.action}`,
    actorType: "founder",
    actorId: input.updatedBy,
    entityType: "simulation",
    entityId: null,
    metadata: {
      reason: input.reason,
      enabled: input.enabled ?? null
    } as Json
  });

  return controls;
}

export async function clearTestData(actorId: string) {
  const supabase = getSupabaseAdmin();
  const results: Record<string, number | null> = {};

  for (const table of [
    "workflow_execution_traces",
    "diagnostic_snapshots",
    "production_readiness_reports",
    "simulation_leads",
    "simulation_runs"
  ]) {
    const { count, error } = await supabase.from(table as never).delete({ count: "exact" }).not("id", "is", null);
    if (error) throw error;
    results[table] = count ?? 0;
  }

  for (const table of ["outreach_email_queue", "outreach_replies", "outreach_campaigns", "acquisition_jobs", "business_contacts", "lead_enrichment"]) {
    const { count, error } = await supabase.from(table as never).delete({ count: "exact" }).eq("is_test_data" as never, true as never);
    if (error) throw error;
    results[table] = count ?? 0;
  }

  const { count: leadCount, error: leadError } = await supabase.from("leads").delete({ count: "exact" }).eq("is_test_data", true);
  if (leadError) throw leadError;
  results.leads = leadCount ?? 0;

  await writeAuditLog({
    eventType: "test_data_cleared",
    actorType: "founder",
    actorId,
    entityType: "simulation",
    metadata: results as Json
  });

  return results;
}

export async function exportSimulationLogs(limit = 500) {
  const [runs, traces, diagnostics, reports] = await Promise.all([
    simulationRepository.listRuns(50),
    simulationRepository.listTraces(limit),
    simulationRepository.listDiagnosticSnapshots(50),
    simulationRepository.listReadinessReports(10)
  ]);

  return {
    exported_at: new Date().toISOString(),
    runs,
    traces,
    diagnostics,
    reports
  };
}
