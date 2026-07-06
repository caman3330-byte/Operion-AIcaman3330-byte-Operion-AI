import { NextRequest, NextResponse } from "next/server";
import { createVerify } from "node:crypto";
import type { Json, OutreachEmailStatus } from "@operion/shared";
import { writeAuditLog } from "@/lib/audit";
import { ConfigurationError, ValidationError, handleRouteError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SendGridEvent {
  event?: string;
  lead_id?: string;
  email_number?: string;
  sg_message_id?: string;
  "smtp-id"?: string;
  timestamp?: number;
  response?: string;
  reason?: string;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    verifySendGridWebhook(request, rawBody);

    const events = parseSendGridEvents(rawBody);

    const supabase = getSupabaseAdmin();
    const processed = [];

    for (const event of events) {
      if (!event.lead_id || !event.email_number) {
        continue;
      }

      const emailNumber = Number(event.email_number);
      const historyPatch = buildHistoryPatch(event);
      const queuePatch = buildQueuePatch(event);
      const providerMessageId = normalizeProviderMessageId(event.sg_message_id ?? event["smtp-id"]);
      let updatedRows = 0;

      if (historyPatch && isEmailNumber(emailNumber)) {
        const { data, error } = await supabase
          .from("outreach_history")
          .update(historyPatch)
          .eq("lead_id", event.lead_id)
          .eq("email_number", emailNumber)
          .select("*");

        if (error) {
          throw error;
        }

        updatedRows += data?.length ?? 0;
      }

      if (queuePatch) {
        let query = supabase.from("outreach_email_queue").update(queuePatch);
        query = providerMessageId
          ? query.eq("provider_message_id", providerMessageId)
          : query.eq("lead_id", event.lead_id);

        const { data, error } = await query.select("*");

        if (error) {
          throw error;
        }

        updatedRows += data?.length ?? 0;
      }

      await writeAuditLog({
        eventType: `sendgrid_${event.event ?? "event"}`,
        actorType: "system",
        actorId: "sendgrid_webhook",
        entityType: "outreach",
        entityId: event.lead_id,
        metadata: {
          event: event as unknown as Json,
          provider_message_id: providerMessageId,
          updated_rows: updatedRows
        }
      });

      processed.push({ event: event.event ?? "unknown", updated_rows: updatedRows });
    }

    return NextResponse.json({ processed: processed.length });
  } catch (error) {
    return handleRouteError(error);
  }
}

function buildHistoryPatch(event: SendGridEvent) {
  if (event.event === "open" || event.event === "click") {
    return { opened: true };
  }

  if (event.event === "reply") {
    return { replied: true, reply_snippet: event.response ?? event.reason ?? null };
  }

  return null;
}

function buildQueuePatch(event: SendGridEvent): { status: OutreachEmailStatus; last_error: string | null } | null {
  const detail = sendGridEventDetail(event);
  if (event.event === "delivered") {
    return { status: "sent", last_error: null };
  }

  if (event.event === "deferred") {
    return { status: "queued", last_error: detail };
  }

  if (event.event === "bounce" || event.event === "dropped" || event.event === "spamreport") {
    return { status: "failed", last_error: detail };
  }

  return null;
}

function sendGridEventDetail(event: SendGridEvent) {
  const reason = event.reason ?? event.response ?? "No provider detail supplied";
  return `sendgrid_${event.event ?? "event"}:${reason}`.slice(0, 500);
}

function normalizeProviderMessageId(value: string | undefined) {
  if (!value) return null;
  return value.replace(/[<>]/g, "").split(".")[0] ?? value;
}

function isEmailNumber(value: number): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

function verifySendGridWebhook(request: NextRequest, rawBody: string) {
  const publicKey = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY?.trim();
  if (!publicKey) {
    if (process.env.NODE_ENV === "production") {
      throw new ConfigurationError("SENDGRID_WEBHOOK_PUBLIC_KEY is required for SendGrid webhook verification");
    }
    return;
  }

  if (rawBody.length > 1024 * 1024) {
    throw new ValidationError("SendGrid webhook payload is too large");
  }

  const signature = request.headers.get("x-twilio-email-event-webhook-signature");
  const timestamp = request.headers.get("x-twilio-email-event-webhook-timestamp");
  if (!signature || !timestamp) {
    throw new ValidationError("Missing SendGrid webhook signature headers");
  }

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 10 * 60 * 1000) {
    throw new ValidationError("Stale SendGrid webhook signature timestamp");
  }

  const verifier = createVerify("sha256");
  verifier.update(timestamp + rawBody);
  verifier.end();

  if (!verifier.verify(normalizePublicKey(publicKey), signature, "base64")) {
    throw new ValidationError("Invalid SendGrid webhook signature");
  }
}

function normalizePublicKey(value: string) {
  if (value.includes("BEGIN PUBLIC KEY")) {
    return value.replace(/\\n/g, "\n");
  }

  const compact = value.replace(/\s+/g, "");
  const wrapped = compact.match(/.{1,64}/g)?.join("\n") ?? compact;
  return `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----`;
}

function parseSendGridEvents(rawBody: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new ValidationError("Invalid SendGrid webhook JSON");
  }

  if (!Array.isArray(parsed)) {
    throw new ValidationError("Invalid SendGrid webhook payload");
  }

  return parsed as SendGridEvent[];
}
