import type { Json } from "@operion/shared";
import { ConfigurationError } from "@/lib/errors";

export interface CrmSyncInput {
  entityType: "application" | "lead" | "business";
  entityId: string;
  payload: Json;
}

export async function syncToCrm(_input: CrmSyncInput) {
  if (!process.env.CRM_WEBHOOK_URL) {
    throw new ConfigurationError("CRM_WEBHOOK_URL is required before CRM syncing is enabled");
  }

  // TODO: Add CRM-specific signing, retries, and response mapping.
  return { synced: false, reason: "crm_sync_not_enabled" as const };
}
