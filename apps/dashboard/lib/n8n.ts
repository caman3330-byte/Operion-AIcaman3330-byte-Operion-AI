import type { Json } from "@operion/shared";
import { readServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

interface DispatchN8nWorkflowInput {
  workflowKey: string;
  event: string;
  payload: Json;
}

export async function dispatchN8nWorkflow(input: DispatchN8nWorkflowInput) {
  const env = readServerEnv();
  if (!env.N8N_WEBHOOK_BASE_URL) {
    logger.debug("n8n_dispatch_skipped", { workflowKey: input.workflowKey, reason: "N8N_WEBHOOK_BASE_URL not configured" });
    return { dispatched: false, reason: "not_configured" as const };
  }

  const baseUrl = env.N8N_WEBHOOK_BASE_URL.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/${input.workflowKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event: input.event,
      workflow_key: input.workflowKey,
      payload: input.payload
    })
  });

  if (!response.ok) {
    logger.warn("n8n_dispatch_failed", { workflowKey: input.workflowKey, status: response.status });
    return { dispatched: false, reason: "request_failed" as const, status: response.status };
  }

  return { dispatched: true as const, status: response.status };
}
