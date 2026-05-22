import type { Json } from "@operion/shared";
import { submitMerchantIntake } from "../intake/service";
import type { MerchantSubmissionInput } from "../intake/types";
import { getSupabaseAdmin } from "../supabase/server";
import { trackWorkflowEvent } from "../observability/events";

export interface SupabaseSmokeTestResult {
  success: boolean;
  checks: Array<{ name: string; success: boolean; error?: string; detail?: unknown }>;
}

export async function runOperationalSupabaseSmokeTest(input: {
  executeWrites: boolean;
  merchant?: MerchantSubmissionInput;
}): Promise<SupabaseSmokeTestResult> {
  const checks: SupabaseSmokeTestResult["checks"] = [];
  const supabase = await getSupabaseAdmin();

  await recordCheck(checks, "business_applications_read", async () =>
    supabase.from("business_applications").select("id").limit(1)
  );
  await recordCheck(checks, "crm_activities_read", async () =>
    supabase.from("crm_activities").select("id").limit(1)
  );
  await recordCheck(checks, "agent_task_queue_read", async () =>
    supabase.from("agent_task_queue").select("id").limit(1)
  );
  await recordCheck(checks, "ai_task_logs_read", async () =>
    supabase.from("ai_task_logs").select("id").limit(1)
  );

  if (input.executeWrites) {
    if (!input.merchant) {
      checks.push({ name: "merchant_creation_write", success: false, error: "merchant payload is required when executeWrites is true" });
    } else {
      const result = await submitMerchantIntake(input.merchant);
      checks.push({
        name: "merchant_creation_write",
        success: result.success,
        ...(result.error ? { error: result.error } : {}),
        detail: { applicationId: result.applicationId, status: result.status }
      });
    }

    const workflowResult = await trackWorkflowEvent({
      workflowKey: "operational_smoke_test",
      stepKey: "write_validation",
      status: "completed",
      metadata: { executeWrites: true } as Record<string, Json>
    });
    checks.push({
      name: "workflow_logging_write",
      success: workflowResult.success,
      ...(workflowResult.error ? { error: workflowResult.error } : {})
    });
  }

  return {
    success: checks.every((check) => check.success),
    checks
  };
}

async function recordCheck(
  checks: SupabaseSmokeTestResult["checks"],
  name: string,
  fn: () => Promise<{ error: { message: string } | null; data: unknown }>
) {
  try {
    const { data, error } = await fn();
    checks.push({
      name,
      success: !error,
      ...(error ? { error: error.message } : {}),
      detail: Array.isArray(data) ? { rows: data.length } : undefined
    });
  } catch (error) {
    checks.push({ name, success: false, error: error instanceof Error ? error.message : String(error) });
  }
}
