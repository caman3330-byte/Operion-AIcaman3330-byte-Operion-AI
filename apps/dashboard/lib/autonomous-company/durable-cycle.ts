import { randomUUID } from "node:crypto";
import type { Json } from "@operion/shared";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { autonomousRepository } from "./repository";

export const AUTONOMY_TEST_HOST = "qvzmdrghnfjqbezneqqc.supabase.co";

export function assertTestAutonomyEnvironment() {
  if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://unconfigured").hostname !== AUTONOMY_TEST_HOST || process.env.VERCEL_ENV === "production") {
    throw new Error("Durable autonomy is TEST-only; production autonomy remains disabled");
  }
}

export interface DurableCycle {
  id: string;
  sequence: number;
  lease_token: string;
  created_at: string;
  phase: string;
  status: string;
  checkpoint: Record<string, Json>;
}

export async function cycleRpc<T>(name: string, parameters: Record<string, Json>): Promise<T[]> {
  const { data, error } = await getSupabaseAdmin().rpc(name as never, parameters as never);
  if (error) throw new Error(`${name}: ${error.message}`);
  return (data ?? []) as T[];
}

export async function checkpoint(cycle: DurableCycle, phase: string, patch: Record<string, Json>, status = "active", delay = 0) {
  const [updated] = await cycleRpc<DurableCycle>("checkpoint_company_cycle", {
    p_id: cycle.id, p_token: cycle.lease_token, p_phase: phase, p_patch: patch, p_status: status, p_delay: delay
  });
  if (!updated) throw new Error("Cycle lease lost");
  Object.assign(cycle, updated);
  await autonomousRepository.recordEvent({ eventType: `CYCLE_${phase}`, actorAgentId: "acquisition_manager_agent",
    department: "merchant_acquisition", entityType: "company_cycle", entityId: cycle.id,
    payload: { company_cycle_id: cycle.id, phase, sequence: cycle.sequence } });
}

export async function withDurableCycle<T>(work: (cycle: DurableCycle) => Promise<T>) {
  assertTestAutonomyEnvironment();
  const token = randomUUID();
  const [cycle] = await cycleRpc<DurableCycle>("claim_company_cycle", { p_token: token });
  if (!cycle) return { status: "idle", reason: "Another runtime owns the cycle or retry cooldown is active" };
  try {
    return await work(cycle);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await getSupabaseAdmin().from("company_cycles" as never).update({ last_error: message, next_wake_at: new Date(Date.now()+300_000).toISOString() } as never)
      .eq("id" as never, cycle.id as never).eq("lease_token" as never, token as never);
    await autonomousRepository.recordEvent({ eventType: "CYCLE_INTERRUPTED", severity: "ERROR", department: "merchant_acquisition",
      entityType: "company_cycle", entityId: cycle.id, payload: { reason: message, recovery: "Resume durable checkpoint on the next eligible wake" } });
    throw error;
  } finally {
    const { error } = await getSupabaseAdmin().from("company_cycles" as never).update({ lease_until: new Date(0).toISOString() } as never)
      .eq("id" as never, cycle.id as never).eq("lease_token" as never, token as never);
    if (error) throw new Error(`Cycle lease release failed: ${error.message}`);
  }
}

export async function listCompanyCycles(limit = 10) {
  const { data, error } = await getSupabaseAdmin().from("company_cycles" as never).select("*").order("sequence" as never, { ascending: false }).limit(limit);
  if (error?.code === "42P01" || error?.code === "PGRST205") return [];
  if (error) throw error;
  return (data ?? []) as unknown as DurableCycle[];
}
