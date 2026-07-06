import { getSupabaseAdmin } from '../supabase/server';
import { logger } from '../logger';

export interface LenderProfile {
  id: string;
  companyName: string;
  fundingLimitMin: number;
  fundingLimitMax: number;
  minFicoScore: number;
  minMonthlyRevenue: number;
  minMonthlyDeposits: number;
  minMonthsInBusiness: number;
  statesServed: string[];
  industriesServed: string[];
  fundingProducts: string[];
  positionTypes: string[];
  termRange: [number, number];
  rateRange: [number, number];
  approvalRate: number;
  fundingSpeed: 'fast' | 'standard' | 'slow';
  active: boolean;
}

export interface RoutingMatch {
  lenderId: string;
  lenderName: string;
  compatibilityScore: number;
  stateMatch: boolean;
  industryMatch: boolean;
  fundingLimitMatch: boolean;
  ficoMinimumMatch: boolean;
  monthlyRevenueMatch: boolean;
  timeInBusinessMatch: boolean;
  positionMatch: boolean;
  estimatedApprovalRate: number;
  estimatedTerms: {
    minTerm: number;
    maxTerm: number;
    estimatedRate: number;
  };
  routingConfidence: number;
}

/**
 * Load all active lenders
 */
export async function loadActiveLenders(): Promise<{ lenders: LenderProfile[]; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();

    const { data, error } = await supabase
      .from('lenders')
      .select('*')
      .eq('active', true)
      .eq('approval_status', 'approved')
      .eq('lender_status', 'active')
      .order('company_name');

    if (error) {
      logger.error('Failed to load lenders', { error: error.message });
      return { lenders: [], error: error.message };
    }

    const lenders: LenderProfile[] = (data || []).map((row: any) => ({
      id: row.id,
      companyName: row.company_name,
      fundingLimitMin: Number(row.funding_range_min ?? row.min_funding_limit ?? 2500),
      fundingLimitMax: Number(row.max_funding ?? row.funding_range_max ?? row.max_funding_limit ?? 250000),
      minFicoScore: Number(row.min_fico ?? row.min_fico_score ?? 0),
      minMonthlyRevenue: Number(row.min_monthly_revenue ?? 0),
      minMonthlyDeposits: Number(row.minimum_monthly_deposits ?? 0),
      minMonthsInBusiness: Number(row.minimum_time_in_business_months ?? row.min_months_in_business ?? 0),
      statesServed: row.states_served || [],
      industriesServed: row.industries_served || [],
      fundingProducts: row.funding_products || [],
      positionTypes: row.position_types || [],
      termRange: [row.min_term || 3, row.max_term || 60],
      rateRange: [row.min_rate || 1.2, row.max_rate || 3.0],
      approvalRate: row.approval_rate || 0.65,
      fundingSpeed: row.funding_speed || 'standard',
      active: row.active !== false,
    }));

    return { lenders };
  } catch (error) {
    logger.error('Exception loading lenders', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { lenders: [], error: 'Internal error' };
  }
}

/**
 * Check if lender serves merchant's state
 */
function checkStateRestriction(lender: LenderProfile, merchantState: string): boolean {
  if (lender.statesServed.length === 0) return true; // No restriction
  return lender.statesServed.includes(merchantState);
}

/**
 * Check if lender serves merchant's industry
 */
function checkIndustryRestriction(lender: LenderProfile, merchantIndustry: string): boolean {
  if (lender.industriesServed.length === 0) return true; // No restriction

  const normalizedIndustry = merchantIndustry.toLowerCase();
  return lender.industriesServed.some((ind) => normalizedIndustry.includes(ind.toLowerCase()));
}

/**
 * Check funding limit compatibility
 */
function checkFundingLimit(lender: LenderProfile, requestedAmount: number): boolean {
  return requestedAmount >= lender.fundingLimitMin && requestedAmount <= lender.fundingLimitMax;
}

/**
 * Check FICO minimum
 */
function checkFicoRequirement(lender: LenderProfile, merchantCredit?: number): boolean {
  if (!lender.minFicoScore) return true;
  if (!merchantCredit) return true; // Founder confirmation may still be required.
  return merchantCredit >= lender.minFicoScore;
}

function checkMonthlyRevenueRequirement(lender: LenderProfile, merchantMonthlyRevenue?: number, merchantMonthlyDeposits?: number): boolean {
  const minimum = Math.max(lender.minMonthlyRevenue, lender.minMonthlyDeposits);
  if (!minimum) return true;
  const observed = Math.max(merchantMonthlyRevenue ?? 0, merchantMonthlyDeposits ?? 0);
  return observed >= minimum;
}

function checkTimeInBusinessRequirement(lender: LenderProfile, merchantMonths?: number): boolean {
  if (!lender.minMonthsInBusiness) return true;
  return (merchantMonths ?? 0) >= lender.minMonthsInBusiness;
}

/**
 * Calculate lender routing match score
 */
export function calculateRoutingMatch(
  lender: LenderProfile,
  merchant: {
    state: string;
    industry: string;
    requestedAmount: number;
    creditScore?: number;
    riskScore?: number;
    monthlyRevenue?: number;
    monthlyDeposits?: number;
    timeInBusinessMonths?: number;
  }
): RoutingMatch {
  const stateMatch = checkStateRestriction(lender, merchant.state);
  const industryMatch = checkIndustryRestriction(lender, merchant.industry);
  const fundingLimitMatch = checkFundingLimit(lender, merchant.requestedAmount);
  const ficoMinimumMatch = checkFicoRequirement(lender, merchant.creditScore);
  const monthlyRevenueMatch = checkMonthlyRevenueRequirement(lender, merchant.monthlyRevenue, merchant.monthlyDeposits);
  const timeInBusinessMatch = checkTimeInBusinessRequirement(lender, merchant.timeInBusinessMonths);

  // Position match (placeholder - would need actual merchant position data)
  const positionMatch = true;

  // Calculate base score
  let score = 0;
  if (stateMatch) score += 15;
  if (industryMatch) score += 15;
  if (fundingLimitMatch) score += 20;
  if (ficoMinimumMatch) score += 15;
  if (monthlyRevenueMatch) score += 15;
  if (timeInBusinessMatch) score += 10;
  if (positionMatch) score += 10;

  // Risk-based adjustment
  if (merchant.riskScore !== undefined) {
    if (merchant.riskScore < 30) score += 10;
    else if (merchant.riskScore < 60) score += 5;
    else if (merchant.riskScore > 75) score -= 10;
  }

  const compatibilityScore = Math.max(0, Math.min(100, score));

  // Estimate approval rate based on lender and merchant profile
  let estimatedApprovalRate = lender.approvalRate;
  if (!stateMatch || !industryMatch || !fundingLimitMatch || !ficoMinimumMatch || !monthlyRevenueMatch || !timeInBusinessMatch) {
    estimatedApprovalRate *= 0.5; // Reduce if restrictions not met
  }

  return {
    lenderId: lender.id,
    lenderName: lender.companyName,
    compatibilityScore,
    stateMatch,
    industryMatch,
    fundingLimitMatch,
    ficoMinimumMatch,
    monthlyRevenueMatch,
    timeInBusinessMatch,
    positionMatch,
    estimatedApprovalRate,
    estimatedTerms: {
      minTerm: lender.termRange[0],
      maxTerm: lender.termRange[1],
      estimatedRate: (lender.rateRange[0] + lender.rateRange[1]) / 2,
    },
    routingConfidence: compatibilityScore > 60 ? compatibilityScore / 100 : 0.3,
  };
}

/**
 * Route merchant application to compatible lenders
 */
export async function routeToLenders(input: {
  merchant: {
    state: string;
    industry: string;
    requestedAmount: number;
    creditScore?: number;
    riskScore?: number;
    monthlyRevenue?: number;
    monthlyDeposits?: number;
    timeInBusinessMonths?: number;
  };
  minCompatibilityScore?: number;
  maxMatches?: number;
}): Promise<{ matches: RoutingMatch[]; error?: string }> {
  try {
    const { lenders, error: loadError } = await loadActiveLenders();

    if (loadError) {
      return { matches: [], error: loadError };
    }

    const matches = lenders
      .map((lender) => calculateRoutingMatch(lender, input.merchant))
      .filter((match) => match.compatibilityScore >= (input.minCompatibilityScore || 40))
      .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
      .slice(0, input.maxMatches || 5);

    logger.info('Routing matches generated', {
      merchantState: input.merchant.state,
      matchCount: matches.length,
    });

    return { matches };
  } catch (error) {
    logger.error('Exception routing to lenders', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { matches: [], error: 'Internal error' };
  }
}

/**
 * Update lender performance metrics
 */
export async function updateLenderPerformance(
  lenderId: string,
  metrics: {
    approvalsThisMonth: number;
    submissionsThisMonth: number;
    averageFundingTime?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const approvalRate = metrics.submissionsThisMonth > 0 ? metrics.approvalsThisMonth / metrics.submissionsThisMonth : 0;

    logger.warn('Lender performance metrics are not persisted by the current lenders schema', {
      lenderId,
      approvalRate,
      approvalsThisMonth: metrics.approvalsThisMonth,
      submissionsThisMonth: metrics.submissionsThisMonth,
      averageFundingTime: metrics.averageFundingTime,
    });
    return { success: false, error: 'Lender performance persistence is not supported by the current schema' };
  } catch (error) {
    logger.error('Exception updating lender performance', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Get state restrictions summary
 */
export async function getStateRestrictions(): Promise<Record<string, string[]>> {
  try {
    const { lenders } = await loadActiveLenders();

    const restrictions: Record<string, string[]> = {};

    for (const lender of lenders) {
      for (const state of lender.statesServed) {
        if (!restrictions[state]) {
          restrictions[state] = [];
        }
        restrictions[state].push(lender.companyName);
      }
    }

    return restrictions;
  } catch (error) {
    logger.error('Exception getting state restrictions', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

export * from './distribution';
