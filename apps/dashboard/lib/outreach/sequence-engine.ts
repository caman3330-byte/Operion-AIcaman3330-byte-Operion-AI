import type { Json, Lead, OutreachCampaign, OutreachEmailQueueItem, OutreachSequence, ReplyClassification } from "@operion/shared";
import { writeAuditLog } from "@/lib/audit";
import { routeWorkflow } from "@/lib/agent-orchestration/orchestrator";
import { dispatchN8nWorkflow } from "@/lib/n8n";
import { notifyFounder } from "@/lib/notifications";
import { classifyOutreachReply } from "@/lib/outreach/reply-classifier";
import { generateOutreachEmail } from "@/lib/outreach/sdr";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { leadsRepository } from "@/lib/repositories/leads";
import { orchestrationRepository } from "@/lib/repositories/orchestration";
import { sendOutreachEmail } from "@/lib/sendgrid";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export interface PrepareSdrOutreachInput {
  leadId: string;
  campaignId?: string | null;
  requestedBy: string;
  createdByAgentKey?: string | null;
}

export interface PrepareSdrOutreachResult {
  campaign: OutreachCampaign;
  sequence: OutreachSequence;
  queue_item: OutreachEmailQueueItem;
  queue_items: OutreachEmailQueueItem[];
  approval_required: boolean;
}

export interface OutreachWorkerTickInput {
  workerId: string;
  limit?: number;
  lifecycleOnly?: boolean;
}

export interface OutreachWorkerTickResult {
  worker_id: string;
  processed: Array<{
    queue_item_id: string;
    lead_id: string;
    status: OutreachEmailQueueItem["status"];
    error?: string;
  }>;
}

export interface RecordReplyInput {
  fromEmail: string;
  subject?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  providerMessageId?: string | null;
  campaignId?: string | null;
  leadId?: string | null;
  contactId?: string | null;
  rawPayload?: Json;
}

const DEFAULT_CAMPAIGN_NAME = "Operion Capital Funding Outreach";

export async function prepareSdrOutreach(input: PrepareSdrOutreachInput): Promise<PrepareSdrOutreachResult> {
  const [lead, campaign] = await Promise.all([leadsRepository.getById(input.leadId), resolveCampaign(input)]);
  const [sequences, contact] = await Promise.all([resolveActiveSequences(campaign), resolveContact(lead)]);
  const now = Date.now();
  let accumulatedDelayMs = 0;
  const approvalRequired = campaign.status !== "active";
  const queueItems: OutreachEmailQueueItem[] = [];

  for (const sequence of sequences) {
    accumulatedDelayMs += sequence.delay_hours * 60 * 60 * 1000;
    const generated = await generateOutreachEmail({ lead, contact, campaign, sequence });
    const scheduledAt = new Date(now + accumulatedDelayMs).toISOString();
    const sequenceApprovalRequired = approvalRequired || sequence.requires_approval;

    const approval = sequenceApprovalRequired
      ? await orchestrationRepository.createApproval({
          approval_type: "outreach_email",
          requested_by_agent_key: input.createdByAgentKey ?? "outreach_agent",
          assigned_to: input.requestedBy,
          title: `Approve outreach to ${lead.business_name}`,
          details: {
            lead_id: lead.id,
            business_name: lead.business_name,
            to_email: contact?.email ?? lead.email,
            subject: generated.subject,
            compliance_notes: generated.compliance_notes,
            sequence_step: sequence.step_number
          } as Json
        })
      : null;

    const queueItem = await acquisitionRepository.createEmailQueueItem({
      campaign_id: campaign.id,
      sequence_id: sequence.id,
      lead_id: lead.id,
      contact_id: contact?.id ?? null,
      to_email: contact?.email ?? lead.email ?? "",
      subject: generated.subject,
      html_body: generated.html_body,
      text_body: generated.text_body,
      status: sequenceApprovalRequired ? "pending_approval" : "queued",
      scheduled_at: scheduledAt,
      approval_id: approval?.id ?? null,
      ai_generated: true,
      created_by_agent_key: input.createdByAgentKey ?? "outreach_agent"
    });

    queueItems.push(queueItem);
  }

  await Promise.all([
    leadsRepository.update(lead.id, { outreach_started: true }),
    writeAuditLog({
      eventType: "sdr_outreach_prepared",
      actorType: "system",
      actorId: input.createdByAgentKey ?? "outreach_agent",
      entityType: "campaign",
      entityId: campaign.id,
      metadata: {
        lead_id: lead.id,
        queue_item_ids: queueItems.map((item) => item.id),
        approval_required: approvalRequired
      } as Json
    }),
    dispatchN8nWorkflow({
      workflowKey: "outreach_sdr_prep",
      event: "outreach_email_prepared",
      payload: {
        lead_id: lead.id,
        campaign_id: campaign.id,
        queue_item_ids: queueItems.map((item) => item.id),
        approval_required: approvalRequired
      } as Json
    })
  ]);

  return {
    campaign,
    sequence: sequences[0]!,
    queue_item: queueItems[0]!,
    queue_items: queueItems,
    approval_required: approvalRequired
  };
}

export async function runOutreachWorkerTick(input: OutreachWorkerTickInput): Promise<OutreachWorkerTickResult> {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
  const queued = await acquisitionRepository.listEmailQueue(input.lifecycleOnly ? limit * 5 : limit, "queued");
  const now = Date.now();
  const due = queued
    .filter((item) => new Date(item.scheduled_at).getTime() <= now)
    .filter((item) => {
      if (!input.lifecycleOnly) return true;
      return item.created_by_agent_key === "email_automation" && item.ai_generated === false;
    })
    .slice(0, limit);
  const processed: OutreachWorkerTickResult["processed"] = [];

  for (const item of due) {
    processed.push(await sendQueuedEmail(item, input.workerId));
  }

  return {
    worker_id: input.workerId,
    processed
  };
}

export async function recordOutreachReply(input: RecordReplyInput) {
  const classification = classifyOutreachReply({
    fromEmail: input.fromEmail,
    subject: input.subject ?? null,
    bodyText: input.bodyText ?? null
  });

  const reply = await acquisitionRepository.createReply({
    campaign_id: input.campaignId ?? null,
    lead_id: input.leadId ?? null,
    contact_id: input.contactId ?? null,
    provider_message_id: input.providerMessageId ?? null,
    from_email: input.fromEmail,
    subject: input.subject ?? null,
    body_text: input.bodyText ?? null,
    body_html: input.bodyHtml ?? null,
    classification: classification.classification,
    intent_score: classification.intent_score,
    sentiment: classification.sentiment,
    requires_follow_up: classification.requires_follow_up,
    escalated: classification.escalated,
    raw_payload: input.rawPayload ?? {}
  });

  await writeAuditLog({
    eventType: "outreach_reply_classified",
    actorType: "system",
    actorId: "outreach_agent",
    entityType: "outreach",
    entityId: reply.id,
    metadata: {
      classification: classification.classification,
      intent_score: classification.intent_score,
      reason: classification.reason,
      lead_id: input.leadId
    } as Json
  });

  if (input.leadId && shouldCancelPendingFollowUps(classification.classification)) {
    await acquisitionRepository.cancelPendingOutreachEmailsForLead(
      input.leadId,
      `Cancelled pending follow-up after ${classification.classification} reply`
    );
  }

  if (classification.escalated) {
    await escalateHotReply(reply.id, input, classification.reason);
  }

  return {
    reply,
    classification
  };
}

function shouldCancelPendingFollowUps(classification: ReplyClassification) {
  return ["positive", "question", "negative", "opt_out", "bounce"].includes(classification);
}

async function sendQueuedEmail(item: OutreachEmailQueueItem, workerId: string) {
  try {
    const sending = await acquisitionRepository.updateEmailQueueItem(item.id, {
      status: "sending",
      last_error: null
    });

    const result = await sendOutreachEmail({
      leadId: sending.lead_id,
      to: sending.to_email,
      subject: sending.subject,
      html: sending.html_body,
      emailNumber: clampEmailNumber(resolveSequenceStep(sending))
    });

    if (!result?.ok) {
      const failed = await acquisitionRepository.updateEmailQueueItem(sending.id, {
        status: "failed",
        last_error: `send_failed:${result?.status ?? 0}`,
        provider_message_id: String(result?.status ?? 0)
      });

      return {
        queue_item_id: sending.id,
        lead_id: sending.lead_id,
        status: failed.status,
        error: `send_failed:${result?.status ?? 0}`
      };
    }

    const sent = await acquisitionRepository.updateEmailQueueItem(sending.id, {
      status: "sent",
      sent_at: new Date().toISOString(),
      provider_message_id: result.messageId ?? String(result.status)
    });

    await Promise.all([
      insertOutreachHistory(sent),
      writeAuditLog({
        eventType: "outreach_email_sent",
        actorType: "system",
        actorId: workerId,
        entityType: "outreach",
        entityId: sent.id,
        metadata: {
          lead_id: sent.lead_id,
          campaign_id: sent.campaign_id,
          sequence_id: sent.sequence_id
        } as Json
      }),
      dispatchN8nWorkflow({
        workflowKey: "outreach",
        event: "outreach_email_sent",
        payload: {
          queue_item_id: sent.id,
          lead_id: sent.lead_id,
          campaign_id: sent.campaign_id
        } as Json
      })
    ]);

    return {
      queue_item_id: sent.id,
      lead_id: sent.lead_id,
      status: sent.status
    };
  } catch (error) {
    logger.warn("outreach_worker_send_failed", { queueItemId: item.id, workerId, error });
    return failOrRetry(item, workerId, error);
  }
}

async function failOrRetry(item: OutreachEmailQueueItem, workerId: string, error: unknown) {
  const retryCount = item.retry_count + 1;
  const errorMessage = error instanceof Error ? error.message : "Unknown outreach send error";
  const shouldRetry = retryCount < item.max_retries;
  const updated = await acquisitionRepository.updateEmailQueueItem(item.id, {
    status: shouldRetry ? "queued" : "failed",
    retry_count: retryCount,
    last_error: errorMessage,
    scheduled_at: shouldRetry ? new Date(Date.now() + retryCount * 15 * 60 * 1000).toISOString() : item.scheduled_at
  });

  await writeAuditLog({
    eventType: shouldRetry ? "outreach_email_retry_scheduled" : "outreach_email_failed",
    actorType: "system",
    actorId: workerId,
    entityType: "outreach",
    entityId: updated.id,
    metadata: {
      lead_id: updated.lead_id,
      retry_count: retryCount,
      error: errorMessage
    } as Json
  });

  if (!shouldRetry) {
    await notifyFounder({
      severity: "WARN",
      alertType: "outreach_send_failed",
      title: "Outreach email failed",
      message: `Outreach queue item ${updated.id} failed after ${retryCount} attempt(s): ${errorMessage}`,
      context: {
        queue_item_id: updated.id,
        lead_id: updated.lead_id
      } as Json
    });
  }

  return {
    queue_item_id: updated.id,
    lead_id: updated.lead_id,
    status: updated.status,
    error: errorMessage
  };
}

async function resolveCampaign(input: PrepareSdrOutreachInput) {
  if (input.campaignId) {
    return acquisitionRepository.getCampaign(input.campaignId);
  }

  const campaigns = await acquisitionRepository.listCampaigns(50);
  const existing = campaigns.find((campaign) => campaign.name === DEFAULT_CAMPAIGN_NAME && campaign.status !== "archived");
  if (existing) {
    return existing;
  }

  return acquisitionRepository.createCampaign({
    name: DEFAULT_CAMPAIGN_NAME,
    description: "Founder-approved MCA/business funding outbound campaign for AI-assisted SDR outreach.",
    status: "pending_approval",
    audience_filter: {
      minimum_quality_score: 60,
      excluded_statuses: ["blacklisted", "archived"]
    } as Json,
    created_by: input.requestedBy
  });
}

async function resolveActiveSequences(campaign: OutreachCampaign) {
  const existing = await acquisitionRepository.listSequences(campaign.id);
  const activeSequences = existing.filter((sequence) => sequence.active).sort((a, b) => a.step_number - b.step_number);
  if (activeSequences.length > 0) {
    return activeSequences;
  }

  return [
    await acquisitionRepository.createSequence({
      campaign_id: campaign.id,
      step_number: 1,
      delay_hours: 0,
      subject_template: "Funding options for {{business_name}}",
      body_template:
        "Introduce Operion Capital as a business funding team. Ask whether the business is reviewing working-capital options. Avoid guarantees.",
      channel: "email",
      requires_approval: true,
      send_window: {
        timezone: "America/New_York",
        days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        start_hour: 9,
        end_hour: 16
      } as Json
    })
  ];
}

async function resolveContact(lead: Lead) {
  const contacts = await acquisitionRepository.listContacts(200);
  const contact = contacts.find((candidate) => candidate.lead_id === lead.id && candidate.email);

  if (contact) {
    return contact;
  }

  if (!lead.email) {
    throw new ValidationError("Lead must have an email address before SDR outreach can be prepared", { lead_id: lead.id });
  }

  return acquisitionRepository.upsertContact({
    lead_id: lead.id,
    full_name: lead.contact_name,
    email: lead.email,
    phone: lead.phone,
    confidence_score: lead.contact_name ? 70 : 55,
    is_primary: true,
    raw_payload: {}
  });
}

async function insertOutreachHistory(item: OutreachEmailQueueItem) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("outreach_history").insert({
    lead_id: item.lead_id,
    email_number: clampEmailNumber(resolveSequenceStep(item)),
    sent_at: new Date().toISOString()
  });

  if (error) {
    throw error;
  }
}

async function escalateHotReply(replyId: string, input: RecordReplyInput, reason: string) {
  await notifyFounder({
    severity: "WARN",
    alertType: "hot_lead_reply",
    title: "Hot lead reply requires review",
    message: reason,
    context: {
      reply_id: replyId,
      lead_id: input.leadId,
      from_email: input.fromEmail
    } as Json
  });

  if (!input.leadId) {
    return;
  }

  await Promise.allSettled([
    leadsRepository.update(input.leadId, { status: "pending_approval" }),
    routeWorkflow({
      workflowKey: "hot_lead_escalation",
      title: `Review hot reply from ${input.fromEmail}`,
      instructions: `Review outreach reply ${replyId}. Classification reason: ${reason}`,
      context: {
        reply_id: replyId,
        lead_id: input.leadId,
        from_email: input.fromEmail
      } as Json,
      priority: "high",
      createdBy: "outreach_agent"
    })
  ]);
}

function resolveSequenceStep(item: OutreachEmailQueueItem) {
  if (!item.sequence_id) {
    return 1;
  }

  return 1;
}

function clampEmailNumber(value: number): 1 | 2 | 3 {
  if (value <= 1) return 1;
  if (value === 2) return 2;
  return 3;
}
