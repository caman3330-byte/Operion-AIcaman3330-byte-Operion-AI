export type OperionEmailPurpose =
  | "merchant_outreach"
  | "merchant_support"
  | "document_upload_request"
  | "application_received"
  | "application_status_update"
  | "lender_outreach"
  | "lender_onboarding"
  | "lender_submission_package"
  | "internal_ai_alert"
  | "operational_summary";

export interface OperionEmailSender {
  email: string;
  name: string;
  replyTo?: string;
}

const senderCatalog: Record<
  OperionEmailPurpose,
  {
    envKey: string;
    localPart: string;
    name: string;
    replyToLocalPart?: string;
  }
> = {
  merchant_outreach: {
    envKey: "FUNDING",
    localPart: "funding",
    name: "Operion Capital Funding",
    replyToLocalPart: "funding"
  },
  merchant_support: {
    envKey: "SUPPORT",
    localPart: "support",
    name: "Operion Capital Support",
    replyToLocalPart: "support"
  },
  document_upload_request: {
    envKey: "FUNDING",
    localPart: "funding",
    name: "Operion Capital Funding",
    replyToLocalPart: "support"
  },
  application_received: {
    envKey: "FUNDING",
    localPart: "funding",
    name: "Operion Capital Funding",
    replyToLocalPart: "funding"
  },
  application_status_update: {
    envKey: "FUNDING",
    localPart: "funding",
    name: "Operion Capital Funding",
    replyToLocalPart: "support"
  },
  lender_outreach: {
    envKey: "LENDERS",
    localPart: "lenders",
    name: "Operion Capital Lender Relations",
    replyToLocalPart: "lenders"
  },
  lender_onboarding: {
    envKey: "PARTNERS",
    localPart: "partners",
    name: "Operion Capital Partnerships",
    replyToLocalPart: "partners"
  },
  lender_submission_package: {
    envKey: "SUBMISSIONS",
    localPart: "submissions",
    name: "Operion Capital Submissions",
    replyToLocalPart: "submissions"
  },
  internal_ai_alert: {
    envKey: "ALERTS",
    localPart: "alerts",
    name: "Operion AI Alerts",
    replyToLocalPart: "admin"
  },
  operational_summary: {
    envKey: "SYSTEM",
    localPart: "system",
    name: "Operion AI System",
    replyToLocalPart: "admin"
  }
};

export function resolveOperionSender(purpose: OperionEmailPurpose, fallbackEmail?: string | null): OperionEmailSender {
  const config = senderCatalog[purpose];
  const domain = process.env.OPERION_EMAIL_DOMAIN?.trim() || "operioncapital.com";
  const envEmail = process.env[`OPERION_EMAIL_${config.envKey}`]?.trim();
  const email = envEmail || `${config.localPart}@${domain}` || fallbackEmail || "funding@operioncapital.com";
  const replyTo = config.replyToLocalPart ? `${config.replyToLocalPart}@${domain}` : undefined;

  return replyTo
    ? {
        email,
        name: config.name,
        replyTo
      }
    : {
        email,
        name: config.name
      };
}

export function inferEmailPurposeFromOperation(operation: string): OperionEmailPurpose {
  if (operation.includes("lender_package")) return "lender_submission_package";
  if (operation.includes("lender")) return "lender_outreach";
  if (operation.includes("merchant_confirmation")) return "application_received";
  if (operation.includes("document")) return "document_upload_request";
  if (operation.includes("test") || operation.includes("alert")) return "internal_ai_alert";
  if (operation.includes("summary") || operation.includes("report")) return "operational_summary";
  return "merchant_outreach";
}

export function getEmailSenderCatalog() {
  return senderCatalog;
}
