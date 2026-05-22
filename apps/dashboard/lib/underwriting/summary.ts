import type { RoutingMatch } from "../lenders/routing";
import {
  analyzeDepositPatterns,
  analyzeRevenue,
  analyzeTransferRisk,
  calculateRiskTier,
  estimateApprovalProbability,
  scoreNsfRisk
} from "./analysis";
import type { ApprovalBand, UnderwritingProfile, UnderwritingSummaryResult } from "./types";

export function generateUnderwritingFoundationSummary(
  profile: UnderwritingProfile,
  compatibleLenders: RoutingMatch[] = []
): UnderwritingSummaryResult {
  const revenue = analyzeRevenue(profile);
  const nsf = scoreNsfRisk(profile.bankPeriods);
  const deposits = analyzeDepositPatterns(profile.bankPeriods);
  const transfers = analyzeTransferRisk(profile.bankPeriods);
  const creditScore = creditRangeToScore(profile.creditScoreRange, profile.creditScore);
  const timeScore = Math.min(100, ((profile.timeInBusinessMonths ?? 24) / 36) * 100);
  const requestRatio = profile.requestedAmount / Math.max(1, revenue.averageMonthlyDeposits);
  const affordabilityScore = Math.max(0, 100 - Math.max(0, requestRatio - 0.8) * 35);

  const qualificationScore = Math.round(
    revenue.revenueScore * 0.28 +
    nsf.score * 0.18 +
    deposits.consistencyScore * 0.16 +
    transfers.score * 0.12 +
    creditScore * 0.16 +
    timeScore * 0.1 +
    affordabilityScore * 0.1
  );
  const riskTier = calculateRiskTier((qualificationScore + nsf.score + deposits.consistencyScore + transfers.score) / 4);
  const approvalProbability = estimateApprovalProbability({
    qualificationScore,
    riskTier,
    compatibleLenderCount: compatibleLenders.length,
    requestedAmount: profile.requestedAmount,
    averageMonthlyDeposits: revenue.averageMonthlyDeposits
  });

  const strengths = [
    revenue.trend === "increasing" ? "Revenue trend is increasing." : undefined,
    nsf.nsfCount === 0 ? "No NSF activity detected in supplied bank periods." : undefined,
    compatibleLenders.length > 2 ? "Multiple lender paths are available." : undefined
  ].filter((item): item is string => Boolean(item));

  const risks = [
    revenue.trend === "declining" ? "Revenue trend is declining." : undefined,
    revenue.trend === "volatile" ? "Revenue deposits are volatile." : undefined,
    nsf.nsfCount > 2 ? "NSF activity requires review." : undefined,
    ...deposits.flags,
    ...transfers.flags
  ].filter((item): item is string => Boolean(item));

  const recommendedFundingAmount = Math.round(
    Math.min(profile.requestedAmount, revenue.averageMonthlyDeposits * (riskTier === "low" ? 1.25 : riskTier === "medium" ? 0.9 : 0.55))
  );

  return {
    qualificationScore,
    riskTier,
    approvalProbability,
    approvalBand: approvalBand(approvalProbability, riskTier),
    revenue,
    nsf,
    deposits,
    transfers,
    recommendedFundingAmount,
    strengths,
    risks,
    summary: `${profile.businessName} scores ${qualificationScore}/100 with ${riskTier} risk and ${(approvalProbability * 100).toFixed(0)}% estimated approval probability.`
  };
}

export function scoreLenderCompatibility(
  profile: UnderwritingProfile,
  lender: {
    statesServed?: string[];
    industriesServed?: string[];
    fundingLimitMin: number;
    fundingLimitMax: number;
    minFicoScore: number;
  }
): number {
  const stateScore = !profile.state || !lender.statesServed?.length || lender.statesServed.includes(profile.state) ? 25 : 0;
  const industryScore = !lender.industriesServed?.length || lender.industriesServed.some((industry) =>
    profile.industry.toLowerCase().includes(industry.toLowerCase())
  ) ? 25 : 0;
  const amountScore = profile.requestedAmount >= lender.fundingLimitMin && profile.requestedAmount <= lender.fundingLimitMax ? 25 : 0;
  const fico = creditRangeToScore(profile.creditScoreRange, profile.creditScore);
  const ficoScore = fico >= lender.minFicoScore ? 25 : Math.max(0, 25 - (lender.minFicoScore - fico) / 8);
  return Math.round(Math.max(0, Math.min(100, stateScore + industryScore + amountScore + ficoScore)));
}

function approvalBand(probability: number, riskTier: string): ApprovalBand {
  if (riskTier === "critical" || probability < 0.35) return "manual_review";
  if (probability >= 0.75) return "strong";
  if (probability >= 0.52) return "moderate";
  return "weak";
}

function creditRangeToScore(range?: string, explicitScore?: number) {
  if (explicitScore) return explicitScore;
  switch (range) {
    case "700_plus":
      return 720;
    case "650_699":
      return 675;
    case "600_649":
      return 625;
    case "550_599":
      return 575;
    case "under_550":
      return 525;
    default:
      return 620;
  }
}
