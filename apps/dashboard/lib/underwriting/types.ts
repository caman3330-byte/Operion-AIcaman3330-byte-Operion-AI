export type RiskTier = "low" | "medium" | "high" | "critical";
export type RevenueTrend = "increasing" | "stable" | "declining" | "volatile" | "insufficient_data";
export type ApprovalBand = "strong" | "moderate" | "weak" | "manual_review";

export interface MonthlyBankPeriod {
  period: string;
  deposits: number;
  withdrawals?: number;
  nsfCount?: number;
  averageDailyBalance?: number;
  transferInCount?: number;
  transferOutCount?: number;
}

export interface UnderwritingProfile {
  businessName: string;
  industry: string;
  state?: string;
  requestedAmount: number;
  monthlyDeposits: number;
  monthlyRevenue?: number;
  creditScore?: number;
  creditScoreRange?: string;
  timeInBusinessMonths?: number;
  bankPeriods?: MonthlyBankPeriod[];
  existingAdvanceBalance?: number;
}

export interface RevenueAnalysis {
  averageMonthlyDeposits: number;
  latestMonthlyDeposits: number;
  trend: RevenueTrend;
  volatilityRatio: number;
  revenueScore: number;
}

export interface NsfRiskScore {
  nsfCount: number;
  nsfRatePerMonth: number;
  score: number;
  tier: RiskTier;
}

export interface DepositPatternAnalysis {
  consistencyScore: number;
  concentrationRisk: RiskTier;
  averageDailyBalance?: number;
  flags: string[];
}

export interface TransferRiskAnalysis {
  transferIntensity: number;
  score: number;
  tier: RiskTier;
  flags: string[];
}

export interface UnderwritingSummaryResult {
  qualificationScore: number;
  riskTier: RiskTier;
  approvalProbability: number;
  approvalBand: ApprovalBand;
  revenue: RevenueAnalysis;
  nsf: NsfRiskScore;
  deposits: DepositPatternAnalysis;
  transfers: TransferRiskAnalysis;
  recommendedFundingAmount: number;
  strengths: string[];
  risks: string[];
  summary: string;
}
