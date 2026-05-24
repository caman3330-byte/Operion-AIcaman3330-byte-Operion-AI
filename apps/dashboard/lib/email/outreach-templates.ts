import { renderOperionEmail, type RenderedEmail } from "@/lib/email/templates";

export function renderMerchantOutreachEmail(input: {
  businessName?: string | null;
  contactName?: string | null;
  industry?: string | null;
  ctaUrl?: string | null;
  bodyHtml?: string | null;
}): RenderedEmail {
  const business = input.businessName ?? "your business";
  const industryLine = input.industry ? ` We work with operators in ${input.industry} and related service businesses.` : "";

  return renderOperionEmail({
    subject: "A cleaner path to business funding options",
    preheader: "Operion Capital helps businesses prepare lender-ready funding profiles.",
    title: "Business funding, prepared with precision",
    intro: [
      `Hi ${input.contactName ?? "there"},`,
      `Operion Capital helps business owners prepare clean funding profiles for MCA and working-capital options.${industryLine}`,
      `If ${business} is reviewing capital for expansion, payroll, inventory, equipment, or cash-flow timing, our process is designed to be fast, secure, and lender-ready.`
    ],
    ...(input.bodyHtml ? { bodyHtml: input.bodyHtml } : {}),
    sections: [
      { label: "Focus", value: "MCA and business funding readiness" },
      { label: "Process", value: "Secure intake, document review, lender matching" },
      { label: "Experience", value: "Concierge-style funding preparation" }
    ],
    cta: {
      label: "Review Funding Options",
      url: input.ctaUrl ?? "https://operioncapital.com/apply"
    },
    footerNote:
      "Operion Capital provides secure business funding preparation and lender matching support. This message is informational and does not guarantee funding approval, terms, or offers.",
    brand: "capital"
  });
}

export function renderLenderPartnershipEmail(input: {
  lenderName?: string | null;
  ctaUrl?: string | null;
}): RenderedEmail {
  return renderOperionEmail({
    subject: "Operion Capital lender partnership introduction",
    preheader: "High-intent MCA and business funding submissions prepared for lender review.",
    title: "High-intent business funding submissions",
    intro: [
      `Hi ${input.lenderName ?? "there"},`,
      "Operion Capital is building a controlled lender network for MCA and business funding submissions across trucking, construction, restaurants, retail, logistics, and similar revenue-generating categories.",
      "Our goal is to route cleaner files, stronger business context, and documented merchant intent so lender partners can respond faster as volume scales."
    ],
    sections: [
      { label: "Submission quality", value: "Structured merchant profile and document readiness" },
      { label: "Lead intent", value: "Application-driven funding requests" },
      { label: "Growth plan", value: "Daily lead flow with measured routing controls" }
    ],
    cta: {
      label: "Discuss Partnership",
      url: input.ctaUrl ?? "mailto:lenders@operioncapital.com"
    },
    footerNote:
      "Operion Capital coordinates lender matching and business funding submissions. Partner relationships are reviewed privately by the operations team.",
    brand: "capital"
  });
}
