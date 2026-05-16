import { ConfigurationError } from "@/lib/errors";
import { readServerEnv } from "@/lib/env";
import { recordApiUsage } from "@/lib/api-usage";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/retry";

interface SendOutreachEmailInput {
  leadId: string;
  to: string;
  subject: string;
  html: string;
  emailNumber: 1 | 2 | 3;
}

export async function sendOutreachEmail(input: SendOutreachEmailInput) {
  const env = readServerEnv();
  if (!env.SENDGRID_API_KEY || !env.SENDGRID_FROM_EMAIL) {
    throw new ConfigurationError("SENDGRID_API_KEY and SENDGRID_FROM_EMAIL are required to send outreach");
  }

  const startedAt = Date.now();

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
            personalizations: [{ to: [{ email: input.to }] }],
            from: { email: env.SENDGRID_FROM_EMAIL },
            subject: input.subject,
            content: [{ type: "text/html", value: input.html }],
            custom_args: {
              lead_id: input.leadId,
              email_number: String(input.emailNumber)
            }
          })
        });

        if (!sendgridResponse.ok) {
          throw new Error(`SendGrid request failed with ${sendgridResponse.status}`);
        }

        return sendgridResponse;
      },
      { operation: "sendgrid.sendOutreachEmail", baseDelayMs: 500 }
    );

    await recordApiUsage({
      service: "sendgrid",
      operation: "send_email",
      leadId: input.leadId,
      estimatedCostUsd: Number(process.env.SENDGRID_COST_PER_EMAIL ?? 0.001),
      success: true,
      latencyMs: Date.now() - startedAt
    });

    return {
      ok: true,
      status: response.status
    };
  } catch (error) {
    logger.error("sendgrid_outreach_failed", { leadId: input.leadId, error });
    await recordApiUsage({
      service: "sendgrid",
      operation: "send_email",
      leadId: input.leadId,
      estimatedCostUsd: Number(process.env.SENDGRID_COST_PER_EMAIL ?? 0.001),
      success: false,
      latencyMs: Date.now() - startedAt
    });
    throw error;
  }
}
