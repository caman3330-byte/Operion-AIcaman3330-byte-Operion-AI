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

export function renderOperionEmail(input: OperionEmailInput): RenderedEmail {
  const brandName = input.brand === "internal" ? "Operion Internal Operations" : "Operion Capital";
  const accent = "#34d399";
  const sections = input.sections ?? [];

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="margin:0;background:#f4f7f6;padding:0;font-family:Arial,Helvetica,sans-serif;color:#0b1220;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">
      ${escapeHtml(input.preheader)}
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7f6;margin:0;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #dfe7e4;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="background:#07110f;padding:28px 32px;color:#ffffff;">
                <div style="font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:${accent};font-weight:700;">
                  ${escapeHtml(brandName)}
                </div>
                <h1 style="margin:18px 0 0;font-size:28px;line-height:1.15;font-weight:700;letter-spacing:0;color:#ffffff;">
                  ${escapeHtml(input.title)}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 32px 10px;">
                ${input.intro.map((paragraph) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#26342f;">${escapeHtml(paragraph)}</p>`).join("")}
                ${renderSections(sections)}
                ${input.cta ? renderCta(input.cta, accent) : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 30px;">
                <div style="border-top:1px solid #e4ece8;padding-top:18px;font-size:12px;line-height:1.6;color:#66736f;">
                  ${escapeHtml(input.footerNote ?? defaultFooter(input.brand))}
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

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;border:1px solid #e4ece8;border-radius:14px;overflow:hidden;">
    ${sections
      .map(
        (section) => `<tr>
          <td style="width:42%;padding:13px 16px;background:#f7faf8;border-bottom:1px solid #e4ece8;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#65736e;font-weight:700;">
            ${escapeHtml(section.label)}
          </td>
          <td style="padding:13px 16px;border-bottom:1px solid #e4ece8;font-size:14px;color:#12221d;font-weight:600;">
            ${escapeHtml(section.value)}
          </td>
        </tr>`
      )
      .join("")}
  </table>`;
}

function renderCta(cta: EmailCta, accent: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0 10px;">
    <tr>
      <td>
        <a href="${escapeHtml(cta.url)}" style="display:inline-block;background:${accent};color:#03110d;text-decoration:none;border-radius:999px;padding:12px 18px;font-size:14px;font-weight:700;">
          ${escapeHtml(cta.label)}
        </a>
      </td>
    </tr>
  </table>`;
}

function defaultFooter(brand: OperionEmailInput["brand"]) {
  return brand === "internal"
    ? "This internal operations notice is intended for authorized Operion AI staff only."
    : "Operion Capital provides AI-assisted business funding operations and lender matching support. Funding decisions are subject to underwriting and lender approval.";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
