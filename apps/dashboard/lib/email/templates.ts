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

export type OperionEmailTemplateKind =
  | "merchant_outreach"
  | "merchant_support"
  | "merchant_contact"
  | "document_upload_request"
  | "application_received"
  | "application_status_update"
  | "lender_outreach"
  | "lender_onboarding"
  | "lender_submission_package"
  | "internal_ai_alert"
  | "operational_summary";

export const operionEmailTemplateCatalog: Record<OperionEmailTemplateKind, { label: string; brand: "capital" | "internal" }> = {
  merchant_outreach: { label: "Merchant outreach", brand: "capital" },
  merchant_support: { label: "Merchant support", brand: "capital" },
  merchant_contact: { label: "Merchant contact", brand: "capital" },
  document_upload_request: { label: "Document upload request", brand: "capital" },
  application_received: { label: "Application received", brand: "capital" },
  application_status_update: { label: "Application status update", brand: "capital" },
  lender_outreach: { label: "Lender outreach", brand: "capital" },
  lender_onboarding: { label: "Lender onboarding", brand: "capital" },
  lender_submission_package: { label: "Lender submission package", brand: "capital" },
  internal_ai_alert: { label: "Internal AI alert", brand: "internal" },
  operational_summary: { label: "Operational summary", brand: "internal" }
};

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
  return `<table role="presentation" cellspacing="0" cellpadding="0" align="center">
    <tr>
      <td align="center">
        <div style="height:64px;width:64px;border-radius:16px;background:#050505;border:1px solid #d7b76a;text-align:center;line-height:62px;color:#d7b76a;font-size:28px;font-weight:500;font-family:Georgia,'Times New Roman',serif;box-shadow:0 0 0 1px rgba(255,255,255,.06) inset;">
          OC
        </div>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding-top:22px;">
        <div style="font-size:22px;color:#ffffff;font-weight:500;letter-spacing:0.26em;font-family:Georgia,'Times New Roman',serif;text-transform:uppercase;">
          ${escapeHtml(brandName)}
        </div>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding-top:11px;">
        <table role="presentation" cellspacing="0" cellpadding="0" align="center">
          <tr>
            <td style="width:54px;height:1px;background:#d7b76a;opacity:.8;"></td>
            <td style="padding:0 14px;font-size:11px;color:#d7b76a;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;white-space:nowrap;">
              ${escapeHtml(brandLine)}
            </td>
            <td style="width:54px;height:1px;background:#d7b76a;opacity:.8;"></td>
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
