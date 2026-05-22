import { getSupabaseAdmin } from '../supabase/server';
import { logger } from '../logger';

export interface LenderProfile {
  id: string;
  companyName: string;
  fundingLimitMin: number;
  fundingLimitMax: number;
  minFicoScore: number;
  statesServed: string[];
  industriesServed: string[];
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
      .order('company_name');

    if (error) {
      logger.error('Failed to load lenders', { error: error.message });
      return { lenders: [], error: error.message };
    }

    const lenders: LenderProfile[] = (data || []).map((row: any) => ({
      id: row.id,
      companyName: row.company_name,
      fundingLimitMin: row.min_funding_limit || 2500,
      fundingLimitMax: row.max_funding_limit || 250000,
      minFicoScore: row.min_fico_score || 500,
      statesServed: row.states_served || [],
      industriesServed: row.industries_served || [],
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
  if (!merchantCredit) return true; // Assume acceptable if not provided
  return merchantCredit >= lender.minFicoScore;
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
  }
): RoutingMatch {
  const stateMatch = checkStateRestriction(lender, merchant.state);
  const industryMatch = checkIndustryRestriction(lender, merchant.industry);
  const fundingLimitMatch = checkFundingLimit(lender, merchant.requestedAmount);
  const ficoMinimumMatch = checkFicoRequirement(lender, merchant.creditScore);

  // Position match (placeholder - would need actual merchant position data)
  const positionMatch = true;

  // Calculate base score
  let score = 0;
  if (stateMatch) score += 20;
  if (industryMatch) score += 20;
  if (fundingLimitMatch) score += 20;
  if (ficoMinimumMatch) score += 20;
  if (positionMatch) score += 20;

  // Risk-based adjustment
  if (merchant.riskScore !== undefined) {
    if (merchant.riskScore < 30) score += 10;
    else if (merchant.riskScore < 60) score += 5;
    else if (merchant.riskScore > 75) score -= 10;
  }

  const compatibilityScore = Math.max(0, Math.min(100, score));

  // Estimate approval rate based on lender and merchant profile
  let estimatedApprovalRate = lender.approvalRate;
  if (!stateMatch || !industryMatch || !fundingLimitMatch || !ficoMinimumMatch) {
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
    const supabase = await getSupabaseAdmin();

    const approvalRate = metrics.submissionsThisMonth > 0 ? metrics.approvalsThisMonth / metrics.submissionsThisMonth : 0;

    const { error } = await supabase
      .from('lenders')
      .update({
        approval_rate: approvalRate,
        metadata: {
          lastPerformanceUpdate: new Date().toISOString(),
          approvalsThisMonth: metrics.approvalsThisMonth,
          submissionsThisMonth: metrics.submissionsThisMonth,
        },
      })
      .eq('id', lenderId);

    if (error) {
      logger.error('Failed to update lender performance', { error: error.message });
      return { success: false, error: error.message };
    }

    logger.info('Lender performance updated', { lenderId, approvalRate });
    return { success: true };
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
