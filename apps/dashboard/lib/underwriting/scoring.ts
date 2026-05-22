import { logger } from '../logger';

export interface UnderwritingScoreInput {
  monthlyDeposits: number;
  monthlyRevenue?: number;
  requestedAmount: number;
  businessYears: number;
  ownerCredit?: number;
  nsfCount?: number;
  industryCode?: string;
  riskScore?: number;
}

/**
 * Calculate merchant qualification score (0-100) based on multiple factors
 */
export function calculateQualificationScore(input: UnderwritingScoreInput): number {
  let score = 0;
  const weights = {
    revenue: 0.3,
    creditWorthiness: 0.2,
    businessStability: 0.2,
    loanToValueRatio: 0.15,
    bankingBehavior: 0.15,
  };

  // Revenue score (0-30)
  const revenueScore = calculateRevenueScore(input.monthlyDeposits, input.monthlyRevenue);
  score += revenueScore * weights.revenue;

  // Credit worthiness score (0-20)
  const creditScore = calculateCreditWorthinessScore(input.ownerCredit, input.riskScore);
  score += creditScore * weights.creditWorthiness;

  // Business stability score (0-20)
  const stabilityScore = calculateBusinessStabilityScore(input.businessYears, input.industryCode);
  score += stabilityScore * weights.businessStability;

  // Loan-to-value ratio score (0-15)
  const ltvScore = calculateLoanToValueScore(input.requestedAmount, input.monthlyDeposits);
  score += ltvScore * weights.loanToValueRatio;

  // Banking behavior score (0-15)
  const bankingScore = calculateBankingBehaviorScore(input.nsfCount);
  score += bankingScore * weights.bankingBehavior;

  return Math.round(Math.max(0, Math.min(100, score)));
}

function calculateRevenueScore(monthlyDeposits: number, monthlyRevenue?: number): number {
  const effectiveRevenue = monthlyRevenue || monthlyDeposits;

  if (effectiveRevenue >= 50000) return 30;
  if (effectiveRevenue >= 30000) return 25;
  if (effectiveRevenue >= 15000) return 20;
  if (effectiveRevenue >= 5000) return 12;
  if (effectiveRevenue >= 2000) return 6;
  return 2;
}

function calculateCreditWorthinessScore(ownerCredit?: number, riskScore?: number): number {
  let score = 10;

  if (ownerCredit) {
    if (ownerCredit >= 750) score += 10;
    else if (ownerCredit >= 700) score += 8;
    else if (ownerCredit >= 650) score += 5;
    else if (ownerCredit >= 600) score += 2;
  }

  if (riskScore !== undefined) {
    if (riskScore < 30) score += 10;
    else if (riskScore < 50) score += 5;
  }

  return Math.min(20, score);
}

function calculateBusinessStabilityScore(businessYears: number, industryCode?: string): number {
  let score = 5;

  if (businessYears >= 5) score += 15;
  else if (businessYears >= 3) score += 12;
  else if (businessYears >= 1) score += 8;

  // Industry adjustment (some industries are higher risk)
  const riskIndustries = ['crypto', 'forex', 'gambling', 'adult'];
  if (industryCode && riskIndustries.some((r) => industryCode.toLowerCase().includes(r))) {
    score -= 5;
  }

  return Math.max(0, Math.min(20, score));
}

function calculateLoanToValueScore(requestedAmount: number, monthlyDeposits: number): number {
  if (monthlyDeposits === 0) return 0;

  const ltvRatio = requestedAmount / (monthlyDeposits * 12);

  if (ltvRatio <= 0.25) return 15;
  if (ltvRatio <= 0.5) return 12;
  if (ltvRatio <= 0.75) return 9;
  if (ltvRatio <= 1.0) return 6;
  if (ltvRatio <= 1.5) return 3;
  return 0;
}

function calculateBankingBehaviorScore(nsfCount?: number): number {
  if (nsfCount === undefined) return 10;

  if (nsfCount === 0) return 15;
  if (nsfCount <= 2) return 12;
  if (nsfCount <= 4) return 8;
  if (nsfCount <= 6) return 4;
  return 0;
}

export function determineLendingTier(qualificationScore: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (qualificationScore >= 85) return 'A';
  if (qualificationScore >= 70) return 'B';
  if (qualificationScore >= 55) return 'C';
  if (qualificationScore >= 40) return 'D';
  return 'F';
}

export function estimateApprovalProbability(
  qualificationScore: number,
  riskLevel: 'low' | 'medium' | 'high' | 'critical',
  compatibleLenderCount: number
): number {
  const scoreMultiplier = qualificationScore / 100;
  const riskMultiplier = {
    low: 1.0,
    medium: 0.85,
    high: 0.6,
    critical: 0.2,
  }[riskLevel];

  const lenderMultiplier = Math.min(0.5, compatibleLenderCount * 0.08);

  const baseApprovalProbability = scoreMultiplier * riskMultiplier + lenderMultiplier;

  return Math.min(0.95, Math.max(0.05, baseApprovalProbability));
}

/**
 * Estimate appropriate funding amount based on business metrics
 */
export function estimateFundingAmount(
  monthlyDeposits: number,
  monthlyRevenue?: number,
  requestedAmount?: number
): number {
  const effectiveRevenue = monthlyRevenue || monthlyDeposits;
  const maxRecommended = effectiveRevenue * 0.5;

  if (requestedAmount && requestedAmount <= maxRecommended) {
    return requestedAmount;
  }

  return Math.round(maxRecommended);
}

export interface LenderFitMetrics {
  qualificationScore: number;
  tier: 'A' | 'B' | 'C' | 'D' | 'F';
  approvalProbability: number;
  estimatedFundingAmount: number;
  recommendedLenderTypes: string[];
  needsManualReview: boolean;
  recommendedApproach: string;
}

/**
 * Calculate lender fit based on merchant qualification
 */
export function calculateLenderFitMetrics(input: UnderwritingScoreInput): LenderFitMetrics {
  const qualificationScore = calculateQualificationScore(input);
  const tier = determineLendingTier(qualificationScore);
  const approvalProbability = estimateApprovalProbability(
    qualificationScore,
    (input.riskScore ?? 50) > 70 ? 'high' : (input.riskScore ?? 50) > 50 ? 'medium' : 'low',
    3 // Default compatible lender estimate
  );
  const estimatedFundingAmount = estimateFundingAmount(
    input.monthlyDeposits,
    input.monthlyRevenue,
    input.requestedAmount
  );

  const recommendedLenderTypes: string[] = [];
  if (tier === 'A' || tier === 'B') {
    recommendedLenderTypes.push('Premium Lenders', 'Traditional MCA');
  } else if (tier === 'C') {
    recommendedLenderTypes.push('Mid-Tier MCA', 'Alternative Lenders');
  } else {
    recommendedLenderTypes.push('Hard Money Lenders', 'Specialized Lenders');
  }

  const needsManualReview = tier === 'D' || tier === 'F' || approvalProbability < 0.4;

  let recommendedApproach = '';
  if (tier === 'A') {
    recommendedApproach = 'Fast-track underwriting recommended. High approval probability.';
  } else if (tier === 'B') {
    recommendedApproach = 'Standard underwriting. Good approval probability.';
  } else if (tier === 'C') {
    recommendedApproach = 'Enhanced underwriting required. Moderate approval probability.';
  } else {
    recommendedApproach = 'Manual review and enhanced due diligence required.';
  }

  return {
    qualificationScore,
    tier,
    approvalProbability,
    estimatedFundingAmount,
    recommendedLenderTypes,
    needsManualReview,
    recommendedApproach,
  };
}

/**
 * Calculate industry risk adjustment
 */
export function calculateIndustryRiskAdjustment(industryCode?: string): number {
  const highRiskIndustries: Record<string, number> = {
    crypto: -0.25,
    forex: -0.25,
    gambling: -0.2,
    adult: -0.2,
    travel: -0.1,
    hospitality: -0.1,
    retail: 0,
    food: 0,
    tech: 0.1,
    professional: 0.1,
  };

  if (!industryCode) return 0;

  const normalizedCode = industryCode.toLowerCase();
  for (const [industry, adjustment] of Object.entries(highRiskIndustries)) {
    if (normalizedCode.includes(industry)) {
      return adjustment;
    }
  }

  return 0;
}

/**
 * Get underwriting recommendations based on profile
 */
export function getUnderwritingRecommendations(input: UnderwritingScoreInput): string[] {
  const recommendations: string[] = [];
  const metrics = calculateLenderFitMetrics(input);

  if (metrics.qualificationScore >= 80) {
    recommendations.push('Priority funding recommended');
  }

  if (input.nsfCount && input.nsfCount > 4) {
    recommendations.push('Investigate NSF pattern before funding');
  }

  if (input.businessYears < 1) {
    recommendations.push('New business - verify business legitimacy');
  }

  if (input.ownerCredit && input.ownerCredit < 600) {
    recommendations.push('Owner credit score below preferred threshold');
  }

  if (input.monthlyDeposits < 2000) {
    recommendations.push('Low monthly revenue - consider funding limits');
  }

  const industryAdjustment = calculateIndustryRiskAdjustment(input.industryCode);
  if (industryAdjustment < -0.1) {
    recommendations.push('High-risk industry - apply enhanced screening');
  }

  const ltvRatio = input.requestedAmount / (input.monthlyDeposits * 12);
  if (ltvRatio > 1.0) {
    recommendations.push('Loan-to-value ratio exceeds 1.0 - reduce requested amount');
  }

  return recommendations.length > 0 ? recommendations : ['Proceed with standard underwriting'];
}
