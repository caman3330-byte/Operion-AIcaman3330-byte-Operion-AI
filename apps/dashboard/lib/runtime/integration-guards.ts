import { logger } from "@/lib/logger";

export function isIntegrationEnabled(name: string) {
  switch (name) {
    case "sendgrid":
      return Boolean(process.env.SENDGRID_API_KEY) && Boolean(process.env.SENDGRID_FROM_EMAIL || process.env.OPERION_EMAIL_DOMAIN || process.env.OPERION_EMAIL_FUNDING);
    case "stripe":
      return Boolean(process.env.STRIPE_SECRET_KEY);
    case "apollo":
      return Boolean(process.env.APOLLO_API_KEY);
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
