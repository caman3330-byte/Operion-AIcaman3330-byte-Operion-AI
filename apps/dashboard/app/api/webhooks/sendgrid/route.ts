import { NextRequest, NextResponse } from "next/server";
import type { Json } from "@operion/shared";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface SendGridEvent {
  event?: string;
  lead_id?: string;
  email_number?: string;
  response?: string;
  reason?: string;
}

export async function POST(request: NextRequest) {
  try {
    const events = (await request.json()) as SendGridEvent[];
    const supabase = getSupabaseAdmin();
    const processed = [];

    for (const event of events) {
      if (!event.lead_id || !event.email_number) {
        continue;
      }

      const emailNumber = Number(event.email_number);
      const patch =
        event.event === "open"
          ? { opened: true }
          : event.event === "reply"
            ? { replied: true, reply_snippet: event.response ?? event.reason ?? null }
            : null;

      if (!patch || !isEmailNumber(emailNumber)) {
        continue;
      }

      const { data, error } = await supabase
        .from("outreach_history")
        .update(patch)
        .eq("lead_id", event.lead_id)
        .eq("email_number", emailNumber)
        .select("*");

      if (error) {
        throw error;
      }

      await writeAuditLog({
        eventType: "outreach_sent",
        actorType: "system",
        actorId: "sendgrid_webhook",
        entityType: "outreach",
        entityId: event.lead_id,
        metadata: { event: event as unknown as Json }
      });

      processed.push(...(data ?? []));
    }

    return NextResponse.json({ processed: processed.length });
  } catch (error) {
    return handleRouteError(error);
  }
}

function isEmailNumber(value: number): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}
