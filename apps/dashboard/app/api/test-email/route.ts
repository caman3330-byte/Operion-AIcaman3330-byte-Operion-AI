import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalUser } from "@/lib/auth";
import { getConfigurationStatus } from "@/lib/env";
import { handleRouteError } from "@/lib/errors";
import { sendTestEmail } from "@/lib/email/sendgrid";
import { renderOperationalTestEmail } from "@/lib/email/templates";

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
      "operational_summary"
    ])
    .optional(),
  templateKind: z
    .enum([
      "merchant_outreach",
      "merchant_support",
      "merchant_contact",
      "document_upload_request",
      "application_received",
      "underwriting_review",
      "additional_document_request",
      "approval_notification",
      "decline_notification",
      "application_status_update",
      "lender_outreach",
      "lender_onboarding",
      "lender_submission_package",
      "lender_package_summary",
      "deal_routing_notification",
      "funding_request_package",
      "internal_ai_alert",
      "operational_summary",
      "internal_support",
      "internal_system",
      "internal_submissions"
    ])
    .optional(),
  previewOnly: z.boolean().optional().default(false)
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireInternalUser(request);
    const payload = testEmailSchema.parse(await request.json());
    const templateKind = payload.templateKind;
    const template = templateKind ? renderOperationalTestEmail(templateKind) : null;
    const renderDiagnostics = template ? buildRenderDiagnostics(template.html) : null;
    if (payload.previewOnly && template && templateKind) {
      return NextResponse.json({
        data: {
          ok: true,
          delivery_state: "preview_only",
          requested_purpose: payload.purpose ?? inferPurposeFromTemplate(templateKind),
          template_kind: templateKind,
          subject: template.subject,
          html: template.html,
          text: template.text,
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

function inferPurposeFromTemplate(templateKind: NonNullable<z.infer<typeof testEmailSchema>["templateKind"]>) {
  if (templateKind.startsWith("lender_") || templateKind === "deal_routing_notification" || templateKind === "funding_request_package") {
    return "lender_submission_package" as const;
  }
  if (templateKind.startsWith("internal_")) {
    if (templateKind === "internal_system") return "operational_summary" as const;
    return "internal_ai_alert" as const;
  }
  if (templateKind === "document_upload_request" || templateKind === "additional_document_request") {
    return "document_upload_request" as const;
  }
  if (templateKind === "application_received") return "application_received" as const;
  if (templateKind === "application_status_update" || templateKind === "underwriting_review" || templateKind === "approval_notification" || templateKind === "decline_notification") {
    return "application_status_update" as const;
  }
  return "merchant_outreach" as const;
}

function buildRenderDiagnostics(html: string) {
  const lowerHtml = html.toLowerCase();
  return {
    html_bytes: new TextEncoder().encode(html).length,
    has_viewport_meta: lowerHtml.includes("name=\"viewport\""),
    has_hidden_preheader: lowerHtml.includes("display:none"),
    has_cta: lowerHtml.includes("<a ") && lowerHtml.includes("text-transform:uppercase"),
    has_security_footer: lowerHtml.includes("encrypted uploads") && lowerHtml.includes("support@operioncapital.com"),
    dark_inbox_ready: lowerHtml.includes("background:#050505") && lowerHtml.includes("color:#ffffff"),
    light_inbox_ready: lowerHtml.includes("background:#ffffff") && lowerHtml.includes("background:#f5f1e8")
  };
}
