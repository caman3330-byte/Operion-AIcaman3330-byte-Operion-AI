export interface EmailSection {
  label: string;
  value: string;
}

export interface EmailCta {
  label: string;
  url: string;
}

export interface OperionEmailInput {
  subject: string;
  preheader: string;
  title: string;
  intro: string[];
  bodyHtml?: string;
  sections?: EmailSection[];
  cta?: EmailCta;
  footerNote?: string;
  brand?: "capital" | "internal";
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export const operionEmailTemplateKinds = [
  "merchant_outreach",
  "merchant_follow_up_reminder",
  "merchant_outreach_sequence",
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
  "lender_partnership_outreach",
  "lender_onboarding",
  "lender_submission_package",
  "lender_package_summary",
  "deal_routing_notification",
  "funding_request_package",
  "iso_partnership_communication",
  "internal_ai_alert",
  "operational_summary",
  "internal_support",
  "internal_system",
  "internal_submissions",
  "internal_operations_notification"
] as const;

export type OperionEmailTemplateKind = (typeof operionEmailTemplateKinds)[number];

export const operionEmailTemplateCatalog: Record<OperionEmailTemplateKind, { label: string; brand: "capital" | "internal" }> = {
  merchant_outreach: { label: "Merchant outreach", brand: "capital" },
  merchant_follow_up_reminder: { label: "Merchant follow-up reminder", brand: "capital" },
  merchant_outreach_sequence: { label: "Merchant outreach sequence", brand: "capital" },
  merchant_support: { label: "Merchant support", brand: "capital" },
  merchant_contact: { label: "Merchant contact", brand: "capital" },
  document_upload_request: { label: "Document upload request", brand: "capital" },
  application_received: { label: "Application received", brand: "capital" },
  underwriting_review: { label: "Funding review update", brand: "capital" },
  additional_document_request: { label: "Additional document request", brand: "capital" },
  approval_notification: { label: "Lender review update", brand: "capital" },
  decline_notification: { label: "Decline notification", brand: "capital" },
  application_status_update: { label: "Application status update", brand: "capital" },
  lender_outreach: { label: "Lender outreach", brand: "capital" },
  lender_partnership_outreach: { label: "Lender partnership outreach", brand: "capital" },
  lender_onboarding: { label: "Lender onboarding", brand: "capital" },
  lender_submission_package: { label: "Lender submission package", brand: "capital" },
  lender_package_summary: { label: "Lender package summary", brand: "capital" },
  deal_routing_notification: { label: "Deal routing notification", brand: "capital" },
  funding_request_package: { label: "Funding request package", brand: "capital" },
  iso_partnership_communication: { label: "ISO partnership communication", brand: "capital" },
  internal_ai_alert: { label: "Internal AI alert", brand: "internal" },
  operational_summary: { label: "Operational summary", brand: "internal" },
  internal_support: { label: "Internal support notice", brand: "internal" },
  internal_system: { label: "Internal system notice", brand: "internal" },
  internal_submissions: { label: "Internal submissions notice", brand: "internal" },
  internal_operations_notification: { label: "Internal operations notification", brand: "internal" }
};

export function renderOperationalTestEmail(kind: OperionEmailTemplateKind): RenderedEmail {
  const sample = {
    businessName: "Atlas Harbor Logistics LLC",
    ownerName: "Jordan Rivera",
    lenderName: "NorthBridge Funding Desk",
    amount: "$185,000",
    uploadUrl: "https://operioncapital.com/portal/upload?token=preview",
    applicationUrl: "https://operioncapital.com/apply",
    internalUrl: "https://operioncapital.com/supervisor/testing"
  };

  const templates: Record<OperionEmailTemplateKind, OperionEmailInput> = {
    merchant_outreach: {
      subject: `Funding options for ${sample.businessName}`,
      preheader: "A private capital review is available for your business.",
      title: "Private capital review available",
      intro: [
        `Hi ${sample.ownerName},`,
        `${sample.businessName} appears to fit several working-capital programs in the Operion Capital network. Our team can prepare a private lender-ready profile without affecting your credit.`,
        "The review focuses on revenue consistency, requested use of funds, deposit activity, and speed-to-funding requirements."
      ],
      sections: [
        { label: "Estimated request", value: sample.amount },
        { label: "Primary product", value: "MCA / working capital" },
        { label: "Review status", value: "Available for intake" }
      ],
      cta: { label: "Start Funding Review", url: sample.applicationUrl },
      brand: "capital"
    },
    merchant_follow_up_reminder: {
      subject: `Next step for ${sample.businessName}`,
      preheader: "Your secure funding review can continue with a short document upload.",
      title: "A private review is ready to continue",
      intro: [
        `Hi ${sample.ownerName},`,
        `Operion Capital can continue the funding review for ${sample.businessName} once the requested files are uploaded through your private link.`,
        "The upload takes only a few minutes and keeps your file ready for lender matching."
      ],
      sections: [
        { label: "Requested amount", value: sample.amount },
        { label: "Next action", value: "Secure document upload" },
        { label: "Review type", value: "Private funding preparation" }
      ],
      cta: { label: "Upload Secure Documents", url: sample.uploadUrl },
      brand: "capital"
    },
    merchant_outreach_sequence: {
      subject: `${sample.businessName}: capital options without branch delays`,
      preheader: "A concise working-capital review from Operion Capital.",
      title: "Capital options for active businesses",
      intro: [
        `Hi ${sample.ownerName},`,
        "Operion Capital helps growth-focused businesses prepare lender-ready funding requests for working capital, equipment deposits, payroll gaps, and expansion needs.",
        "If timing matters, our review process is designed to be concise, secure, and focused on practical funding fit."
      ],
      sections: [
        { label: "Best fit", value: "MCA / working capital" },
        { label: "Credit impact", value: "Initial review does not require a hard credit pull" },
        { label: "Process", value: "Private review, document upload, lender matching" }
      ],
      cta: { label: "Start Private Review", url: sample.applicationUrl },
      brand: "capital"
    },
    merchant_support: {
      subject: "Operion Capital support follow-up",
      preheader: "A support update from Operion Capital.",
      title: "Support request update",
      intro: [
        `Hi ${sample.ownerName},`,
        "Our support desk reviewed your request and updated the internal application notes. No duplicate submission is required.",
        "Reply to this email with any corrected business details and our team will attach them to your active file."
      ],
      brand: "capital"
    },
    merchant_contact: {
      subject: "Operion Capital inquiry received",
      preheader: "We received your message.",
      title: "Your inquiry has been received",
      intro: [
        `Hi ${sample.ownerName},`,
        "Thank you for contacting Operion Capital. Your message has been routed to the appropriate operations desk for review.",
        "A team member will respond with the next step once your request is matched to the correct workflow."
      ],
      brand: "capital"
    },
    document_upload_request: {
      subject: `Secure document request for ${sample.businessName}`,
      preheader: "Upload recent business statements through a secure link.",
      title: "Secure statement upload requested",
      intro: [
        `Hi ${sample.ownerName},`,
        `To continue the funding review for ${sample.businessName}, please upload the requested statements through your private Operion Capital link.`,
        "The link is signed, time-limited, and tied to your application record."
      ],
      sections: [
        { label: "Required", value: "Latest business bank statements" },
        { label: "Optional", value: "Processing statements if processor volume applies" },
        { label: "Security", value: "Encrypted signed upload" },
        { label: "Application", value: sample.businessName }
      ],
      cta: { label: "Upload Statements", url: sample.uploadUrl },
      brand: "capital"
    },
    application_received: {
      subject: `Application received for ${sample.businessName}`,
      preheader: "Your funding request is now in the Operion Capital workflow.",
      title: "Funding request received",
      intro: [
        `Hi ${sample.ownerName},`,
        `Operion Capital received the funding request for ${sample.businessName}. Your file is ready for private funding analysis and lender matching preparation.`,
        "The fastest next step is to upload the requested files through your encrypted link."
      ],
      sections: [
        { label: "Requested amount", value: sample.amount },
        { label: "Current stage", value: "Intake received" },
        { label: "Next step", value: "Secure document upload" }
      ],
      cta: { label: "Upload Secure Documents", url: sample.uploadUrl },
      brand: "capital"
    },
    underwriting_review: {
      subject: `${sample.businessName} funding review update`,
      preheader: "Your application has moved into funding analysis.",
      title: "Funding review in progress",
      intro: [
        `Hi ${sample.ownerName},`,
        "Your application is now under private review by Operion Capital operations. We are validating funding fit, deposit activity, and lender routing options.",
        "If additional documents are needed, you will receive a secure upload request."
      ],
      sections: [
        { label: "Stage", value: "Funding analysis" },
        { label: "Review scope", value: "Revenue, deposits, business profile, lender criteria" }
      ],
      brand: "capital"
    },
    additional_document_request: {
      subject: `Additional documents needed for ${sample.businessName}`,
      preheader: "A few more documents are needed to continue review.",
      title: "Additional documents requested",
      intro: [
        `Hi ${sample.ownerName},`,
        "The review team needs a few additional documents before lender routing can continue.",
        "Please use the secure upload link so the documents attach directly to your application file."
      ],
      sections: [
        { label: "Needed", value: "Most recent business bank statement" },
        { label: "Optional", value: "Processing statement if available" },
        { label: "Priority", value: "Required before lender routing" }
      ],
      cta: { label: "Upload Requested Files", url: sample.uploadUrl },
      brand: "capital"
    },
    approval_notification: {
      subject: `Approved for lender review: ${sample.businessName}`,
      preheader: "Your file has been approved for lender routing review.",
      title: "Approved for lender review",
      intro: [
        `Hi ${sample.ownerName},`,
        `${sample.businessName} has been approved for lender routing based on the current funding package.`,
        "This is not a guarantee of funding. A funding specialist or lender partner may contact you directly to discuss next steps, documentation, timing, and available options."
      ],
      sections: [
        { label: "Requested amount", value: sample.amount },
        { label: "Status", value: "Approved for lender review" }
      ],
      brand: "capital"
    },
    decline_notification: {
      subject: `Funding review update for ${sample.businessName}`,
      preheader: "Your current application does not meet available lender criteria.",
      title: "Funding review decision",
      intro: [
        `Hi ${sample.ownerName},`,
        "After review, the current file does not meet available lender criteria for the requested funding structure.",
        "This decision is based on the present documentation and lender requirements. You may contact support if business conditions change."
      ],
      sections: [
        { label: "Status", value: "Declined for current request" },
        { label: "Support", value: "support@operioncapital.com" }
      ],
      brand: "capital"
    },
    application_status_update: {
      subject: `Application status update: ${sample.businessName}`,
      preheader: "Your Operion Capital application has a new status.",
      title: "Application status updated",
      intro: [
        `Hi ${sample.ownerName},`,
        "Your application status has changed. The operations team has recorded the latest review milestone in your file.",
        "If additional information is needed, Operion Capital will send a secure upload link or a funding specialist will contact you directly."
      ],
      sections: [{ label: "Current stage", value: "Lender routing" }],
      brand: "capital"
    },
    lender_outreach: {
      subject: `New funding opportunity: ${sample.businessName}`,
      preheader: "A matched business funding opportunity is available for review.",
      title: "Matched funding opportunity",
      intro: [
        `Hello ${sample.lenderName},`,
        `${sample.businessName} has been matched against your active funding criteria for review.`,
        "Please review the summary and advise whether your desk would like the full submission package."
      ],
      sections: [
        { label: "Requested amount", value: sample.amount },
        { label: "Industry", value: "Logistics" },
        { label: "State", value: "NY" }
      ],
      brand: "capital"
    },
    lender_partnership_outreach: {
      subject: "Operion Capital lender partnership introduction",
      preheader: "A private-capital lead flow partnership conversation.",
      title: "Lender partnership introduction",
      intro: [
        `Hello ${sample.lenderName},`,
        "Operion Capital is building a disciplined funding submission network for high-intent MCA and working-capital files.",
        "Our focus is clean intake, secure document handling, fast lender routing, and transparent relationship management across sectors like trucking, construction, restaurants, and healthcare."
      ],
      sections: [
        { label: "Lead flow", value: "High-intent merchant applications" },
        { label: "Submission style", value: "Structured packages with document status" },
        { label: "Relationship", value: "Broker and lender desk coordination" }
      ],
      brand: "capital"
    },
    lender_onboarding: {
      subject: "Operion Capital lender onboarding",
      preheader: "Your lender profile is ready for operational setup.",
      title: "Lender onboarding next step",
      intro: [
        `Hello ${sample.lenderName},`,
        "Operion Capital is preparing your lender profile for matched business funding submissions.",
        "Please confirm criteria, submission preferences, and operational contacts for routing."
      ],
      brand: "capital"
    },
    lender_submission_package: {
      subject: `Submission package: ${sample.businessName}`,
      preheader: "A lender-ready package has been routed for review.",
      title: "Lender submission package",
      intro: [
        `Hello ${sample.lenderName},`,
        "Operion Capital has routed a lender-ready package for review. The package includes the intake summary, requested amount, funding purpose, and document status.",
        "Please respond with approval, counteroffer, or decline instructions."
      ],
      sections: [
        { label: "Business", value: sample.businessName },
        { label: "Requested amount", value: sample.amount },
        { label: "Package status", value: "Ready for lender review" }
      ],
      brand: "capital"
    },
    lender_package_summary: {
      subject: `Package summary: ${sample.businessName}`,
      preheader: "Summary metrics for lender review.",
      title: "Funding package summary",
      intro: [
        `Hello ${sample.lenderName},`,
        "Below is the concise funding package summary for your underwriting desk.",
        "The full document package remains available through approved internal submission channels."
      ],
      sections: [
        { label: "Monthly deposits", value: "$92,000" },
        { label: "Average balance", value: "$24,000" },
        { label: "Use of funds", value: "Equipment deposits and working capital" }
      ],
      brand: "capital"
    },
    deal_routing_notification: {
      subject: `Deal routed: ${sample.businessName}`,
      preheader: "A matched deal has been routed to your queue.",
      title: "Deal routing notification",
      intro: [
        `Hello ${sample.lenderName},`,
        `${sample.businessName} has been routed to your funding desk based on active criteria alignment.`,
        "Please confirm acceptance window and any additional documentation requirements."
      ],
      sections: [
        { label: "Routing reason", value: "Revenue band, state, industry, product fit" },
        { label: "Routing status", value: "Submitted for desk review" }
      ],
      brand: "capital"
    },
    funding_request_package: {
      subject: `Funding request package: ${sample.businessName}`,
      preheader: "Funding request package ready for lender action.",
      title: "Funding request package",
      intro: [
        `Hello ${sample.lenderName},`,
        "Operion Capital is sending a structured funding request package for lender action.",
        "Please return decision, requested stipulations, and any offer terms through the approved submission channel."
      ],
      sections: [
        { label: "Requested amount", value: sample.amount },
        { label: "Decision needed", value: "Approval, stipulations, counteroffer, or decline" }
      ],
      brand: "capital"
    },
    iso_partnership_communication: {
      subject: "Operion Capital ISO partnership communication",
      preheader: "A controlled ISO partnership workflow for funding submissions.",
      title: "ISO partnership workflow",
      intro: [
        `Hello ${sample.lenderName},`,
        "Operion Capital is validating ISO and lender communication workflows before controlled live operations begin.",
        "The production workflow is designed around verified sender routing, document readiness, secure package handling, and clear response tracking."
      ],
      sections: [
        { label: "Workflow", value: "Lead intake, review, lender routing, response tracking" },
        { label: "Priority sectors", value: "Trucking, construction, restaurants, healthcare clinics" },
        { label: "Operating mode", value: "Controlled launch readiness testing" }
      ],
      brand: "capital"
    },
    internal_ai_alert: {
      subject: "AI execution alert: underwriting workflow",
      preheader: "An operational AI workflow requires review.",
      title: "AI workflow alert",
      intro: [
        "An underwriting workflow completed with a review flag that requires an authorized operator decision.",
        "Inspect the execution payload, retry state, and linked application before taking action."
      ],
      sections: [
        { label: "Queue", value: "Underwriting AI" },
        { label: "Status", value: "Needs operator review" }
      ],
      cta: { label: "Open Supervisor Console", url: sample.internalUrl },
      brand: "internal"
    },
    operational_summary: {
      subject: "Operion Capital operational summary",
      preheader: "Queue, delivery, upload, and AI execution summary.",
      title: "Operational summary",
      intro: [
        "The production operations dashboard has generated a current readiness summary.",
        "Review queue health, lender routing, upload lifecycle, email delivery, and AI execution state before the next simulation cycle."
      ],
      sections: [
        { label: "Queue health", value: "Nominal" },
        { label: "Email delivery", value: "Accepted by provider" },
        { label: "Upload lifecycle", value: "Signed links active" }
      ],
      cta: { label: "Open Testing Dashboard", url: sample.internalUrl },
      brand: "internal"
    },
    internal_support: {
      subject: "Support queue alert",
      preheader: "A merchant support case needs internal attention.",
      title: "Support queue alert",
      intro: [
        "A merchant support case has been tagged for operational review.",
        "Check application context, latest email thread, and document status before responding."
      ],
      brand: "internal"
    },
    internal_system: {
      subject: "System operations notice",
      preheader: "A system-level operational event was recorded.",
      title: "System operations notice",
      intro: [
        "A monitored production subsystem recorded an operational event.",
        "Review diagnostics, retry visibility, and response payloads before closing the event."
      ],
      brand: "internal"
    },
    internal_submissions: {
      subject: "Submissions desk alert",
      preheader: "A lender submission package needs review.",
      title: "Submissions desk alert",
      intro: [
        "A lender submission package is ready for internal review before external delivery.",
        "Confirm package completeness, document status, routing rationale, and lender contact details."
      ],
      brand: "internal"
    },
    internal_operations_notification: {
      subject: "Operations notification: simulation cycle",
      preheader: "A controlled operational simulation cycle completed.",
      title: "Operations notification",
      intro: [
        "A controlled simulation cycle has completed for merchant, lender, internal email, workflow, and queue visibility checks.",
        "Review delivery results, route protection, sender identity, and linked workflow traces before advancing to live outreach."
      ],
      sections: [
        { label: "Mode", value: "Controlled simulation" },
        { label: "Inbox", value: "atsgamers.99@gmail.com" },
        { label: "Scope", value: "Email delivery, templates, routing, dashboard diagnostics" }
      ],
      cta: { label: "Open Testing Dashboard", url: sample.internalUrl },
      brand: "internal"
    }
  };

  return renderOperionEmail(templates[kind]);
}

export function renderOperionEmail(input: OperionEmailInput): RenderedEmail {
  const brandName = "Operion Capital";
  const brandLine = "Private Capital Access";
  const accent = "#d7b76a";
  const sections = input.sections ?? [];

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="margin:0;background:#f5f1e8;padding:0;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">
      ${escapeHtml(input.preheader)}
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f1e8;margin:0;padding:38px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #e6dcc5;border-radius:0;overflow:hidden;box-shadow:0 24px 70px rgba(5,5,5,0.14);">
            <tr>
              <td align="center" style="background:#050505;padding:40px 34px 38px;color:#ffffff;background-image:linear-gradient(135deg,#030303 0%,#0b0906 58%,#211a0d 100%);">
                ${renderEmailLogo(brandName, brandLine)}
                <h1 style="margin:30px auto 0;max-width:520px;font-family:Georgia,'Times New Roman',serif;font-size:31px;line-height:1.18;font-weight:500;letter-spacing:0;color:#ffffff;text-align:center;">
                  ${escapeHtml(input.title)}
                </h1>
                <div style="margin:22px auto 0;height:1px;width:180px;background:linear-gradient(90deg,rgba(215,183,106,0),rgba(215,183,106,.85),rgba(215,183,106,0));"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:38px 42px 14px;">
                ${input.intro.map((paragraph) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#27302c;">${escapeHtml(paragraph)}</p>`).join("")}
                ${input.bodyHtml ? renderBodyHtml(input.bodyHtml) : ""}
                ${renderSections(sections)}
                ${input.cta ? renderCta(input.cta, accent) : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:26px 42px 38px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:22px;border:1px solid #eadfca;border-radius:0;overflow:hidden;">
                  <tr>
                    <td align="center" style="padding:14px;background:#fbf8f1;font-size:11px;line-height:1.5;color:#665637;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Encrypted uploads</td>
                    <td align="center" style="padding:14px;background:#fbf8f1;font-size:11px;line-height:1.5;color:#665637;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Private review</td>
                    <td align="center" style="padding:14px;background:#fbf8f1;font-size:11px;line-height:1.5;color:#665637;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Lender matching</td>
                  </tr>
                </table>
                <div style="border-top:1px solid #eadfca;padding-top:18px;font-size:12px;line-height:1.7;color:#6f6757;">
                  ${escapeHtml(input.footerNote ?? defaultFooter(input.brand))}
                  <br />
                  Support: <a href="mailto:support@operioncapital.com" style="color:#8a6a22;text-decoration:none;font-weight:700;">support@operioncapital.com</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    brandName,
    input.title,
    "",
    ...input.intro,
    sections.length > 0 ? "" : null,
    ...sections.map((section) => `${section.label}: ${section.value}`),
    input.cta ? "" : null,
    input.cta ? `${input.cta.label}: ${input.cta.url}` : null,
    "",
    input.footerNote ?? defaultFooter(input.brand)
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    subject: input.subject,
    html,
    text
  };
}

export function renderParagraphEmail(input: {
  subject: string;
  preheader: string;
  title: string;
  text: string;
  brand?: "capital" | "internal";
}) {
  return renderOperionEmail({
    subject: input.subject,
    preheader: input.preheader,
    title: input.title,
    intro: input.text
      .trim()
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean),
    ...(input.brand ? { brand: input.brand } : {})
  });
}

function renderSections(sections: EmailSection[]) {
  if (sections.length === 0) {
    return "";
  }

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0;border:1px solid #eadfca;border-radius:0;overflow:hidden;">
    ${sections
      .map(
        (section) => `<tr>
          <td style="width:42%;padding:13px 16px;background:#fbf8f1;border-bottom:1px solid #eadfca;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#71613f;font-weight:700;">
            ${escapeHtml(section.label)}
          </td>
          <td style="padding:13px 16px;border-bottom:1px solid #eadfca;font-size:14px;color:#15130f;font-weight:600;">
            ${escapeHtml(section.value)}
          </td>
        </tr>`
      )
      .join("")}
  </table>`;
}

function renderBodyHtml(bodyHtml: string) {
  return `<div style="margin:24px 0 0;padding:20px 20px;border:1px solid #eadfca;border-radius:0;background:#fbf8f1;color:#27302c;font-size:14px;line-height:1.65;">
    ${bodyHtml}
  </div>`;
}

function renderEmailLogo(brandName: string, brandLine: string) {
  void brandName;
  void brandLine;
  return `<table role="presentation" cellspacing="0" cellpadding="0" align="center">
    <tr>
      <td align="center">
        <div style="height:80px;width:80px;border-radius:18px;background:#090704;border:1px solid rgba(201,168,76,0.7);text-align:center;overflow:hidden;">
          <div style="padding-top:10px;font-family:Georgia,'Times New Roman',serif;font-size:44px;line-height:1;color:#C9A84C;letter-spacing:-4px;padding-left:4px;">OC</div>
        </div>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding-top:20px;">
        <div style="font-size:22px;color:#ffffff;font-weight:700;letter-spacing:0.3em;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;">OPERION</div>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding-top:10px;">
        <table role="presentation" cellspacing="0" cellpadding="0" align="center">
          <tr>
            <td style="width:48px;height:1px;background:#C9A84C;opacity:.8;"></td>
            <td style="padding:0 12px;font-size:11px;color:#C9A84C;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;white-space:nowrap;font-family:Arial,Helvetica,sans-serif;">CAPITAL</td>
            <td style="width:48px;height:1px;background:#C9A84C;opacity:.8;"></td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function renderCta(cta: EmailCta, accent: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:32px auto 12px;">
    <tr>
      <td>
        <a href="${escapeHtml(cta.url)}" style="display:inline-block;background:${accent};color:#070604;text-decoration:none;border-radius:4px;padding:14px 24px;font-size:13px;font-weight:800;border:1px solid #b9974b;box-shadow:0 12px 24px rgba(183,151,75,0.22);letter-spacing:.08em;text-transform:uppercase;">
          ${escapeHtml(cta.label)}
        </a>
      </td>
    </tr>
  </table>`;
}

function defaultFooter(brand: OperionEmailInput["brand"]) {
  return brand === "internal"
    ? "This internal operations notice is intended for authorized Operion Capital staff only. Operational data should remain inside approved systems."
    : "Operion Capital provides secure business funding preparation and lender matching support. Funding options are subject to documentation review, funding analysis, and lender approval.";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
