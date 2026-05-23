import { recordApiUsage } from "@/lib/api-usage";
import { readServerEnv } from "@/lib/env";
import { renderOperionEmail, renderParagraphEmail } from "@/lib/email/templates";
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
  const email = renderParagraphEmail({
    subject: input.subject,
    preheader: "Operion internal email delivery verification.",
    title: "Email delivery test",
    text: input.text,
    brand: "internal"
  });

  return sendSendGridEmail({
    to: input.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
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
  const email = renderOperionEmail({
    subject,
    preheader: `We received the funding application for ${input.businessName}.`,
    title: "Application received",
    intro: [
      `Hi ${input.ownerName ? input.ownerName : "there"},`,
      `Thanks for submitting your funding application for ${input.businessName}. Our team will begin underwriting review and lender matching right away.`,
      "Next step: upload bank statements, government ID, and business bank account verification documents as soon as they are available. This helps keep your application moving."
    ],
    sections: [
      { label: "Business", value: input.businessName },
      ...(input.requestedAmount ? [{ label: "Requested amount", value: formatCurrency(input.requestedAmount) }] : []),
      ...(input.fundingPurpose ? [{ label: "Funding purpose", value: input.fundingPurpose }] : [])
    ],
    ...(input.portalUrl ? { cta: { label: "Track application", url: input.portalUrl } } : {}),
    brand: "capital"
  });

  return sendSendGridEmail({
    to: input.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
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
  const email = renderOperionEmail({
    subject,
    preheader: `${input.businessName} has been matched for lender review.`,
    title: "New funding lead package",
    intro: [
      `Hi ${input.lenderName},`,
      "Operion Capital has matched a new business funding lead for your review. Please evaluate the opportunity and respond with your submission decision."
    ],
    sections: [
      { label: "Business", value: input.businessName },
      { label: "Contact", value: input.contactName ?? "Not provided" },
      { label: "Email", value: input.contactEmail ?? "Not provided" },
      { label: "Requested amount", value: formatCurrency(input.requestedAmount ?? null) },
      { label: "Industry", value: input.industry ?? "Not provided" },
      { label: "State", value: input.state ?? "Not provided" },
      { label: "Delivery status", value: input.status }
    ],
    brand: "capital"
  });

  return sendSendGridEmail({
    to: input.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    leadId: input.leadId,
    operation: "lender_package_notification_email",
    customArgs: {
      email_type: "lender_package"
    }
  });
}
