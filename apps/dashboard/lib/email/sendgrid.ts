import { readServerEnv } from "@/lib/env";
import { recordApiUsage } from "@/lib/api-usage";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/retry";
import { safeIntegrationCall } from "@/lib/runtime/integration-guards";

export interface SendGridResult {
  ok: boolean;
  status: number;
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  leadId?: string;
  emailNumber?: 1 | 2 | 3;
  operation: string;
  customArgs?: Record<string, string | undefined>;
}

async function sendSendGridEmail(input: SendEmailInput): Promise<SendGridResult> {
  const env = readServerEnv();
  const startedAt = Date.now();

  const result = await safeIntegrationCall<SendGridResult>(
    "sendgrid",
    async () => {
      const response = await withRetry(
        async () => {
          const sendgridResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: {
              authorization: `Bearer ${env.SENDGRID_API_KEY}`,
              "content-type": "application/json"
            },
            body: JSON.stringify({
              personalizations: [
                {
                  to: [{ email: input.to }],
                  custom_args: {
                    ...input.customArgs,
                    lead_id: input.leadId,
                    email_number: input.emailNumber ? String(input.emailNumber) : undefined
                  }
                }
              ],
              from: { email: env.SENDGRID_FROM_EMAIL },
              subject: input.subject,
              content: [
                { type: "text/plain", value: input.text },
                { type: "text/html", value: input.html }
              ]
            })
          });

          if (!sendgridResponse.ok) {
            throw new Error(`SendGrid request failed with ${sendgridResponse.status}`);
          }

          return sendgridResponse;
        },
        { operation: `sendgrid.${input.operation}`, baseDelayMs: 500 }
      );

      return {
        ok: true,
        status: response.status
      };
    },
    { ok: false, status: 0 }
  );

  const success = result?.ok ?? false;
  await recordApiUsage({
    service: "sendgrid",
    operation: input.operation,
    leadId: input.leadId ?? null,
    estimatedCostUsd: Number(process.env.SENDGRID_COST_PER_EMAIL ?? 0.001),
    success,
    latencyMs: Date.now() - startedAt
  });

  if (!success) {
    logger.debug("sendgrid_skipped_or_failed", {
      operation: input.operation,
      to: input.to,
      status: result?.status ?? 0
    });
  }

  return result ?? { ok: false, status: 0 };
}

function formatEmailHtml(text: string) {
  return `<div style="font-family: Arial, Helvetica, sans-serif; color: #111; line-height: 1.5; font-size: 16px;">
    ${text
      .trim()
      .split(/\n{2,}/)
      .map((paragraph) => `<p style="margin: 0 0 16px;">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
      .join("")}
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="font-size: 13px; color: #6b7280; margin: 0;">Operion AI • Email delivery powered by SendGrid</p>
  </div>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

export async function sendOutreachEmail(input: {
  leadId: string;
  to: string;
  subject: string;
  html: string;
  emailNumber: 1 | 2 | 3;
}) {
  return sendSendGridEmail({
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.html.replace(/<[^>]+>/g, ""),
    leadId: input.leadId,
    emailNumber: input.emailNumber,
    operation: "outreach_email",
    customArgs: {
      email_number: String(input.emailNumber)
    }
  });
}

export async function sendTestEmail(input: { to: string; subject: string; text: string }) {
  return sendSendGridEmail({
    to: input.to,
    subject: input.subject,
    html: formatEmailHtml(input.text),
    text: input.text,
    operation: "test_email",
    customArgs: {
      email_type: "test"
    }
  });
}

export async function sendMerchantConfirmationEmail(input: {
  leadId: string;
  to: string;
  businessName: string;
  ownerName?: string | null;
  requestedAmount?: number | null;
  fundingPurpose?: string | null;
  portalUrl?: string | null;
}) {
  const subject = `Your Operion funding application is received for ${input.businessName}`;
  const bodyLines = [
    `Hi ${input.ownerName ? input.ownerName : "there"},`,
    `Thanks for submitting your funding application for ${input.businessName}. We received your details and will begin underwriting and lender matching right away.`,
    input.requestedAmount
      ? `Requested funding amount: ${formatCurrency(input.requestedAmount)}.`
      : "",
    input.fundingPurpose ? `Funding purpose: ${escapeHtml(input.fundingPurpose)}.` : "",
    `Next step: upload your bank statements, government ID, and business bank account verification documents as soon as possible to keep your application moving.`,
    input.portalUrl
      ? `You can track your application and upload required documents through the Operion portal: ${input.portalUrl}`
      : "You can track your application status through the Operion portal.",
    `If you have any questions, reply to this email and we will follow up.`
  ].filter(Boolean).join("\n\n");

  return sendSendGridEmail({
    to: input.to,
    subject,
    html: formatEmailHtml(bodyLines),
    text: bodyLines,
    leadId: input.leadId,
    operation: "merchant_confirmation_email",
    customArgs: {
      email_type: "merchant_confirmation"
    }
  });
}

export async function sendLenderPackageNotificationEmail(input: {
  leadId: string;
  to: string;
  lenderName: string;
  businessName: string;
  contactName?: string | null;
  contactEmail?: string | null;
  requestedAmount?: number | null;
  industry?: string | null;
  state?: string | null;
  status: "delivered" | "failed" | "pending";
}) {
  const subject = `New Operion lead package: ${input.businessName}`;
  const bodyLines = [
    `Hi ${input.lenderName},`,
    `Operion has matched a new funding lead for your review.`,
    `Business: ${input.businessName}`,
    `Contact: ${input.contactName ?? "Not provided"}`,
    `Email: ${input.contactEmail ?? "Not provided"}`,
    `Requested amount: ${formatCurrency(input.requestedAmount ?? null)}`,
    `Industry: ${input.industry ?? "Not provided"}`,
    `State: ${input.state ?? "Not provided"}`,
    `Delivery status: ${input.status}.`,
    `Please review the lead in the Operion lender dashboard and respond if you want to submit this opportunity.`
  ].join("\n\n");

  return sendSendGridEmail({
    to: input.to,
    subject,
    html: formatEmailHtml(bodyLines),
    text: bodyLines,
    leadId: input.leadId,
    operation: "lender_package_notification_email",
    customArgs: {
      email_type: "lender_package"
    }
  });
}
