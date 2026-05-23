import { validateAiProviders } from "../ai/execution-validation";
import { getOperationalDiagnostics } from "../observability/events";
import { getOperatorDashboardSummary } from "../operator-dashboard/service";
import { getLaunchMonitoringSnapshot } from "./monitoring";
import { runOperationalSupabaseSmokeTest } from "./supabase-smoke";
import type { MerchantSubmissionInput } from "../intake/types";

export interface PrelaunchValidationResult {
  success: boolean;
  checks: Array<{
    name: string;
    success: boolean;
    severity: "info" | "warn" | "error";
    detail?: unknown;
    error?: string;
  }>;
}

export async function runPrelaunchOperationalValidation(input: {
  includeAiValidation: boolean;
  includeWriteSmokeTest: boolean;
  provider: "openai" | "claude" | "both";
  merchant?: MerchantSubmissionInput;
}): Promise<PrelaunchValidationResult> {
  const checks: PrelaunchValidationResult["checks"] = [];

  await capture(checks, "operator_dashboard_summary", "error", () => getOperatorDashboardSummary({ limit: 25 }));
  await capture(checks, "operational_diagnostics", "error", () => getOperationalDiagnostics());
  await capture(checks, "launch_monitoring_snapshot", "error", () => getLaunchMonitoringSnapshot({ limit: 25 }));

  const writeSmokeAllowed = input.includeWriteSmokeTest && canRunWriteSmokeTest();
  if (input.includeWriteSmokeTest && !writeSmokeAllowed) {
    checks.push({
      name: "staging_write_guard",
      success: false,
      severity: "error",
      error: "Write smoke tests are disabled in production unless OPERION_ALLOW_PRODUCTION_SMOKE_WRITES=true."
    });
  }

  const smoke = await runOperationalSupabaseSmokeTest({
    executeWrites: writeSmokeAllowed,
    ...(input.merchant ? { merchant: input.merchant } : {})
  });
  checks.push({
    name: "supabase_operational_smoke",
    success: smoke.success,
    severity: smoke.success ? "info" : "error",
    detail: smoke.checks
  });

  if (input.includeAiValidation) {
    const ai = await validateAiProviders({
      provider: input.provider,
      persistLog: true,
      mode: "prompt_suite",
      fallback: true
    });
    checks.push({
      name: "ai_prompt_suite_validation",
      success: ai.success,
      severity: ai.success ? "info" : "error",
      detail: ai.results
    });
  } else {
    checks.push({
      name: "ai_prompt_suite_validation",
      success: true,
      severity: "warn",
      detail: "Skipped. Set includeAiValidation=true to execute live providers."
    });
  }

  return {
    success: checks.every((check) => check.success || check.severity === "warn"),
    checks
  };
}

async function capture(
  checks: PrelaunchValidationResult["checks"],
  name: string,
  severity: "info" | "warn" | "error",
  fn: () => Promise<unknown>
) {
  try {
    const detail = await fn();
    checks.push({ name, success: true, severity: "info", detail });
  } catch (error) {
    checks.push({
      name,
      success: false,
      severity,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function canRunWriteSmokeTest() {
  return process.env.NODE_ENV !== "production" || process.env.OPERION_ALLOW_PRODUCTION_SMOKE_WRITES === "true";
}
