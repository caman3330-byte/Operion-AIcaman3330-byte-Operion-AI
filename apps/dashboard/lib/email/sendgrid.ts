import { recordApiUsage } from "@/lib/api-usage";
import { readServerEnv } from "@/lib/env";
import { inferEmailPurposeFromOperation, resolveOperionSender, type OperionEmailPurpose } from "@/lib/email/senders";
import { renderOperionEmail, renderOperationalTestEmail, renderParagraphEmail, type OperionEmailTemplateKind } from "@/lib/email/templates";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/retry";
import { safeIntegrationCall } from "@/lib/runtime/integration-guards";

export interface SendGridResult {
  ok: boolean;
  status: number;
  operation?: string;
  provider?: "sendgrid";
  sender?: {
    email: string;
    name: string;
    replyTo?: string;
    purpose: OperionEmailPurpose;
  };
  messageId?: string | null;
  error?: string | null;
  timestamp?: string;
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  leadId?: string;
  emailNumber?: 1 | 2 | 3;
  operation: string;
  purpose?: OperionEmailPurpose;
  customArgs?: Record<string, string | undefined>;
}

async function sendSendGridEmail(input: SendEmailInput): Promise<SendGridResult> {
  const env = readServerEnv();
  const startedAt = Date.now();
  const purpose = input.purpose ?? inferEmailPurposeFromOperation(input.operation);
  const sender = resolveOperionSender(purpose, env.SENDGRID_FROM_EMAIL);
  const baseResult = {
    operation: input.operation,
    provider: "sendgrid" as const,
    sender: {
      email: sender.email,
      name: sender.name,
      ...(sender.replyTo ? { replyTo: sender.replyTo } : {}),
      purpose
    },
    timestamp: new Date().toISOString()
  };

  const result = await safeIntegrationCall<SendGridResult>(
    "sendgrid",
    async () => {
      let lastStatus = 0;
      try {
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
                from: { email: sender.email, name: sender.name },
                reply_to: sender.replyTo ? { email: sender.replyTo } : undefined,
                subject: input.subject,
                content: [
                  { type: "text/plain", value: input.text },
                  { type: "text/html", value: input.html }
                ]
              })
            });
            lastStatus = sendgridResponse.status;

            if (!sendgridResponse.ok) {
              const errorText = await sendgridResponse.text().catch(() => "");
              throw new Error(`SendGrid request failed with ${sendgridResponse.status}${errorText ? `: ${errorText.slice(0, 300)}` : ""}`);
            }

            return sendgridResponse;
          },
          { operation: `sendgrid.${input.operation}`, baseDelayMs: 500 }
        );

        return {
          ...baseResult,
          ok: true,
          status: response.status,
          messageId: response.headers.get("x-message-id")
        };
      } catch (error) {
        return {
          ...baseResult,
          ok: false,
          status: lastStatus,
          messageId: null,
          error: error instanceof Error ? error.message : "SendGrid request failed"
        };
      }
    },
    {
      ...baseResult,
      ok: false,
      status: 0,
      messageId: null,
      error: "SendGrid integration is disabled or unavailable"
    }
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

  return result ?? {
    ...baseResult,
    ok: false,
    status: 0,
    messageId: null,
    error: "SendGrid returned no result"
  };
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
  purpose?: OperionEmailPurpose;
}) {
  return sendSendGridEmail({
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.html.replace(/<[^>]+>/g, ""),
    leadId: input.leadId,
    emailNumber: input.emailNumber,
    operation: "outreach_email",
    purpose: input.purpose ?? "merchant_outreach",
    customArgs: {
      email_number: String(input.emailNumber)
    }
  });
}

export async function sendTestEmail(input: {
  to: string;
  subject: string;
  text: string;
  purpose?: OperionEmailPurpose;
  templateKind?: OperionEmailTemplateKind;
}) {
  const purpose = input.purpose ?? "internal_ai_alert";
  const email = input.templateKind
    ? renderOperationalTestEmail(input.templateKind)
    : renderParagraphEmail({
        subject: input.subject,
        preheader: "Operion internal email delivery verification.",
        title: "Email delivery test",
        text: input.text,
        brand: purpose === "internal_ai_alert" || purpose === "operational_summary" ? "internal" : "capital"
      });

  return sendSendGridEmail({
    to: input.to,
    subject: input.templateKind ? email.subject : input.subject,
    html: email.html,
    text: email.text,
    operation: "test_email",
    purpose,
    customArgs: {
      email_type: "test",
      template_kind: input.templateKind
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
  const subject = `Operion Capital received your funding request for ${input.businessName}`;
  const email = renderOperionEmail({
    subject,
    preheader: `We received the funding application for ${input.businessName}.`,
    title: "Funding request received",
    intro: [
      `Hi ${input.ownerName ? input.ownerName : "there"},`,
      `Thank you for submitting your business funding request for ${input.businessName}. Operion Capital is preparing your profile for funding analysis and lender matching.`,
      "The fastest next step is to upload the requested documents through your encrypted upload link. Your link is private, signed, and does not require a portal password."
    ],
    sections: [
      { label: "Business", value: input.businessName },
      ...(input.requestedAmount ? [{ label: "Requested amount", value: formatCurrency(input.requestedAmount) }] : []),
      ...(input.fundingPurpose ? [{ label: "Funding purpose", value: input.fundingPurpose }] : [])
    ],
    ...(input.portalUrl ? { cta: { label: "Upload Secure Documents", url: input.portalUrl } } : {}),
    footerNote:
      "Secure uploads are handled through signed access links and private operational review. Operion Capital prepares lender-ready funding profiles and coordinates matching with suitable funding partners.",
    brand: "capital"
  });

  return sendSendGridEmail({
    to: input.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    leadId: input.leadId,
    operation: "merchant_confirmation_email",
    purpose: "application_received",
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
    purpose: "lender_submission_package",
    customArgs: {
      email_type: "lender_package"
    }
  });
}
