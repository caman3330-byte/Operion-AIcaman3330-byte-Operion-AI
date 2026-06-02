import type { Json } from "@operion/shared";
import { logger } from "../logger";
import { getSupabaseAdmin } from "../supabase/server";
import { calculateRoutingMatch, loadActiveLenders, type LenderProfile, type RoutingMatch } from "./routing";

export interface DistributionMerchantProfile {
  businessApplicationId?: string;
  leadId?: string;
  state: string;
  industry: string;
  requestedAmount: number;
  creditScore?: number;
  riskScore?: number;
}

export interface LenderDistributionDecision extends RoutingMatch {
  priorityRank: number;
  restrictionFailures: string[];
  riskAdjustedScore: number;
  distribute: boolean;
}

export interface DistributionPlan {
  merchant: DistributionMerchantProfile;
  decisions: LenderDistributionDecision[];
  selectedLenderIds: string[];
  routingConfidence: number;
  requiresApproval: boolean;
}

export async function buildLenderDistributionPlan(input: {
  merchant: DistributionMerchantProfile;
  maxDistributions?: number;
  minimumScore?: number;
}): Promise<{ plan?: DistributionPlan; error?: string }> {
  const { lenders, error } = await loadActiveLenders();
  if (error) return { error };

  const decisions = prioritizeLenders(
    lenders.map((lender) => buildDistributionDecision(lender, input.merchant)),
    input.minimumScore ?? 50
  );
  const selected = decisions.filter((decision) => decision.distribute).slice(0, input.maxDistributions ?? 5);
  const routingConfidence = selected.length === 0
    ? 0
    : Number((selected.reduce((sum, decision) => sum + decision.routingConfidence, 0) / selected.length).toFixed(2));

  return {
    plan: {
      merchant: input.merchant,
      decisions,
      selectedLenderIds: selected.map((decision) => decision.lenderId),
      routingConfidence,
      requiresApproval: selected.some((decision) => decision.restrictionFailures.length > 0 || decision.riskAdjustedScore < 65)
    }
  };
}

export async function persistDistributionPlan(plan: DistributionPlan): Promise<{ success: boolean; inserted: number; error?: string }> {
  if (!plan.merchant.leadId) {
    return { success: false, inserted: 0, error: "Cannot persist lender matches without a lead id in the current schema" };
  }

  try {
    const supabase = await getSupabaseAdmin();
    const selectedLenderIds = new Set(plan.selectedLenderIds);
    const rows = plan.decisions
      .filter((decision) => decision.distribute && selectedLenderIds.has(decision.lenderId))
      .map((decision) => ({
        lead_id: plan.merchant.leadId as string,
        lender_id: decision.lenderId,
        business_application_id: plan.merchant.businessApplicationId,
        match_score: decision.riskAdjustedScore,
        status: "recommended" as const,
        criteria_snapshot: {
          stateMatch: decision.stateMatch,
          industryMatch: decision.industryMatch,
          fundingLimitMatch: decision.fundingLimitMatch,
          ficoMinimumMatch: decision.ficoMinimumMatch,
          routingConfidence: decision.routingConfidence,
          restrictionFailures: decision.restrictionFailures
        } as Json
      }));

    if (rows.length === 0) return { success: true, inserted: 0 };
    const { error } = await supabase.from("lender_matches").insert(rows);
    if (error) return { success: false, inserted: 0, error: error.message };
    logger.info("Lender distribution plan persisted", { leadId: plan.merchant.leadId, inserted: rows.length });
    return { success: true, inserted: rows.length };
  } catch (error) {
    return { success: false, inserted: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

export function buildDistributionDecision(
  lender: LenderProfile,
  merchant: DistributionMerchantProfile
): LenderDistributionDecision {
  const match = calculateRoutingMatch(lender, merchant);
  const restrictionFailures = [
    match.stateMatch ? undefined : "state_restricted",
    match.industryMatch ? undefined : "industry_restricted",
    match.fundingLimitMatch ? undefined : "outside_funding_limits",
    match.ficoMinimumMatch ? undefined : "below_minimum_fico"
  ].filter((failure): failure is string => Boolean(failure));
  const riskPenalty = merchant.riskScore === undefined ? 0 : merchant.riskScore > 80 ? 25 : merchant.riskScore > 65 ? 14 : merchant.riskScore > 50 ? 6 : 0;
  const speedLift = lender.fundingSpeed === "fast" ? 4 : lender.fundingSpeed === "slow" ? -4 : 0;
  const riskAdjustedScore = Math.max(0, Math.min(100, match.compatibilityScore - riskPenalty + speedLift));

  return {
    ...match,
    priorityRank: 0,
    restrictionFailures,
    riskAdjustedScore,
    distribute: restrictionFailures.length === 0 && riskAdjustedScore >= 50
  };
}

export function prioritizeLenders(
  decisions: LenderDistributionDecision[],
  minimumScore: number
): LenderDistributionDecision[] {
  return decisions
    .map((decision) => ({
      ...decision,
      distribute: decision.distribute && decision.riskAdjustedScore >= minimumScore
    }))
    .sort((a, b) => b.riskAdjustedScore - a.riskAdjustedScore || b.estimatedApprovalRate - a.estimatedApprovalRate)
    .map((decision, index) => ({ ...decision, priorityRank: index + 1 }));
}
