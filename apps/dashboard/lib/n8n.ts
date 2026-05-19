import type { Json } from "@operion/shared";
import { logger } from "@/lib/logger";
import { safeIntegrationCall } from "@/lib/runtime/integration-guards";

interface DispatchN8nWorkflowInput {
  workflowKey: string;
  event: string;
  payload: Json;
}

export async function dispatchN8nWorkflow(input: DispatchN8nWorkflowInput) {
  return safeIntegrationCall("n8n", async () => {
    const baseUrl = process.env.N8N_WEBHOOK_BASE_URL?.replace(/\/$/, "");
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
      return { dispatched: false as const, reason: "request_failed", status: response.status };
    }

    return { dispatched: true as const, status: response.status };
  }, {
    dispatched: false as const,
    reason: "not_configured",
    status: 0
  });
}
