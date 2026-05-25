import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalUser } from "@/lib/auth";
import {
  buildOperationalEmailPreview,
  CONTROLLED_EMAIL_SIMULATION_INBOX,
  fullEmailSimulationTemplateKinds,
  inferPurposeFromTemplate
} from "@/lib/email/operational-testing";
import { sendTestEmail } from "@/lib/email/sendgrid";
import { operionEmailTemplateKinds, type OperionEmailTemplateKind } from "@/lib/email/templates";
import { handleRouteError } from "@/lib/errors";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const emailSimulationSchema = z.object({
  to: z.string().email().optional().default(CONTROLLED_EMAIL_SIMULATION_INBOX),
  templateKinds: z.array(z.enum(operionEmailTemplateKinds)).min(1).max(30).optional(),
  previewOnly: z.boolean().optional().default(false),
  forceControlledInbox: z.boolean().optional().default(true)
});

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit({ key: rateLimitKey(request, "operations_email_simulation"), limit: 3, windowMs: 60_000 });
    const actor = await requireInternalUser(request);
    const payload = emailSimulationSchema.parse(await request.json());
    const recipient = payload.forceControlledInbox ? CONTROLLED_EMAIL_SIMULATION_INBOX : payload.to;
    const templateKinds = payload.templateKinds?.length
      ? payload.templateKinds
      : [...fullEmailSimulationTemplateKinds];

    const results = [];
    for (const templateKind of templateKinds) {
      const preview = buildOperationalEmailPreview(templateKind);
      if (payload.previewOnly) {
        results.push({
          ok: true,
          status: 200,
          delivery_state: "preview_only",
          recipient,
          requested_purpose: preview.requested_purpose,
          template_kind: templateKind,
          subject: preview.subject,
          render_diagnostics: preview.render_diagnostics,
          sender: null,
          message_id: null,
          timestamp: new Date().toISOString()
        });
        continue;
      }

      const result = await sendTestEmail({
        to: recipient,
        subject: preview.subject,
        text: preview.text,
        purpose: inferPurposeFromTemplate(templateKind),
        templateKind,
        operation: "controlled_email_simulation",
        customArgs: {
          email_type: "controlled_simulation",
          simulation_mode: "controlled",
          controlled_test_inbox: CONTROLLED_EMAIL_SIMULATION_INBOX,
          template_kind: templateKind
        }
      });

      results.push({
        ok: result.ok,
        status: result.status,
        delivery_state: result.ok ? "accepted_by_sendgrid" : "failed_before_acceptance",
        recipient,
        requested_purpose: preview.requested_purpose,
        template_kind: templateKind,
        subject: preview.subject,
        render_diagnostics: preview.render_diagnostics,
        sender: result.sender ?? null,
        message_id: result.messageId ?? null,
        error: result.error ?? null,
        timestamp: result.timestamp ?? new Date().toISOString()
      });
    }

    const accepted = results.filter((result) => result.ok).length;
    const failed = results.length - accepted;
    const ok = failed === 0;

    return NextResponse.json(
      {
        ...(ok
          ? {}
          : {
              error:
                "Controlled email simulation could not complete delivery. Verify SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, and verified sender routing in the active runtime."
            }),
        data: {
          ok,
          simulation_mode: payload.previewOnly ? "email_preview_only" : "controlled_email_delivery",
          controlled_inbox: recipient,
          force_controlled_inbox: payload.forceControlledInbox,
          total: results.length,
          accepted,
          failed,
          results,
          actor: {
            role: actor.role,
            email: actor.email
          },
          timestamp: new Date().toISOString()
        }
      },
      { status: ok ? 200 : 502 }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export type EmailSimulationResult = {
  template_kind: OperionEmailTemplateKind;
  ok: boolean;
  delivery_state: string;
};
