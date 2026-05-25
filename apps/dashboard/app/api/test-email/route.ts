import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalUser } from "@/lib/auth";
import { getConfigurationStatus } from "@/lib/env";
import { handleRouteError } from "@/lib/errors";
import { sendTestEmail } from "@/lib/email/sendgrid";
import {
  buildOperationalEmailPreview,
  buildRenderDiagnostics,
  inferPurposeFromTemplate
} from "@/lib/email/operational-testing";
import { operionEmailTemplateKinds } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

const testEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(240).optional().default("Operion Capital test message"),
  text: z.string().min(1).max(8000),
  purpose: z
    .enum([
      "merchant_outreach",
      "merchant_support",
      "merchant_contact",
      "document_upload_request",
      "application_received",
      "application_status_update",
      "lender_outreach",
      "lender_onboarding",
      "lender_submission_package",
      "internal_ai_alert",
      "operational_summary",
      "internal_operations"
    ])
    .optional(),
  templateKind: z.enum(operionEmailTemplateKinds).optional(),
  previewOnly: z.boolean().optional().default(false)
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireInternalUser(request);
    const payload = testEmailSchema.parse(await request.json());
    const templateKind = payload.templateKind;
    const preview = templateKind ? buildOperationalEmailPreview(templateKind) : null;
    const renderDiagnostics = preview ? preview.render_diagnostics : null;
    if (payload.previewOnly && preview && templateKind) {
      return NextResponse.json({
        data: {
          ok: true,
          delivery_state: "preview_only",
          requested_purpose: payload.purpose ?? inferPurposeFromTemplate(templateKind),
          template_kind: templateKind,
          subject: preview.subject,
          html: preview.html,
          text: preview.text,
          render_diagnostics: renderDiagnostics,
          actor: {
            role: actor.role,
            email: actor.email
          },
          timestamp: new Date().toISOString()
        }
      });
    }

    const emailPayload: Parameters<typeof sendTestEmail>[0] = {
      to: payload.to,
      subject: payload.subject,
      text: payload.text
    };
    if (templateKind) {
      emailPayload.templateKind = templateKind;
    }
    const inferredPurpose = payload.purpose ?? (templateKind ? inferPurposeFromTemplate(templateKind) : undefined);
    if (inferredPurpose) {
      emailPayload.purpose = inferredPurpose;
    }
    const result = await sendTestEmail(emailPayload);

    if (!result.ok) {
      return NextResponse.json(
        {
          error: "SendGrid sending failed. Verify SENDGRID_API_KEY, sender authentication, and role sender routing.",
          status: result.status,
          data: buildDebugPayload({
            result,
            actor,
            purpose: emailPayload.purpose ?? "internal_ai_alert",
            ...(templateKind ? { templateKind } : {}),
            renderDiagnostics
          })
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      data: buildDebugPayload({
        result,
        actor,
        purpose: emailPayload.purpose ?? "internal_ai_alert",
        ...(templateKind ? { templateKind } : {}),
        renderDiagnostics
      })
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

function buildDebugPayload(input: {
  result: Awaited<ReturnType<typeof sendTestEmail>>;
  actor: Awaited<ReturnType<typeof requireInternalUser>>;
  purpose: NonNullable<z.infer<typeof testEmailSchema>["purpose"]>;
  templateKind?: z.infer<typeof testEmailSchema>["templateKind"];
  renderDiagnostics?: ReturnType<typeof buildRenderDiagnostics> | null;
}) {
  const config = getConfigurationStatus();
  return {
    ok: input.result.ok,
    status: input.result.status,
    provider: input.result.provider ?? "sendgrid",
    operation: input.result.operation ?? "test_email",
    message_id: input.result.messageId ?? null,
    error: input.result.error ?? null,
    delivery_state: input.result.ok ? "accepted_by_sendgrid" : "failed_before_acceptance",
    sender: input.result.sender ?? null,
    requested_purpose: input.purpose,
    template_kind: input.templateKind ?? null,
    render_diagnostics: input.renderDiagnostics ?? null,
    actor: {
      role: input.actor.role,
      email: input.actor.email
    },
    environment: {
      sendgrid_configured: config.sendgrid,
      auth_configured: config.auth,
      source: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"
    },
    timestamp: input.result.timestamp ?? new Date().toISOString()
  };
}
