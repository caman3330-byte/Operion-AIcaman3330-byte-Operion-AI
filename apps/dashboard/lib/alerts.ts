import type { AlertSeverity, Json } from "@operion/shared";
import { alertsRepository } from "@/lib/repositories/alerts";
import { logger } from "@/lib/logger";

interface CreateAlertInput {
  severity: AlertSeverity;
  alertType: string;
  message: string;
  context?: Json | null;
}

export async function createAlert(input: CreateAlertInput) {
  const alert = await alertsRepository.create({
    severity: input.severity,
    alert_type: input.alertType,
    message: input.message,
    context: input.context ?? null,
    resolved: false,
    resolved_at: null,
    deleted_at: null
  });

  if (input.severity === "WARN" || input.severity === "CRITICAL") {
    logger.warn("ops_alert_created", {
      severity: input.severity,
      alertType: input.alertType,
      message: input.message
    });
    // TODO: Send Slack and ADMIN_EMAIL notifications through n8n health workflow.
  }

  return alert;
}
