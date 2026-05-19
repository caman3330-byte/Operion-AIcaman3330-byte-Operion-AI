import type { Json, LeadTier } from "@operion/shared";

const industryRiskMap: Record<string, number> = {
  "restaurants": 75,
  "hospitality": 80,
  "construction": 70,
  "transportation": 65,
  "healthcare": 55,
  "retail": 60,
  "ecommerce": 50,
  "manufacturing": 65,
  "professional_services": 40,
  "technology": 35,
  "other": 60
};

export interface FallbackQualificationInput {
  businessName?: string;
  industry: string;
  requestedAmount: number;
  monthlyDeposits: number;
  creditScoreRange: string;
  annualRevenue?: number | null | undefined;
  monthlyRevenue?: number | null | undefined;
  fundingPurpose?: string | null | undefined;
  businessApplicationId?: string | null | undefined;
  leadId?: string | null | undefined;
}

export interface FallbackQualificationResult {
  score: number;
  tier: LeadTier;
  decision: "qualified" | "needs_review" | "declined";
  reason: string;
  industry_risk: "low" | "medium" | "high";
  funding_fit: "strong" | "moderate" | "weak";
  underwriting_summary: string;
  internal_notes: string;
  lender_recommendations: string[];
}

export function calculateFallbackQualification(input: FallbackQualificationInput): FallbackQualificationResult {
  const normalizedIndustry = String(input.industry ?? "other").toLowerCase().replace(/\s+/g, "_");
  const industryPenalty = industryRiskMap[normalizedIndustry] ?? 60;
  const creditScoreValue = mapCreditScoreRangeToPoints(input.creditScoreRange);
  const revenueScore = Math.min(100, Math.round((input.monthlyDeposits / Math.max(1, input.requestedAmount)) * 80 + 20));
  const riskScore = Math.max(0, Math.min(100, 100 - industryPenalty + Math.round((creditScoreValue - 50) / 2)));
  const rawScore = Math.max(0, Math.min(100, Math.round((creditScoreValue * 0.4 + revenueScore * 0.35 + riskScore * 0.25))));

  const tier = selectTier(rawScore);
  const decision = rawScore >= 70 ? "qualified" : rawScore >= 50 ? "needs_review" : "declined";
  const industryRisk = rawScore >= 70 ? "low" : rawScore >= 50 ? "medium" : "high";
  const fundingFit = rawScore >= 75 ? "strong" : rawScore >= 55 ? "moderate" : "weak";
  const requestSummary = `Requested $${input.requestedAmount.toLocaleString()} against ${input.monthlyDeposits.toLocaleString()} in monthly deposits.`;

  const underwritingSummary = [`Operion fallback underwriting indicates a ${fundingFit} funding fit.`, requestSummary].join(" ");
  const internalNotes = [`Industry risk based on '${input.industry || "unknown"}'`, `Credit score range: ${input.creditScoreRange}`, `Fallback score: ${rawScore}`].join("; ");
  const lenderRecommendations = generateLenderRecommendations(rawScore, industryRisk, input.industry);

  return {
    score: rawScore,
    tier,
    decision,
    reason: `Fallback qualification generated when live AI was unavailable. Use this as a supervisor review signal, not a final approval.`,
    industry_risk: industryRisk,
    funding_fit: fundingFit,
    underwriting_summary: underwritingSummary,
    internal_notes: internalNotes,
    lender_recommendations: lenderRecommendations
  };
}

function mapCreditScoreRangeToPoints(range: string) {
  switch (String(range).toLowerCase()) {
    case "700_plus":
      return 90;
    case "650_699":
      return 75;
    case "600_649":
      return 60;
    case "550_599":
      return 45;
    case "under_550":
      return 30;
    default:
      return 50;
  }
}

function selectTier(score: number): LeadTier {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}

function generateLenderRecommendations(score: number, risk: string, industry: string) {
  const recommendations: string[] = [];
  if (score >= 80) {
    recommendations.push("Prioritize high-confidence funded lenders with flexible repayment terms.");
  } else if (score >= 60) {
    recommendations.push("Recommend conservative lenders with proven cashflow underwriting.");
  } else {
    recommendations.push("Route to specialist underwriters for manual review and supervision.");
  }

  if (risk === "high") {
    recommendations.push("Preserve evidence for risk review and require senior approval.");
  }

  if (industry) {
    recommendations.push(`Consider lenders familiar with ${industry} commerce.`);
  }

  return recommendations.slice(0, 3);
}
