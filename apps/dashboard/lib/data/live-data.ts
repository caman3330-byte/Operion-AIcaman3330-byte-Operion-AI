import type { Alert, AuditLogEntry, Lead, Lender, PromptTestResult, PromptVersion } from "@operion/shared";
import { getConfigurationStatus } from "@/lib/env";
import { logger } from "@/lib/logger";
import { alertsRepository } from "@/lib/repositories/alerts";
import { auditLogRepository } from "@/lib/repositories/audit-log";
import { leadsRepository } from "@/lib/repositories/leads";
import { lendersRepository } from "@/lib/repositories/lenders";
import { promptVersionsRepository } from "@/lib/repositories/prompt-versions";

type DataSource = "supabase" | "unavailable";

interface LiveDataResult<T> {
  data: T;
  source: DataSource;
}

async function fromSupabase<T>(operation: string, loader: () => Promise<T>, empty: T): Promise<LiveDataResult<T>> {
  if (!getConfigurationStatus().supabase) {
    return { data: empty, source: "unavailable" };
  }

  try {
    return { data: await loader(), source: "supabase" };
  } catch (error) {
    logger.warn("live_data_unavailable", { operation, error });
    return { data: empty, source: "unavailable" };
  }
}

export async function getLeadsData() {
  return fromSupabase<Lead[]>("leads.list", async () => {
    const result = await leadsRepository.list({ pageSize: 100 });
    return result.data;
  }, []);
}

export async function getLendersData() {
  return fromSupabase<Lender[]>("lenders.list", () => lendersRepository.list(), []);
}

export async function getAlertsData() {
  return fromSupabase<Alert[]>("alerts.listUnresolved", () => alertsRepository.listUnresolved(50), []);
}

export async function getAuditData() {
  return fromSupabase<AuditLogEntry[]>("auditLog.list", () => auditLogRepository.list({ limit: 500 }), []);
}

export async function getPromptData() {
  const versions = await fromSupabase<PromptVersion[]>(
    "promptVersions.list",
    () => promptVersionsRepository.list(),
    []
  );

  const results = await fromSupabase<PromptTestResult[]>(
    "promptVersions.listTestResults",
    () => promptVersionsRepository.listTestResults(),
    []
  );

  return {
    versions: versions.data,
    results: results.data,
    source: versions.source === "supabase" || results.source === "supabase" ? "supabase" : "unavailable"
  };
}

export async function getDashboardData() {
  const [leads, lenders, alerts, auditEntries] = await Promise.all([
    getLeadsData(),
    getLendersData(),
    getAlertsData(),
    getAuditData()
  ]);

  return {
    leads: leads.data,
    lenders: lenders.data,
    alerts: alerts.data,
    auditEntries: auditEntries.data,
    source:
      leads.source === "supabase" ||
      lenders.source === "supabase" ||
      alerts.source === "supabase" ||
      auditEntries.source === "supabase"
        ? "supabase"
        : "unavailable"
  };
}
