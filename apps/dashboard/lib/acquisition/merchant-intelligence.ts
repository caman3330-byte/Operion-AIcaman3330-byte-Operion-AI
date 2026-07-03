import type { Json, MerchantAcquisitionSource, MerchantSourceRecommendation, MerchantSourceType } from "@operion/shared";
import { deduplicateAcquisitionRecords } from "@/lib/acquisition/deduplication";
import { getAcquisitionAdapter } from "@/lib/acquisition/adapters/registry";
import type { FreeFirstSourceKey } from "@/lib/acquisition/adapters/types";
import { normalizeBusinessLead } from "@/lib/acquisition/normalization";
import { scoreLeadQuality } from "@/lib/acquisition/scoring";
import { applyValidationToQuality, validateAcquisitionLead } from "@/lib/acquisition/validation";
import { acquisitionRepository } from "@/lib/repositories/acquisition";

const USER_AGENT = "OperionCapital-MerchantIntelligence/1.0";
const TARGET_INDUSTRIES = ["roofing", "hvac", "plumbing", "electrical", "construction", "landscaping", "trucking", "auto_repair"];

type IntelligenceSourceCandidate = {
  source_url: string;
  source_name: string;
  source_type: MerchantSourceType;
  industry: string;
  state: string | null;
  estimated_merchant_count: number;
};

const SOURCE_CANDIDATE_LIBRARY: IntelligenceSourceCandidate[] = [
  { source_url: "https://ieci.org/member-directory", source_name: "IEC National Member Directory", source_type: "association", industry: "electrical", state: null, estimated_merchant_count: 250 },
  { source_url: "https://www.necanet.org/about-neca/directories", source_name: "NECA Member Directories", source_type: "association", industry: "electrical", state: null, estimated_merchant_count: 300 },
  { source_url: "https://www.iec-dallas.com/member-directory", source_name: "IEC Dallas Member Directory", source_type: "association", industry: "electrical", state: "TX", estimated_merchant_count: 80 },
  { source_url: "https://www.ieci.org/chapters", source_name: "IEC Chapter Directory", source_type: "association", industry: "electrical", state: null, estimated_merchant_count: 100 },
  { source_url: "https://www.phccweb.org/find-a-contractor", source_name: "PHCC National Find a Contractor", source_type: "association", industry: "plumbing", state: null, estimated_merchant_count: 200 },
  { source_url: "https://www.phccga.org/find-a-contractor", source_name: "PHCC Georgia Contractor Directory", source_type: "association", industry: "plumbing", state: "GA", estimated_merchant_count: 60 },
  { source_url: "https://www.phccma.org/find-a-contractor", source_name: "PHCC Massachusetts Contractor Directory", source_type: "association", industry: "plumbing", state: "MA", estimated_merchant_count: 75 },
  { source_url: "https://www.nari.org/homeowners/find-a-remodeler", source_name: "NARI Remodeler Directory", source_type: "association", industry: "construction", state: null, estimated_merchant_count: 400 },
  { source_url: "https://www.nahb.org/nahb-community/find-a-member", source_name: "NAHB Find a Member", source_type: "association", industry: "construction", state: null, estimated_merchant_count: 800 },
  { source_url: "https://members.texasbuilders.org/associate-directory", source_name: "Texas Builders Associate Directory", source_type: "association", industry: "construction", state: "TX", estimated_merchant_count: 150 },
  { source_url: "https://asahouston.org/membership/member-directory/", source_name: "ASA Houston Member Directory", source_type: "association", industry: "construction", state: "TX", estimated_merchant_count: 80 },
  { source_url: "https://www.metalroofing.com/find-a-contractor/", source_name: "Metal Roofing Alliance Contractor Finder", source_type: "contractor_listing", industry: "roofing", state: null, estimated_merchant_count: 250 },
  { source_url: "https://www.nationalroofingdirectory.org/", source_name: "National Roofing Directory", source_type: "directory", industry: "roofing", state: null, estimated_merchant_count: 150 },
  { source_url: "https://www.tilecontractors.org/find-a-contractor", source_name: "Tile Roofing Industry Alliance Contractor Finder", source_type: "contractor_listing", industry: "roofing", state: null, estimated_merchant_count: 120 },
  { source_url: "https://hvac-contractors.acca.org/acca-at-home", source_name: "ACCA Contractor Locator", source_type: "association", industry: "hvac", state: null, estimated_merchant_count: 250 },
  { source_url: "https://www.tacca.org/page/MemberDirectory", source_name: "TACCA Member Directory", source_type: "association", industry: "hvac", state: "TX", estimated_merchant_count: 100 },
  { source_url: "https://www.miacca.org/Contractor-Directory", source_name: "MIACCA Contractor Directory", source_type: "association", industry: "hvac", state: "MI", estimated_merchant_count: 75 },
  { source_url: "https://www.landscapeprofessionals.org/LP/Connect/Find_a_Landscape_Professional/LP/Connect/Find_A_Landscape_Professional.aspx", source_name: "NALP Landscape Professional Finder", source_type: "association", industry: "landscaping", state: null, estimated_merchant_count: 450 },
  { source_url: "https://www.txdmv.gov/motor-carriers", source_name: "Texas Motor Carrier Public Resources", source_type: "directory", industry: "trucking", state: "TX", estimated_merchant_count: 200 },
  { source_url: "https://ai.fmcsa.dot.gov/SMS/CarrierSearch", source_name: "FMCSA Carrier Search", source_type: "directory", industry: "trucking", state: null, estimated_merchant_count: 1000 }
];

export async function runMerchantSourceDiscovery(input: { limit?: number; industries?: string[] } = {}) {
  const industries = input.industries?.length ? input.industries : TARGET_INDUSTRIES;
  const limit = Math.min(input.limit ?? 20, 50);
  const run = await acquisitionRepository.createMerchantSourceDiscoveryRun({
    status: "running",
    target_industries: industries,
    metadata: { mode: "candidate_only", source: "merchant_intelligence_library" } as Json
  });

  const existing = await acquisitionRepository.listMerchantSources({ limit: 1000 });
  const existingUrls = new Set(existing.map((source) => normalizeUrl(source.source_url)));
  const selected = SOURCE_CANDIDATE_LIBRARY
    .filter((candidate) => industries.includes(candidate.industry))
    .slice(0, limit);
  const stored = [];
  const duplicates = [];
  const blockedOrUnreachable = [];
  const errors: string[] = [];

  for (const candidate of selected) {
    const normalizedUrl = normalizeUrl(candidate.source_url);
    if (existingUrls.has(normalizedUrl)) {
      duplicates.push(candidate);
      continue;
    }

    const intelligence = await evaluateSourceCandidate(candidate);
    if (!intelligence.website_accessible || intelligence.robots_accessible === false) {
      blockedOrUnreachable.push({ candidate, intelligence });
      continue;
    }

    try {
      const row = await acquisitionRepository.upsertMerchantSource({
        source_url: candidate.source_url,
        source_name: candidate.source_name,
        source_type: candidate.source_type,
        industry: candidate.industry,
        state: candidate.state,
        active: false,
        approval_status: "pending_review",
        health_status: "disabled",
        disabled_reason: "Pending founder approval",
        source_quality_score: intelligence.source_quality_score,
        estimated_merchant_count: intelligence.estimated_merchant_count,
        robots_accessible: intelligence.robots_accessible,
        extraction_compatibility_score: intelligence.extraction_compatibility_score,
        confidence_score: intelligence.confidence_score,
        acquisition_yield_score: intelligence.acquisition_yield_score,
        recommendation: "needs_review",
        metadata: {
          discovered_by: "merchant_intelligence",
          discovery_mode: "candidate_only",
          evidence: intelligence.evidence
        } as Json
      });
      existingUrls.add(normalizedUrl);
      stored.push(row);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown source persistence error");
    }
  }

  await acquisitionRepository.updateMerchantSourceDiscoveryRun(run.id, {
    status: errors.length > 0 ? "completed" : "completed",
    completed_at: new Date().toISOString(),
    candidate_sources_found: selected.length,
    candidate_sources_stored: stored.length,
    duplicates: duplicates.length,
    blocked_or_unreachable: blockedOrUnreachable.length,
    errors,
    metadata: {
      mode: "candidate_only",
      stored_source_names: stored.map((source) => source.source_name),
      blocked_or_unreachable: blockedOrUnreachable.map((item) => item.candidate.source_name)
    } as Json
  });

  return {
    run_id: run.id,
    candidate_sources_found: selected.length,
    candidate_sources_stored: stored.length,
    duplicates: duplicates.length,
    blocked_or_unreachable: blockedOrUnreachable.length,
    errors
  };
}

export async function testMerchantSource(sourceId: string, limit = 10) {
  const sources = await acquisitionRepository.listMerchantSources({ limit: 1000 });
  const source = sources.find((candidate) => candidate.id === sourceId);
  if (!source) throw new Error(`Merchant source not found: ${sourceId}`);
  const adapterKey = sourceToAdapterKey(source);
  const discovery = await getAcquisitionAdapter(adapterKey).discover({
    urls: [source.source_url],
    category: source.industry,
    location: source.state ?? undefined,
    limit: Math.min(limit, 10)
  });
  const deduped = deduplicateAcquisitionRecords(discovery.records);
  const validationResults = [];
  for (const record of deduped.unique.slice(0, 10)) {
    const normalized = normalizeBusinessLead(record);
    const validation = await validateAcquisitionLead({
      businessName: normalized.business_name,
      websiteUrl: normalized.website_url,
      email: normalized.email,
      phone: normalized.phone,
      businessCategory: normalized.industry ?? source.industry,
      source: record.source,
      sourcePageUrl: readSourcePageUrl(record)
    });
    const quality = applyValidationToQuality(scoreLeadQuality(normalized, source.industry, { uniqueDomain: true }), validation);
    validationResults.push({ validation, quality });
  }

  const businessesDiscovered = discovery.records.length;
  const businessesValidated = validationResults.filter((result) => result.validation.status === "verified" && result.quality.score >= 80).length;
  const duplicateRate = deduped.unique.length === 0 ? 0 : Math.round((deduped.duplicates.length / (deduped.unique.length + deduped.duplicates.length)) * 10000) / 100;
  const robotsBlocked = discovery.errors.some((error) => error.toLowerCase().includes("robots"));
  const acquisitionYieldScore = calculateYieldScore({ businessesDiscovered, businessesValidated, duplicateRate, robotsBlocked });
  const recommendation = recommendSource({
    approvalStatus: source.approval_status,
    yieldScore: acquisitionYieldScore,
    failureStreak: source.failure_streak,
    robotsBlocked,
    validated: businessesValidated
  });

  await acquisitionRepository.updateMerchantSource(source.id, {
    robots_accessible: !robotsBlocked,
    test_businesses_discovered: businessesDiscovered,
    test_businesses_validated: businessesValidated,
    test_duplicate_rate: duplicateRate,
    acquisition_yield_score: acquisitionYieldScore,
    extraction_compatibility_score: Math.max(source.extraction_compatibility_score, businessesDiscovered > 0 ? 75 : 20),
    source_quality_score: Math.max(source.source_quality_score, acquisitionYieldScore),
    confidence_score: Math.max(source.confidence_score, Math.min(100, acquisitionYieldScore + (businessesDiscovered > 0 ? 10 : 0))),
    recommendation,
    last_tested_at: new Date().toISOString(),
    last_error: discovery.errors.join("; ") || null
  });

  return {
    source_id: source.id,
    source_name: source.source_name,
    businesses_discovered: businessesDiscovered,
    businesses_validated: businessesValidated,
    website_verification_count: validationResults.filter((result) => result.validation.website_verified).length,
    phone_verification_count: validationResults.filter((result) => result.validation.phone_verified).length,
    duplicate_rate: duplicateRate,
    acquisition_yield_score: acquisitionYieldScore,
    recommendation,
    errors: discovery.errors
  };
}

async function evaluateSourceCandidate(candidate: IntelligenceSourceCandidate) {
  const robots = await checkRobots(candidate.source_url);
  const page = await inspectSourcePage(candidate.source_url);
  const extractionCompatibility = page.link_count >= 25 ? 85 : page.link_count >= 10 ? 65 : page.link_count > 0 ? 35 : 10;
  const sourceQuality = Math.min(100,
    20 +
    (robots.accessible ? 20 : 0) +
    (page.accessible ? 20 : 0) +
    extractionCompatibility * 0.25 +
    Math.min(20, Math.round(candidate.estimated_merchant_count / 25))
  );
  const confidence = Math.min(100, Math.round((sourceQuality + extractionCompatibility + (robots.accessible ? 80 : 20)) / 3));
  return {
    website_accessible: page.accessible,
    robots_accessible: robots.accessible,
    source_quality_score: Math.round(sourceQuality),
    estimated_merchant_count: candidate.estimated_merchant_count,
    extraction_compatibility_score: extractionCompatibility,
    confidence_score: confidence,
    acquisition_yield_score: 0,
    evidence: {
      robots_status: robots.status,
      page_status: page.status,
      link_count: page.link_count,
      title: page.title
    }
  };
}

async function checkRobots(sourceUrl: string) {
  try {
    const root = new URL(sourceUrl);
    const response = await fetch(new URL("/robots.txt", root.origin), {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(8_000)
    });
    if (response.status === 404) return { accessible: true, status: 404 };
    if (!response.ok) return { accessible: true, status: response.status };
    const body = (await response.text()).toLowerCase();
    const path = root.pathname.toLowerCase() || "/";
    const blocksAll = /user-agent:\s*\*[\s\S]*?disallow:\s*\/(?:\s|$)/i.test(body);
    const blocksPath = body.includes(`disallow: ${path}`);
    return { accessible: !blocksAll && !blocksPath, status: response.status };
  } catch {
    return { accessible: true, status: null };
  }
}

async function inspectSourcePage(sourceUrl: string) {
  try {
    const response = await fetch(sourceUrl, {
      headers: { "user-agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) return { accessible: false, status: response.status, link_count: 0, title: null };
    const html = (await response.text()).slice(0, 500_000);
    return {
      accessible: true,
      status: response.status,
      link_count: [...html.matchAll(/<a\b/gi)].length,
      title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim().slice(0, 120) ?? null
    };
  } catch {
    return { accessible: false, status: null, link_count: 0, title: null };
  }
}

function calculateYieldScore(input: { businessesDiscovered: number; businessesValidated: number; duplicateRate: number; robotsBlocked: boolean }) {
  if (input.robotsBlocked) return 0;
  const discoveryScore = Math.min(35, input.businessesDiscovered * 3.5);
  const validationRate = input.businessesDiscovered === 0 ? 0 : input.businessesValidated / input.businessesDiscovered;
  const validationScore = Math.round(validationRate * 45);
  const duplicatePenalty = Math.min(20, Math.round(input.duplicateRate / 5));
  return Math.max(0, Math.min(100, Math.round(discoveryScore + validationScore + 20 - duplicatePenalty)));
}

function recommendSource(input: {
  approvalStatus: string;
  yieldScore: number;
  failureStreak: number;
  robotsBlocked: boolean;
  validated: number;
}): MerchantSourceRecommendation {
  if (input.robotsBlocked || input.failureStreak >= 3) return "retire";
  if (input.yieldScore >= 80 && input.validated >= 5) return input.approvalStatus === "approved" ? "monitor" : "promote";
  if (input.yieldScore >= 55 && input.validated >= 2) return "monitor";
  if (input.yieldScore > 0) return "degrade";
  return "needs_review";
}

function sourceToAdapterKey(source: MerchantAcquisitionSource): FreeFirstSourceKey {
  if (source.source_type === "chamber") return "chamber_directories";
  if (source.source_type === "association") return "industry_associations";
  if (source.source_type === "contractor_listing" || source.source_type === "directory") return "public_business_directories";
  return "company_websites";
}

function readSourcePageUrl(record: { raw_payload?: unknown }) {
  if (!record.raw_payload || typeof record.raw_payload !== "object" || Array.isArray(record.raw_payload)) return null;
  const value = (record.raw_payload as Record<string, unknown>).source_url;
  return typeof value === "string" ? value : null;
}

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().replace(/\/$/, "").toLowerCase();
  }
}
