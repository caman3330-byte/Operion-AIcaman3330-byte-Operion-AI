import { logger } from "@/lib/logger";

export function isIntegrationEnabled(name: string) {
  switch (name) {
    case "sendgrid":
      return Boolean(process.env.SENDGRID_API_KEY) && Boolean(process.env.SENDGRID_FROM_EMAIL);
    case "stripe":
      return Boolean(process.env.STRIPE_SECRET_KEY);
    case "apollo":
      return Boolean(process.env.APOLLO_API_KEY);
    case "google":
    case "google_places":
      return Boolean(process.env.GOOGLE_PLACES_API_KEY);
    case "cloudflare":
      return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ZONE_ID);
    case "zoho":
      return Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET);
    case "acquisition_scheduler":
      return process.env.ACQUISITION_SCHEDULER_ENABLED === "true";
    case "merchant_intelligence_scheduler":
      return process.env.MERCHANT_INTELLIGENCE_SCHEDULER_ENABLED === "true";
    case "anthropic":
      return Boolean(process.env.ANTHROPIC_API_KEY);
    case "openai":
      return Boolean(process.env.OPENAI_API_KEY);
    case "crm":
      return Boolean(process.env.CRM_WEBHOOK_URL);
    case "slack":
      return Boolean(process.env.SLACK_WEBHOOK_URL);
    case "n8n":
      return Boolean(process.env.N8N_WEBHOOK_BASE_URL);
    default:
      return false;
  }
}

export async function safeIntegrationCall<T>(name: string, fn: () => Promise<T>, fallback?: T): Promise<T | null> {
  if (!isIntegrationEnabled(name)) {
    logger.warn("integration_disabled", { integration: name });
    return fallback ?? null;
  }

  try {
    return await fn();
  } catch (err) {
    logger.error("integration_error", { integration: name, error: (err as Error).message });
    return fallback ?? null;
  }
}

const integrationGuards = { isIntegrationEnabled, safeIntegrationCall };

export default integrationGuards;
