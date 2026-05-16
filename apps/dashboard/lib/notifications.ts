import type { AlertSeverity, Json } from "@operion/shared";
import { createAlert } from "@/lib/alerts";
import { readServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordApiUsage } from "@/lib/api-usage";

interface NotifyFounderInput {
  severity: AlertSeverity;
  alertType: string;
  title: string;
  message: string;
  context?: Json | null;
}

export async function notifyFounder(input: NotifyFounderInput) {
  const alert = await createAlert({
    severity: input.severity,
    alertType: input.alertType,
    message: `${input.title}: ${input.message}`,
    context: input.context ?? null
  });

  await Promise.allSettled([sendSlackNotification(input), sendEmailNotification(input)]);
  return alert;
}

async function sendSlackNotification(input: NotifyFounderInput) {
  const env = readServerEnv();
  if (!env.SLACK_WEBHOOK_URL) {
    logger.debug("slack_notification_skipped", { reason: "SLACK_WEBHOOK_URL not configured", alertType: input.alertType });
    return;
  }

  const response = await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: `[${input.severity}] ${input.title}\n${input.message}`
    })
  });

  if (!response.ok) {
    logger.warn("slack_notification_failed", { status: response.status, alertType: input.alertType });
  }
}

async function sendEmailNotification(input: NotifyFounderInput) {
  const env = readServerEnv();
  if (!env.SENDGRID_API_KEY || !env.SENDGRID_FROM_EMAIL || !env.ADMIN_EMAIL) {
    logger.debug("email_notification_skipped", { reason: "email notification env not configured", alertType: input.alertType });
    return;
  }

  const startedAt = Date.now();
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: env.ADMIN_EMAIL }] }],
      from: { email: env.SENDGRID_FROM_EMAIL },
      subject: `[Operion AI] ${input.title}`,
      content: [{ type: "text/plain", value: input.message }]
    })
  });

  await recordApiUsage({
    service: "sendgrid",
    operation: "founder_notification_email",
    estimatedCostUsd: Number(process.env.SENDGRID_COST_PER_EMAIL ?? 0.001),
    success: response.ok,
    latencyMs: Date.now() - startedAt
  });

  if (!response.ok) {
    logger.warn("email_notification_failed", { status: response.status, alertType: input.alertType });
  }
}
