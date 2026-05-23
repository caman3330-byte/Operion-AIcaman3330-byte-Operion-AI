import { renderParagraphEmail } from "@/lib/email/templates";
import { sendOutreachEmail } from "@/lib/sendgrid";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { isIntegrationEnabled } from "@/lib/runtime/integration-guards";

export interface FundingEmailInput {
  to: string;
  subject: string;
  text: string;
  lead_id?: string | null;
  email_number?: 1 | 2 | 3;
}

export async function enqueueFundingEmail(input: FundingEmailInput) {
  if (!isIntegrationEnabled("sendgrid") && !input.lead_id) {
    return {
      queued: false,
      sent: false,
      reason: "sendgrid_not_configured"
    };
  }

  const rendered = renderParagraphEmail({
    subject: input.subject,
    preheader: "Operion Capital business funding message.",
    title: input.subject,
    text: input.text,
    brand: "capital"
  });
  const emailNumber = input.email_number ?? 1;

  if (input.lead_id) {
    const queueItem = await acquisitionRepository.createEmailQueueItem({
      campaign_id: null,
      sequence_id: null,
      lead_id: input.lead_id,
      contact_id: null,
      to_email: input.to,
      subject: rendered.subject,
      html_body: rendered.html,
      text_body: rendered.text,
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
    subject: rendered.subject,
    html: rendered.html,
    emailNumber
  });

  if (!result) {
    return {
      queued: false,
      sent: false,
      status: 0,
      to: input.to
    };
  }

  return {
    queued: false,
    sent: true,
    status: result.status,
    to: input.to
  };
}
