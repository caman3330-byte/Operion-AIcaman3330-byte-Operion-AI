import type { Json, MerchantAcquisitionSource } from "@operion/shared";
import { getAcquisitionAdapter } from "@/lib/acquisition/adapters/registry";
import type { FreeFirstSourceKey } from "@/lib/acquisition/adapters/types";
import { normalizeBusinessLead } from "@/lib/acquisition/normalization";
import { boundedNumber } from "@/lib/acquisition/runtime-controls";
import { acquisitionRepository } from "@/lib/repositories/acquisition";

export type SourceNetworkType =
  | "DIRECTORY"
  | "ASSOCIATION_MEMBER_DIRECTORY"
  | "CHAMBER_DIRECTORY"
  | "CONTRACTOR_DIRECTORY"
  | "LICENSED_BUSINESS_DIRECTORY"
  | "ACCREDITATION_DIRECTORY"
  | "DEALER_DIRECTORY"
  | "MANUFACTURER_LOCATOR"
  | "GOVERNMENT_DIRECTORY"
  | "SEARCH_ENGINE"
  | "VENDOR_PLATFORM"
  | "AGGREGATOR"
  | "OTHER";

export type SourceQualityGrade = "A" | "B" | "C" | "D" | "BLOCKED";

export interface SourceQualificationResult {
  source_id: string;
  source_name: string;
  source_url: string;
  source_type: SourceNetworkType;
  industry: string;
  state: string | null;
  grade: SourceQualityGrade;
  source_quality_score: number;
  sampled: number;
  legitimate_businesses: number;
  independent_websites: number;
  valid_phones: number;
  potential_merchants: number;
  false_positives: number;
  duplicates: number;
  independent_business_website_rate: number;
  phone_quality_rate: number;
  legitimate_business_name_rate: number;
  duplicate_rate: number;
  recommendation: "promote" | "monitor" | "degrade" | "retire" | "needs_review";
  productive: boolean;
  errors: string[];
  sample_names: string[];
}

export async function qualifyMerchantSource(source: MerchantAcquisitionSource, sampleLimit = 8): Promise<SourceQualificationResult> {
  const startedAt = Date.now();
  const adapterKey = sourceToAdapterKey(source);
  const limit = Math.min(Math.max(sampleLimit, 1), 10);
  const sourceType = classifySourceType(source);
  const discovery = await getAcquisitionAdapter(adapterKey).discover({
    urls: [source.source_url],
    category: source.industry,
    location: source.state ?? undefined,
    limit,
    sourceTimeoutMs: boundedNumber(process.env.MERCHANT_SOURCE_QUALIFICATION_TIMEOUT_MS, 20_000, 8_000, 45_000),
    pageTimeoutMs: boundedNumber(process.env.MERCHANT_ACQUISITION_PAGE_TIMEOUT_MS, 8_000, 3_000, 15_000),
    detailTimeoutMs: boundedNumber(process.env.MERCHANT_ACQUISITION_DETAIL_TIMEOUT_MS, 5_000, 2_000, 10_000),
    maxPages: boundedNumber(process.env.MERCHANT_SOURCE_QUALIFICATION_MAX_PAGES, 2, 1, 4)
  });

  const normalized = discovery.records.map((record) => normalizeBusinessLead(record));
  const sampleHosts = normalized.map((record) => record.domain).filter((value): value is string => Boolean(value));
  const duplicateHosts = countDuplicateValues(sampleHosts);
  const samplePhones = normalized.map((record) => normalizePhone(record.phone)).filter((value): value is string => Boolean(value));
  const repeatedPhones = countDuplicateValues(samplePhones);
  const legitimate = normalized.filter((record) => isLegitimateBusinessName(record.business_name));
  const independent = normalized.filter((record) => record.domain && isIndependentBusinessDomain(record.domain, source.source_url));
  const validPhones = normalized.filter((record) => {
    const phone = normalizePhone(record.phone);
    return Boolean(phone) && repeatedPhones.get(phone as string) === 1;
  });
  const potentialMerchants = normalized.filter((record) =>
    isLegitimateBusinessName(record.business_name)
    && record.domain
    && isIndependentBusinessDomain(record.domain, source.source_url)
    && !isBadSourceTypeForAutomaticPriority(sourceType)
  );
  const falsePositives = normalized.length - potentialMerchants.length;
  const duplicateCount = [...duplicateHosts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const independentRate = percentage(independent.length, normalized.length);
  const phoneRate = percentage(validPhones.length, normalized.length);
  const nameRate = percentage(legitimate.length, normalized.length);
  const duplicateRate = percentage(duplicateCount, Math.max(normalized.length, 1));
  const blocked = discovery.errors.some((error) => /robots|403|blocked/i.test(error));
  const score = scoreSource({
    sourceType,
    sampled: normalized.length,
    independentRate,
    phoneRate,
    nameRate,
    duplicateRate,
    falsePositiveRate: percentage(falsePositives, Math.max(normalized.length, 1)),
    blocked,
    priorVerifiedRate: Number(source.verified_rate ?? 0),
    priorDuplicateRate: Number(source.duplicate_rate ?? 0)
  });
  const grade = gradeSource(score, blocked, normalized.length);
  const recommendation = grade === "A" ? "promote" : grade === "B" ? "monitor" : grade === "C" ? "degrade" : "retire";
  const productive = Number(source.test_businesses_validated ?? 0) >= 3 && grade === "A";
  const metadata = {
    ...(source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata) ? source.metadata : {}),
    source_qualification: {
      source_type: sourceType,
      grade,
      sampled: normalized.length,
      legitimate_businesses: legitimate.length,
      independent_websites: independent.length,
      valid_phones: validPhones.length,
      potential_merchants: potentialMerchants.length,
      false_positives: falsePositives,
      duplicates: duplicateCount,
      independent_business_website_rate: independentRate,
      phone_quality_rate: phoneRate,
      legitimate_business_name_rate: nameRate,
      duplicate_rate: duplicateRate,
      runtime_ms: Date.now() - startedAt,
      qualified_at: new Date().toISOString(),
      errors: discovery.errors,
      sample_names: normalized.slice(0, 10).map((record) => record.business_name)
    },
    discovered_from: readDiscoveredFrom(source)
  } as Json;

  await acquisitionRepository.updateMerchantSource(source.id, {
    source_quality_score: score,
    extraction_compatibility_score: Math.max(source.extraction_compatibility_score, normalized.length > 0 ? Math.min(100, score + 10) : 0),
    acquisition_yield_score: Math.max(0, Math.round((score + Number(source.verified_rate ?? 0) - duplicateRate) / 2)),
    confidence_score: Math.max(source.confidence_score, score),
    test_businesses_discovered: normalized.length,
    test_duplicate_rate: duplicateRate,
    robots_accessible: !blocked,
    recommendation,
    health_status: grade === "BLOCKED" ? "blocked" : grade === "D" ? "disabled" : grade === "C" ? "degraded" : source.health_status,
    active: source.approval_status === "approved" && (grade === "A" || grade === "B"),
    disabled_reason: grade === "D" ? "Source qualification rejected low-yield or non-merchant source" : source.disabled_reason,
    last_tested_at: new Date().toISOString(),
    last_error: discovery.errors.join("; ") || null,
    metadata
  });

  return {
    source_id: source.id,
    source_name: source.source_name,
    source_url: source.source_url,
    source_type: sourceType,
    industry: source.industry,
    state: source.state,
    grade,
    source_quality_score: score,
    sampled: normalized.length,
    legitimate_businesses: legitimate.length,
    independent_websites: independent.length,
    valid_phones: validPhones.length,
    potential_merchants: potentialMerchants.length,
    false_positives: falsePositives,
    duplicates: duplicateCount,
    independent_business_website_rate: independentRate,
    phone_quality_rate: phoneRate,
    legitimate_business_name_rate: nameRate,
    duplicate_rate: duplicateRate,
    recommendation,
    productive,
    errors: discovery.errors,
    sample_names: normalized.slice(0, 10).map((record) => record.business_name)
  };
}

export async function qualifyMerchantSourceBatch(input: { limit?: number; sampleLimit?: number; approvedOnly?: boolean } = {}) {
  const sources = (await acquisitionRepository.listMerchantSources({ limit: 500 }))
    .filter((source) => !input.approvedOnly || source.approval_status === "approved")
    .sort(compareQualificationPriority)
    .slice(0, input.limit ?? 20);
  const results = [];
  for (const source of sources) {
    results.push(await qualifyMerchantSource(source, input.sampleLimit ?? 8));
  }
  return {
    qualified: results.length,
    grades: {
      A: results.filter((result) => result.grade === "A").length,
      B: results.filter((result) => result.grade === "B").length,
      C: results.filter((result) => result.grade === "C").length,
      D: results.filter((result) => result.grade === "D").length,
      BLOCKED: results.filter((result) => result.grade === "BLOCKED").length
    },
    results
  };
}

function compareQualificationPriority(left: MerchantAcquisitionSource, right: MerchantAcquisitionSource) {
  const leftUntested = left.last_tested_at ? 0 : 1;
  const rightUntested = right.last_tested_at ? 0 : 1;
  if (leftUntested !== rightUntested) return rightUntested - leftUntested;

  const leftHasQualification = hasSourceQualification(left) ? 0 : 1;
  const rightHasQualification = hasSourceQualification(right) ? 0 : 1;
  if (leftHasQualification !== rightHasQualification) return rightHasQualification - leftHasQualification;

  const yieldDiff = Number(right.acquisition_yield_score ?? 0) - Number(left.acquisition_yield_score ?? 0);
  if (yieldDiff !== 0) return yieldDiff;

  return Number(right.source_quality_score ?? 0) - Number(left.source_quality_score ?? 0);
}

function hasSourceQualification(source: MerchantAcquisitionSource) {
  return Boolean(source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata) && "source_qualification" in source.metadata);
}

function scoreSource(input: {
  sourceType: SourceNetworkType;
  sampled: number;
  independentRate: number;
  phoneRate: number;
  nameRate: number;
  duplicateRate: number;
  falsePositiveRate: number;
  blocked: boolean;
  priorVerifiedRate: number;
  priorDuplicateRate: number;
}) {
  if (input.blocked) return 0;
  let score = 0;
  score += Math.min(35, input.independentRate * 0.35);
  score += Math.min(25, input.nameRate * 0.25);
  score += Math.min(20, input.phoneRate * 0.2);
  score += Math.min(15, input.priorVerifiedRate * 0.6);
  score += input.sampled >= 3 ? 5 : input.sampled * 1.5;
  score -= Math.min(30, input.falsePositiveRate * 0.3);
  score -= Math.min(25, input.duplicateRate * 0.25);
  score -= Math.min(15, input.priorDuplicateRate * 0.15);
  if (isBadSourceTypeForAutomaticPriority(input.sourceType)) score -= 20;
  if (input.sourceType === "ASSOCIATION_MEMBER_DIRECTORY" || input.sourceType === "CHAMBER_DIRECTORY" || input.sourceType === "CONTRACTOR_DIRECTORY") score += 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function gradeSource(score: number, blocked: boolean, sampled: number): SourceQualityGrade {
  if (blocked) return "BLOCKED";
  if (sampled === 0) return "D";
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

function classifySourceType(source: MerchantAcquisitionSource): SourceNetworkType {
  const text = `${source.source_name} ${source.source_url}`.toLowerCase();
  if (/\b(gov|fmcsa|txdmv|license|licensed)\b/.test(text) || /\.gov\b/.test(text)) return "GOVERNMENT_DIRECTORY";
  if (/\b(carrier|rheem|ruud|bryant|lennox|trane|generac|kohler|gaf|owens corning|iko|tamko|atlas|malarkey|bosch|napa|tesla|eaton)\b/.test(text)) return "MANUFACTURER_LOCATOR";
  if (/\b(angi|homeadvisor|yelp|bbb|repairpal|contractor connection|quicktsi)\b/.test(text)) return "AGGREGATOR";
  if (/\b(chamber)\b/.test(text) || source.source_type === "chamber") return "CHAMBER_DIRECTORY";
  if (/\b(certified|accredit|blue seal|iicrc|nate)\b/.test(text)) return "ACCREDITATION_DIRECTORY";
  if (/\b(contractor|roofer|plumber|hvac|electric|builder|shop|member directory|members)\b/.test(text) && source.source_type === "association") return "ASSOCIATION_MEMBER_DIRECTORY";
  if (/\b(contractor|finder|find a|locator)\b/.test(text)) return "CONTRACTOR_DIRECTORY";
  if (source.source_type === "directory") return "DIRECTORY";
  return "OTHER";
}

function sourceToAdapterKey(source: MerchantAcquisitionSource): FreeFirstSourceKey {
  if (source.source_type === "chamber") return "chamber_directories";
  if (source.source_type === "association") return "industry_associations";
  if (source.source_type === "contractor_listing" || source.source_type === "directory") return "public_business_directories";
  return "company_websites";
}

function isBadSourceTypeForAutomaticPriority(type: SourceNetworkType) {
  return ["MANUFACTURER_LOCATOR", "GOVERNMENT_DIRECTORY", "SEARCH_ENGINE", "VENDOR_PLATFORM", "AGGREGATOR"].includes(type);
}

function isLegitimateBusinessName(name: string) {
  return name.length >= 3
    && name.length <= 100
    && !/^\(?\d{3}\)?[\s.-]\d{3}/.test(name)
    && !/\b(?:find a|search|locator|directory|member login|privacy|policy|sponsor|sponsored|resources|helpful tools|navigation|details|events|upcoming|annual sponsors|territory manager|government|chapter|association|manufacturer|service area|become a member|click here|learn more|read more)\b/i.test(name);
}

function isIndependentBusinessDomain(domain: string, sourceUrl: string) {
  const sourceHost = host(sourceUrl);
  return registrable(domain) !== registrable(sourceHost)
    && !/(facebook|instagram|linkedin|youtube|google|yelp|angi|homeadvisor|bbb|yellowpages|mapquest|chamberofcommerce|growthzone|yourmembership|memberclicks|typeform|termsfeed|govdelivery)\./i.test(domain)
    && !/\.(gov|edu)$/i.test(domain);
}

function normalizePhone(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return null;
}

function countDuplicateValues(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function host(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function registrable(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "").split(".").slice(-2).join(".");
}

function readDiscoveredFrom(source: MerchantAcquisitionSource) {
  if (!source.metadata || typeof source.metadata !== "object" || Array.isArray(source.metadata)) return null;
  const value = (source.metadata as Record<string, unknown>).discovered_from;
  return typeof value === "string" ? value : null;
}
