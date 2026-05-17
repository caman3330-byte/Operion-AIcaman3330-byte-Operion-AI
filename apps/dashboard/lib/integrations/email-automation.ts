import { ConfigurationError } from "@/lib/errors";
import { sendOutreachEmail } from "@/lib/sendgrid";
import { acquisitionRepository } from "@/lib/repositories/acquisition";

export interface FundingEmailInput {
  to: string;
  subject: string;
  text: string;
  lead_id?: string | null;
  email_number?: 1 | 2 | 3;
}

export async function enqueueFundingEmail(input: FundingEmailInput) {
  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
    throw new ConfigurationError("SENDGRID_API_KEY and SENDGRID_FROM_EMAIL are required before email automation is enabled");
  }

  const htmlBody = formatEmailHtml(input.text);
  const textBody = input.text.trim();
  const emailNumber = input.email_number ?? 1;

  if (input.lead_id) {
    const queueItem = await acquisitionRepository.createEmailQueueItem({
      campaign_id: null,
      sequence_id: null,
      lead_id: input.lead_id,
      contact_id: null,
      to_email: input.to,
      subject: input.subject,
      html_body: htmlBody,
      text_body: textBody,
      status: "queued",
      scheduled_at: new Date().toISOString(),
      retry_count: 0,
      max_retries: 3,
      ai_generated: false,
      created_by_agent_key: "email_automation"
    });

    return {
      queued: true,
      queue_item_id: queueItem.id,
      lead_id: input.lead_id
    };
  }

  const result = await sendOutreachEmail({
    leadId: "email_automation",
    to: input.to,
    subject: input.subject,
    html: htmlBody,
    emailNumber
  });

  return {
    queued: false,
    sent: true,
    status: result.status,
    to: input.to
  };
}

function formatEmailHtml(text: string) {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
