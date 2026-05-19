import type { AlertSeverity, Json } from "@operion/shared";
import { alertsRepository } from "@/lib/repositories/alerts";
import { logger } from "@/lib/logger";
import { dispatchN8nWorkflow } from "@/lib/n8n";

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

    await dispatchN8nWorkflow({
      workflowKey: "health_alert",
      event: "alert_created",
      payload: {
        alert_id: alert.id,
        severity: input.severity,
        alert_type: input.alertType,
        message: input.message,
        context: input.context ?? null,
        created_at: new Date().toISOString()
      }
    }).catch((error) => {
      logger.warn("n8n_health_alert_dispatch_failed", {
        alertId: alert.id,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }

  return alert;
}
