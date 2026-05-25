import type { OperionEmailPurpose } from "@/lib/email/senders";
import {
  renderOperationalTestEmail,
  type OperionEmailTemplateKind,
  type RenderedEmail
} from "@/lib/email/templates";

export const CONTROLLED_EMAIL_SIMULATION_INBOX = "atsgamers.99@gmail.com";

export const fullEmailSimulationTemplateKinds = [
  "application_received",
  "document_upload_request",
  "additional_document_request",
  "underwriting_review",
  "approval_notification",
  "decline_notification",
  "merchant_follow_up_reminder",
  "merchant_outreach",
  "merchant_outreach_sequence",
  "lender_partnership_outreach",
  "lender_outreach",
  "lender_submission_package",
  "lender_package_summary",
  "deal_routing_notification",
  "funding_request_package",
  "iso_partnership_communication",
  "internal_ai_alert",
  "internal_support",
  "internal_system",
  "internal_submissions",
  "internal_operations_notification",
  "operational_summary"
] as const satisfies readonly OperionEmailTemplateKind[];

export interface OperationalEmailPreview {
  template_kind: OperionEmailTemplateKind;
  requested_purpose: OperionEmailPurpose;
  subject: string;
  html: string;
  text: string;
  render_diagnostics: ReturnType<typeof buildRenderDiagnostics>;
}

export function buildOperationalEmailPreview(templateKind: OperionEmailTemplateKind): OperationalEmailPreview {
  const template = renderOperationalTestEmail(templateKind);

  return {
    template_kind: templateKind,
    requested_purpose: inferPurposeFromTemplate(templateKind),
    subject: template.subject,
    html: template.html,
    text: template.text,
    render_diagnostics: buildRenderDiagnostics(template.html)
  };
}

export function inferPurposeFromTemplate(templateKind: OperionEmailTemplateKind): OperionEmailPurpose {
  if (
    templateKind.startsWith("lender_") ||
    templateKind === "deal_routing_notification" ||
    templateKind === "funding_request_package" ||
    templateKind === "iso_partnership_communication"
  ) {
    if (templateKind === "lender_partnership_outreach" || templateKind === "lender_onboarding" || templateKind === "iso_partnership_communication") {
      return "lender_onboarding";
    }
    if (templateKind === "lender_outreach") return "lender_outreach";
    return "lender_submission_package";
  }
  if (templateKind.startsWith("internal_")) {
    if (templateKind === "internal_system") return "operational_summary";
    if (templateKind === "internal_operations_notification") return "internal_operations";
    return "internal_ai_alert";
  }
  if (templateKind === "operational_summary") return "operational_summary";
  if (templateKind === "document_upload_request" || templateKind === "additional_document_request") {
    return "document_upload_request";
  }
  if (templateKind === "application_received") return "application_received";
  if (
    templateKind === "application_status_update" ||
    templateKind === "underwriting_review" ||
    templateKind === "approval_notification" ||
    templateKind === "decline_notification" ||
    templateKind === "merchant_follow_up_reminder"
  ) {
    return "application_status_update";
  }
  if (templateKind === "merchant_support") return "merchant_support";
  if (templateKind === "merchant_contact") return "merchant_contact";
  return "merchant_outreach";
}

export function buildRenderDiagnostics(html: RenderedEmail["html"]) {
  const lowerHtml = html.toLowerCase();
  return {
    html_bytes: new TextEncoder().encode(html).length,
    has_viewport_meta: lowerHtml.includes("name=\"viewport\""),
    has_hidden_preheader: lowerHtml.includes("display:none"),
    has_cta: lowerHtml.includes("<a ") && lowerHtml.includes("text-transform:uppercase"),
    has_security_footer: lowerHtml.includes("encrypted uploads") && lowerHtml.includes("support@operioncapital.com"),
    dark_inbox_ready: lowerHtml.includes("background:#050505") && lowerHtml.includes("color:#ffffff"),
    light_inbox_ready: lowerHtml.includes("background:#ffffff") && lowerHtml.includes("background:#f5f1e8"),
    controlled_simulation_safe: !lowerHtml.includes("mass outreach") && !lowerHtml.includes("automated real lead acquisition")
  };
}
