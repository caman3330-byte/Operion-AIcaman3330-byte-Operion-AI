import type { Json } from "@operion/shared";
import { safeIntegrationCall } from "@/lib/runtime/integration-guards";
import { logger } from "@/lib/logger";

export interface CrmSyncInput {
  entityType: "application" | "lead" | "business";
  entityId: string;
  payload: Json;
}

export interface CrmSyncResult {
  synced: boolean;
  status: string;
  reason?: string;
  details?: Json;
}

export async function syncToCrm(input: CrmSyncInput): Promise<CrmSyncResult | null> {
  return safeIntegrationCall(
    "crm",
    async () => {
      const webhookUrl = process.env.CRM_WEBHOOK_URL as string;
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          entity_type: input.entityType,
          entity_id: input.entityId,
          payload: input.payload,
          timestamp: new Date().toISOString()
        })
      });

      const text = await response.text();
      const details = parseProviderResponse(text);
      if (!response.ok) {
        logger.warn("crm_sync_request_failed", {
          entityType: input.entityType,
          entityId: input.entityId,
          status: response.status,
          details
        });
        return {
          synced: false,
          status: String(response.status),
          reason: "crm_webhook_rejected",
          details
        };
      }

      return {
        synced: true,
        status: String(response.status),
        details
      };
    },
    {
      synced: false,
      status: "disabled",
      reason: "crm_not_configured",
      details: null
    }
  );
}

function parseProviderResponse(text: string) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as Json;
  } catch {
    return text.slice(0, 500);
  }
}
