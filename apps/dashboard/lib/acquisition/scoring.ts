import type { LeadTier } from "@operion/shared";
import type { NormalizedBusinessLead } from "@/lib/acquisition/normalization";

export interface LeadQualityScore {
  score: number;
  tier: LeadTier;
  reasons: string[];
}

export function scoreLeadQuality(lead: NormalizedBusinessLead): LeadQualityScore {
  let score = 20;
  const reasons: string[] = [];

  if (lead.email) {
    score += 18;
    reasons.push("email present");
  }
  if (lead.phone) {
    score += 12;
    reasons.push("phone present");
  }
  if (lead.website_url) {
    score += 10;
    reasons.push("website present");
  }
  if (lead.industry) {
    score += 8;
    reasons.push("industry present");
  }
  if (lead.state) {
    score += 6;
    reasons.push("state present");
  }
  if (Number(lead.annual_revenue_est ?? 0) >= 250_000) {
    score += 16;
    reasons.push("revenue fit");
  }
  if (Number(lead.time_in_business_years ?? 0) >= 1) {
    score += 10;
    reasons.push("time in business fit");
  }

  const bounded = Math.max(0, Math.min(100, score));
  return {
    score: bounded,
    tier: scoreToTier(bounded),
    reasons
  };
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
