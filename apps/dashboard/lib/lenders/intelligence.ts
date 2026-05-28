import type { Json } from "@operion/shared";

export type LenderDiscoveryInput = {
  company_name: string;
  website_url?: string | null | undefined;
  contact_email?: string | null | undefined;
  contact_page_url?: string | null | undefined;
  broker_program_url?: string | null | undefined;
  funding_products?: string[] | null | undefined;
  funding_range_min?: number | null | undefined;
  funding_range_max?: number | null | undefined;
  industries_served?: string[] | null | undefined;
  states_served?: string[] | null | undefined;
  minimum_requirements?: Json | undefined;
  public_contact_methods?: Json | undefined;
  min_monthly_revenue?: number | null | undefined;
  min_months_in_business?: number | null | undefined;
  min_fico?: number | null | undefined;
  max_funding?: number | null | undefined;
  industry_restrictions?: string[] | null | undefined;
  state_restrictions?: string[] | null | undefined;
};

export function buildLenderIntelligenceProfile(input: LenderDiscoveryInput) {
  const products = input.funding_products?.filter(Boolean) ?? [];
  const industries = input.industries_served?.filter(Boolean) ?? [];
  const states = input.states_served?.filter(Boolean) ?? [];
  const hasBrokerProgram = Boolean(input.broker_program_url);
  const hasPublicContact = Boolean(input.contact_email || input.contact_page_url);
  const hasCriteria = Boolean(input.min_monthly_revenue || input.min_months_in_business || input.min_fico || input.max_funding);
  const maxFunding = input.max_funding ?? input.funding_range_max ?? null;
  const score =
    (input.website_url ? 15 : 0) +
    (hasPublicContact ? 15 : 0) +
    (hasBrokerProgram ? 20 : 0) +
    (products.length > 0 ? 15 : 0) +
    (industries.length > 0 ? 10 : 0) +
    (states.length > 0 ? 10 : 0) +
    (hasCriteria ? 15 : 0);
  const lenderTier = score >= 75 ? "A" : score >= 45 ? "B" : "C";
  const riskLevel = score >= 75 ? "low" : score >= 45 ? "medium" : "high";
  const estimatedResponsiveness = hasBrokerProgram && hasPublicContact ? "high" : hasPublicContact ? "medium" : "unknown";
  const fundingRange = formatFundingRange(input.funding_range_min, input.funding_range_max ?? maxFunding);

  return {
    intelligence_summary:
      `${input.company_name} is a discovered funding partner candidate` +
      `${products.length > 0 ? ` offering ${products.join(", ")}` : ""}` +
      `${fundingRange ? ` with public funding range ${fundingRange}` : ""}.`,
    funding_criteria_summary:
      `Criteria signals: ${[
        input.min_monthly_revenue ? `min monthly revenue ${formatCurrency(input.min_monthly_revenue)}` : null,
        input.min_months_in_business ? `${input.min_months_in_business}+ months in business` : null,
        input.min_fico ? `min FICO ${input.min_fico}` : null,
        maxFunding ? `max funding ${formatCurrency(maxFunding)}` : null
      ].filter(Boolean).join("; ") || "public criteria not fully captured"}.`,
    target_merchant_profile:
      `${industries.length > 0 ? industries.join(", ") : "General business funding"} merchants` +
      `${states.length > 0 ? ` in ${states.join(", ")}` : ""}` +
      `${products.length > 0 ? ` seeking ${products.join(", ")}` : ""}.`,
    risk_level: riskLevel,
    estimated_responsiveness: estimatedResponsiveness,
    intelligence_notes:
      "Founder review required before outreach activation. Public-source lender intelligence only; no login-restricted data used.",
    lender_tier: lenderTier as "A" | "B" | "C",
    acquisition_stage: "Enriched" as const,
    approval_status: "pending_review" as const,
    last_intelligence_update_at: new Date().toISOString(),
    outreach_drafts: buildOutreachDrafts(input) as Json
  };
}

export function buildOutreachDrafts(input: LenderDiscoveryInput) {
  const company = input.company_name;
  return [
    {
      type: "intro_email",
      status: "draft",
      subject: "Operion Capital broker partnership introduction",
      body:
        `Hello ${company} team,\n\n` +
        "Operion Capital is building a founder-supervised business funding platform focused on clean merchant intake, document readiness, underwriting review, and lender-fit routing.\n\n" +
        "We are reviewing MCA and business funding partners for approved broker/ISO relationships. If your team is open to broker partnerships, we would like to confirm program fit, merchant criteria, submission process, and preferred contact path.\n\n" +
        "Best,\nOperion Capital",
      requires_approval: true,
      created_at: new Date().toISOString()
    },
    {
      type: "follow_up_email",
      status: "draft",
      subject: "Following up on Operion Capital partnership review",
      body:
        `Hello ${company} team,\n\n` +
        "Following up on our broker partnership review. We are organizing lender criteria before routing any merchant files and would appreciate the right contact for ISO onboarding or partnership review.\n\n" +
        "No merchant package will be sent without internal founder approval.\n\nBest,\nOperion Capital",
      requires_approval: true,
      created_at: new Date().toISOString()
    }
  ];
}

function formatFundingRange(min?: number | null, max?: number | null) {
  if (min && max) return `${formatCurrency(min)} - ${formatCurrency(max)}`;
  if (max) return `up to ${formatCurrency(max)}`;
  if (min) return `from ${formatCurrency(min)}`;
  return null;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
