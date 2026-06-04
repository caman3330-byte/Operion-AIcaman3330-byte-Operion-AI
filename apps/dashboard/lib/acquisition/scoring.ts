import type { LeadTier } from "@operion/shared";
import { isMcaPriorityIndustry } from "@/lib/acquisition/industry-profiles";
import type { NormalizedBusinessLead } from "@/lib/acquisition/normalization";

export interface LeadQualityScore {
  score: number;
  tier: LeadTier;
  reasons: string[];
}

export function scoreLeadQuality(
  lead: NormalizedBusinessLead,
  targetCategory?: string,
  options: { uniqueDomain?: boolean } = {}
): LeadQualityScore {
  let score = 0;
  const reasons: string[] = [];

  if (lead.website_url && lead.domain) {
    score += 30;
    reasons.push("company website");
  }
  if (lead.phone) {
    score += 30;
    reasons.push("phone number");
  }
  if (lead.city) {
    score += 5;
    reasons.push("city present");
  }
  if (lead.state) {
    score += 5;
    reasons.push("state present");
  }
  if (options.uniqueDomain !== false && lead.domain) {
    score += 10;
    reasons.push("unique domain");
  }
  if (categoryMatchesMcaPriority(lead.industry, targetCategory)) {
    score += 20;
    reasons.push("business category match");
  }
  if (lead.email) reasons.push("business email available");

  const bounded = Math.max(0, Math.min(100, score));
  return {
    score: bounded,
    tier: scoreToTier(bounded),
    reasons
  };
}

function categoryMatchesMcaPriority(industry: string | null, targetCategory?: string) {
  return isMcaPriorityIndustry(`${industry ?? ""} ${targetCategory ?? ""}`);
}

export function scoreToTier(score: number): LeadTier {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 45) return "C";
  return "D";
}

export function contactConfidence(input: { email?: string | null; phone?: string | null; contactName?: string | null }) {
  let score = 0;
  if (input.email) score += 45;
  if (input.phone) score += 30;
  if (input.contactName) score += 25;
  return Math.min(100, score);
}
