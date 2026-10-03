import type { Json, MerchantAcquisitionSource, MerchantSourceRecommendation, MerchantSourceType } from "@operion/shared";
import { deduplicateAcquisitionRecords } from "@/lib/acquisition/deduplication";
import { getAcquisitionAdapter } from "@/lib/acquisition/adapters/registry";
import type { FreeFirstSourceKey } from "@/lib/acquisition/adapters/types";
import { normalizeBusinessLead } from "@/lib/acquisition/normalization";
import { scoreLeadQuality } from "@/lib/acquisition/scoring";
import { applyValidationToQuality, validateAcquisitionLead } from "@/lib/acquisition/validation";
import { acquisitionRepository } from "@/lib/repositories/acquisition";

const USER_AGENT = "OperionCapital-MerchantIntelligence/1.0";
const TARGET_INDUSTRIES = [
  "roofing",
  "hvac",
  "plumbing",
  "electrical",
  "construction",
  "restoration",
  "landscaping",
  "trucking",
  "auto_repair",
  "commercial_contractors",
  "commercial_services"
];

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
  { source_url: "https://iecpennsylvania.org/about/member-directory/", source_name: "IEC Pennsylvania Member Directory", source_type: "association", industry: "electrical", state: "PA", estimated_merchant_count: 70 },
  { source_url: "https://members.centexiec.com/contractormemberdirectory/FindStartsWith?term=A", source_name: "CenTex IEC Contractor Directory", source_type: "association", industry: "electrical", state: "TX", estimated_merchant_count: 120 },
  { source_url: "https://www.phccweb.org/find-a-contractor", source_name: "PHCC National Find a Contractor", source_type: "association", industry: "plumbing", state: null, estimated_merchant_count: 200 },
  { source_url: "https://www.phccga.org/find-a-contractor", source_name: "PHCC Georgia Contractor Directory", source_type: "association", industry: "plumbing", state: "GA", estimated_merchant_count: 60 },
  { source_url: "https://www.phccma.org/find-a-contractor", source_name: "PHCC Massachusetts Contractor Directory", source_type: "association", industry: "plumbing", state: "MA", estimated_merchant_count: 75 },
  { source_url: "https://www.nari.org/homeowners/find-a-remodeler", source_name: "NARI Remodeler Directory", source_type: "association", industry: "construction", state: null, estimated_merchant_count: 400 },
  { source_url: "https://www.nahb.org/nahb-community/find-a-member", source_name: "NAHB Find a Member", source_type: "association", industry: "construction", state: null, estimated_merchant_count: 800 },
  { source_url: "https://members.texasbuilders.org/associate-directory", source_name: "Texas Builders Associate Directory", source_type: "association", industry: "construction", state: "TX", estimated_merchant_count: 150 },
  { source_url: "https://asahouston.org/membership/member-directory/", source_name: "ASA Houston Member Directory", source_type: "association", industry: "construction", state: "TX", estimated_merchant_count: 80 },
  { source_url: "https://www.mcaepa.org/list/searchalpha/a", source_name: "MCA Eastern PA Member Directory", source_type: "association", industry: "construction", state: "PA", estimated_merchant_count: 100 },
  { source_url: "https://memberships.cwhba.org/directory", source_name: "Central Washington Builders Directory", source_type: "association", industry: "construction", state: "WA", estimated_merchant_count: 200 },
  { source_url: "https://members.cmbaonline.org/member-directory", source_name: "Central Minnesota Builders Directory", source_type: "association", industry: "construction", state: "MN", estimated_merchant_count: 150 },
  { source_url: "https://www.metalroofing.com/find-a-contractor/", source_name: "Metal Roofing Alliance Contractor Finder", source_type: "contractor_listing", industry: "roofing", state: null, estimated_merchant_count: 250 },
  { source_url: "https://www.nationalroofingdirectory.org/", source_name: "National Roofing Directory", source_type: "directory", industry: "roofing", state: null, estimated_merchant_count: 150 },
  { source_url: "https://www.tilecontractors.org/find-a-contractor", source_name: "Tile Roofing Industry Alliance Contractor Finder", source_type: "contractor_listing", industry: "roofing", state: null, estimated_merchant_count: 120 },
  { source_url: "https://www.azroofing.org/find-a-contractor", source_name: "Arizona Roofing Contractors Finder", source_type: "association", industry: "roofing", state: "AZ", estimated_merchant_count: 90 },
  { source_url: "https://www.rcat.net/consumers.html", source_name: "RCAT Licensed Roofer Finder", source_type: "association", industry: "roofing", state: "TX", estimated_merchant_count: 120 },
  { source_url: "https://hvac-contractors.acca.org/acca-at-home", source_name: "ACCA Contractor Locator", source_type: "association", industry: "hvac", state: null, estimated_merchant_count: 250 },
  { source_url: "https://www.acca.org/directories/", source_name: "ACCA Directory Hub", source_type: "association", industry: "hvac", state: null, estimated_merchant_count: 250 },
  { source_url: "https://www.tacca.org/page/MemberDirectory", source_name: "TACCA Member Directory", source_type: "association", industry: "hvac", state: "TX", estimated_merchant_count: 100 },
  { source_url: "https://taccagreatersanantonio.org/contractor-directory/", source_name: "TACCA Greater San Antonio Contractor Directory", source_type: "association", industry: "hvac", state: "TX", estimated_merchant_count: 80 },
  { source_url: "https://www.miacca.org/Contractor-Directory", source_name: "MIACCA Contractor Directory", source_type: "association", industry: "hvac", state: "MI", estimated_merchant_count: 75 },
  { source_url: "https://www.landscapeprofessionals.org/LP/Connect/Find_a_Landscape_Professional/LP/Connect/Find_A_Landscape_Professional.aspx", source_name: "NALP Landscape Professional Finder", source_type: "association", industry: "landscaping", state: null, estimated_merchant_count: 450 },
  { source_url: "https://www.txdmv.gov/motor-carriers", source_name: "Texas Motor Carrier Public Resources", source_type: "directory", industry: "trucking", state: "TX", estimated_merchant_count: 200 },
  { source_url: "https://ai.fmcsa.dot.gov/SMS/CarrierSearch", source_name: "FMCSA Carrier Search", source_type: "directory", industry: "trucking", state: null, estimated_merchant_count: 1000 },
  { source_url: "https://members.asashop.org/find-a-shop", source_name: "Automotive Service Association Shop Finder", source_type: "association", industry: "auto_repair", state: null, estimated_merchant_count: 250 },
  { source_url: "https://www.restorationindustry.org/find-a-restorer", source_name: "RIA Find a Restorer", source_type: "association", industry: "restoration", state: null, estimated_merchant_count: 200 },
  { source_url: "https://www.iicrc.org/page/IICRCGlobalLocator", source_name: "IICRC Certified Firm Locator", source_type: "contractor_listing", industry: "restoration", state: null, estimated_merchant_count: 500 },
  { source_url: "https://www.agc.org/connect/chapters", source_name: "AGC Chapter Directory", source_type: "association", industry: "commercial_contractors", state: null, estimated_merchant_count: 150 }
];

const FRESH_SOURCE_CANDIDATE_LIBRARY: IntelligenceSourceCandidate[] = [
  { source_url: "https://www.gaf.com/en-us/roofing-contractors/residential", source_name: "GAF Residential Roofing Contractor Locator", source_type: "contractor_listing", industry: "roofing", state: null, estimated_merchant_count: 500 },
  { source_url: "https://www.owenscorning.com/en-us/roofing/contractors", source_name: "Owens Corning Roofing Contractor Locator", source_type: "contractor_listing", industry: "roofing", state: null, estimated_merchant_count: 500 },
  { source_url: "https://www.certainteed.com/find-a-pro/roofing/", source_name: "CertainTeed Roofing Find a Pro", source_type: "contractor_listing", industry: "roofing", state: null, estimated_merchant_count: 500 },
  { source_url: "https://www.tamko.com/find-a-contractor", source_name: "TAMKO Contractor Locator", source_type: "contractor_listing", industry: "roofing", state: null, estimated_merchant_count: 250 },
  { source_url: "https://www.iko.com/na/residential-roofing-contractors/", source_name: "IKO Roofing Contractor Locator", source_type: "contractor_listing", industry: "roofing", state: null, estimated_merchant_count: 250 },
  { source_url: "https://www.atlasroofing.com/roofing-contractors", source_name: "Atlas Roofing Contractor Locator", source_type: "contractor_listing", industry: "roofing", state: null, estimated_merchant_count: 250 },
  { source_url: "https://www.malarkeyroofing.com/contractor-locator", source_name: "Malarkey Contractor Locator", source_type: "contractor_listing", industry: "roofing", state: null, estimated_merchant_count: 200 },
  { source_url: "https://www.haagcertifiedinspector.com/search", source_name: "Haag Certified Inspector Search", source_type: "contractor_listing", industry: "roofing", state: null, estimated_merchant_count: 200 },
  { source_url: "https://www.carrier.com/residential/en/us/find-a-dealer/", source_name: "Carrier Dealer Locator", source_type: "contractor_listing", industry: "hvac", state: null, estimated_merchant_count: 500 },
  { source_url: "https://www.lennox.com/locate", source_name: "Lennox Dealer Locator", source_type: "contractor_listing", industry: "hvac", state: null, estimated_merchant_count: 500 },
  { source_url: "https://www.trane.com/residential/en/dealer-locator/", source_name: "Trane Dealer Locator", source_type: "contractor_listing", industry: "hvac", state: null, estimated_merchant_count: 500 },
  { source_url: "https://www.americanstandardair.com/find-a-dealer/", source_name: "American Standard HVAC Dealer Locator", source_type: "contractor_listing", industry: "hvac", state: null, estimated_merchant_count: 500 },
  { source_url: "https://www.rheem.com/find-a-pro/", source_name: "Rheem Find a Pro", source_type: "contractor_listing", industry: "hvac", state: null, estimated_merchant_count: 500 },
  { source_url: "https://www.ruud.com/find-a-contractor/", source_name: "Ruud Contractor Locator", source_type: "contractor_listing", industry: "hvac", state: null, estimated_merchant_count: 300 },
  { source_url: "https://www.bryant.com/en/us/find-a-dealer/", source_name: "Bryant Dealer Locator", source_type: "contractor_listing", industry: "hvac", state: null, estimated_merchant_count: 300 },
  { source_url: "https://www.goodmanmfg.com/support/find-a-dealer", source_name: "Goodman Dealer Locator", source_type: "contractor_listing", industry: "hvac", state: null, estimated_merchant_count: 300 },
  { source_url: "https://www.natex.org/site/technicians", source_name: "NATE Certified Technician Locator", source_type: "contractor_listing", industry: "hvac", state: null, estimated_merchant_count: 300 },
  { source_url: "https://www.navieninc.com/installers", source_name: "Navien Installer Locator", source_type: "contractor_listing", industry: "plumbing", state: null, estimated_merchant_count: 300 },
  { source_url: "https://www.rinnai.us/find-a-pro", source_name: "Rinnai Find a Pro", source_type: "contractor_listing", industry: "plumbing", state: null, estimated_merchant_count: 300 },
  { source_url: "https://www.bradfordwhite.com/find-a-contractor/", source_name: "Bradford White Contractor Locator", source_type: "contractor_listing", industry: "plumbing", state: null, estimated_merchant_count: 300 },
  { source_url: "https://www.statewaterheaters.com/where-to-buy/find-a-contractor", source_name: "State Water Heaters Contractor Locator", source_type: "contractor_listing", industry: "plumbing", state: null, estimated_merchant_count: 250 },
  { source_url: "https://www.ao-smith.com/find-a-contractor", source_name: "A. O. Smith Contractor Locator", source_type: "contractor_listing", industry: "plumbing", state: null, estimated_merchant_count: 250 },
  { source_url: "https://www.generac.com/dealer-locator", source_name: "Generac Dealer Locator", source_type: "contractor_listing", industry: "electrical", state: null, estimated_merchant_count: 500 },
  { source_url: "https://www.kohlerpower.com/home-generators/dealer-locator", source_name: "Kohler Generator Dealer Locator", source_type: "contractor_listing", industry: "electrical", state: null, estimated_merchant_count: 300 },
  { source_url: "https://www.eaton.com/us/en-us/locator.html", source_name: "Eaton Partner Locator", source_type: "contractor_listing", industry: "electrical", state: null, estimated_merchant_count: 300 },
  { source_url: "https://www.tesla.com/support/certified-installers", source_name: "Tesla Certified Installer Directory", source_type: "contractor_listing", industry: "electrical", state: null, estimated_merchant_count: 250 },
  { source_url: "https://www.abc.org/Chapter-Locator", source_name: "ABC Chapter Locator", source_type: "association", industry: "construction", state: null, estimated_merchant_count: 100 },
  { source_url: "https://www.nahb.org/nahb-community/find-a-member", source_name: "NAHB Member Directory", source_type: "association", industry: "construction", state: null, estimated_merchant_count: 800 },
  { source_url: "https://www.nari.org/homeowners/find-a-remodeler", source_name: "NARI Find a Remodeler", source_type: "association", industry: "construction", state: null, estimated_merchant_count: 500 },
  { source_url: "https://www.agc.org/connect/chapters", source_name: "AGC Chapter Member Network", source_type: "association", industry: "commercial_contractors", state: null, estimated_merchant_count: 200 },
  { source_url: "https://safer.fmcsa.dot.gov/CompanySnapshot.aspx", source_name: "FMCSA Company Snapshot", source_type: "directory", industry: "trucking", state: null, estimated_merchant_count: 1000 },
  { source_url: "https://ai.fmcsa.dot.gov/SMS/CarrierSearch", source_name: "FMCSA SMS Carrier Search", source_type: "directory", industry: "trucking", state: null, estimated_merchant_count: 1000 },
  { source_url: "https://www.quicktransportsolutions.com/truckingcompany/", source_name: "QuickTSI Trucking Company Directory", source_type: "directory", industry: "trucking", state: null, estimated_merchant_count: 1000 },
  { source_url: "https://www.aa.com/autorepair/locations", source_name: "AAA Approved Auto Repair Locator", source_type: "contractor_listing", industry: "auto_repair", state: null, estimated_merchant_count: 500 },
  { source_url: "https://www.napaautocare.com/en/auto-care-centers", source_name: "NAPA Auto Care Center Locator", source_type: "contractor_listing", industry: "auto_repair", state: null, estimated_merchant_count: 500 },
  { source_url: "https://www.boschcarservice.com/us/en/workshop-search/", source_name: "Bosch Car Service Workshop Search", source_type: "contractor_listing", industry: "auto_repair", state: null, estimated_merchant_count: 300 },
  { source_url: "https://www.repairpal.com/repair-shops", source_name: "RepairPal Certified Shop Directory", source_type: "directory", industry: "auto_repair", state: null, estimated_merchant_count: 500 },
  { source_url: "https://www.ase.com/repair-centers", source_name: "ASE Blue Seal Repair Center Locator", source_type: "contractor_listing", industry: "auto_repair", state: null, estimated_merchant_count: 300 },
  { source_url: "https://www.iicrc.org/page/IICRCGlobalLocator", source_name: "IICRC Global Locator", source_type: "contractor_listing", industry: "restoration", state: null, estimated_merchant_count: 500 },
  { source_url: "https://www.restorationindustry.org/find-a-restorer", source_name: "Restoration Industry Association Find a Restorer", source_type: "association", industry: "restoration", state: null, estimated_merchant_count: 300 },
  { source_url: "https://www.contractorconnection.com/find-a-contractor/", source_name: "Contractor Connection Find a Contractor", source_type: "contractor_listing", industry: "restoration", state: null, estimated_merchant_count: 500 },
  { source_url: "https://www.landscapeprofessionals.org/LP/Connect/Find_a_Landscape_Professional/LP/Connect/Find_A_Landscape_Professional.aspx", source_name: "NALP Find a Landscape Professional", source_type: "association", industry: "landscaping", state: null, estimated_merchant_count: 500 },
  { source_url: "https://www.tcia.org/TCIA/Find_Qualified_Tree_Care/TCIA/Find_Qualified_Tree_Care.aspx", source_name: "TCIA Qualified Tree Care Directory", source_type: "association", industry: "landscaping", state: null, estimated_merchant_count: 300 },
  { source_url: "https://www.irrigation.org/IA/Find_a_Professional/IA/Find_a_Professional.aspx", source_name: "Irrigation Association Find a Professional", source_type: "association", industry: "landscaping", state: null, estimated_merchant_count: 300 }
];

const CHAMBER_DISCOVERY_MARKETS = [
  ["Texas", "TX", "dallas"],
  ["Texas", "TX", "houston"],
  ["Florida", "FL", "tampa"],
  ["Florida", "FL", "orlando"],
  ["Georgia", "GA", "atlanta"],
  ["North Carolina", "NC", "charlotte"],
  ["Arizona", "AZ", "phoenix"],
  ["Ohio", "OH", "columbus"],
  ["Tennessee", "TN", "nashville"],
  ["Colorado", "CO", "denver"]
] as const;

const CHAMBER_DISCOVERY_CATEGORIES = [
  ["roofing", "roofing-contractor"],
  ["hvac", "hvac-contractor"],
  ["plumbing", "plumber"],
  ["electrical", "electrician"],
  ["construction", "general-contractor"],
  ["trucking", "trucking-company"],
  ["auto_repair", "auto-repair-shop"],
  ["restoration", "water-damage-restoration-service"],
  ["landscaping", "landscaper"],
  ["commercial_services", "commercial-cleaning-service"]
] as const;

const SOURCE_SEARCH_TERMS = [
  "member directory",
  "find a contractor",
  "contractor directory",
  "contractor locator",
  "find a member",
  "business directory",
  "member search",
  "company directory",
  "dealer locator",
  "service provider directory",
  "accredited contractors",
  "licensed contractors"
];

export async function runMerchantSourceDiscovery(input: { limit?: number; offset?: number; timeBudgetMs?: number; industries?: string[] } = {}) {
  const industries = input.industries?.length ? input.industries : TARGET_INDUSTRIES;
  const limit = Math.min(input.limit ?? 20, 150);
  const offset = Math.max(0, input.offset ?? 0);
  const startedAt = Date.now();
  const timeBudgetMs = Math.min(Math.max(input.timeBudgetMs ?? 45_000, 10_000), 55_000);
  const run = await acquisitionRepository.createMerchantSourceDiscoveryRun({
    status: "running",
    target_industries: industries,
    metadata: {
      mode: "candidate_only",
      source: "merchant_intelligence_library",
      search_terms: SOURCE_SEARCH_TERMS,
      priority_geography: "United States",
      offset,
      time_budget_ms: timeBudgetMs
    } as Json
  });

  const existing = await acquisitionRepository.listMerchantSources({ limit: 1000 });
  const existingUrls = new Set(existing.map((source) => normalizeUrl(source.source_url)));
  const selected = buildSourceCandidateLibrary()
    .filter((candidate) => industries.includes(candidate.industry))
    .slice(offset, offset + limit);
  const stored = [];
  const duplicates = [];
  const blockedOrUnreachable = [];
  const errors: string[] = [];
  let stoppedDueToTimeBudget = false;

  for (const candidate of selected) {
    if (Date.now() - startedAt > timeBudgetMs) {
      stoppedDueToTimeBudget = true;
      break;
    }

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
      offset,
      time_budget_ms: timeBudgetMs,
      stopped_due_to_time_budget: stoppedDueToTimeBudget,
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
    stopped_due_to_time_budget: stoppedDueToTimeBudget,
    errors
  };
}

export async function testMerchantSource(
  sourceId: string,
  limit = 10,
  options: { sourceTimeoutMs?: number; pageTimeoutMs?: number; detailTimeoutMs?: number; maxPages?: number } = {}
) {
  const sources = await acquisitionRepository.listMerchantSources({ limit: 1000 });
  const source = sources.find((candidate) => candidate.id === sourceId);
  if (!source) throw new Error(`Merchant source not found: ${sourceId}`);
  const adapterKey = sourceToAdapterKey(source);
  const discovery = await getAcquisitionAdapter(adapterKey).discover({
    urls: [source.source_url],
    category: source.industry,
    location: source.state ?? undefined,
    limit: Math.min(limit, 10),
    sourceTimeoutMs: options.sourceTimeoutMs,
    pageTimeoutMs: options.pageTimeoutMs,
    detailTimeoutMs: options.detailTimeoutMs,
    maxPages: options.maxPages
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
  const extraction = page.accessible && robots.accessible
    ? {
        discovered: page.business_like_link_count,
        validated: page.business_like_link_count >= 3 ? Math.min(5, page.business_like_link_count) : 0,
        duplicates: 0,
        falsePositives: page.business_like_link_count === 0 ? 1 : 0,
        errors: [] as string[]
      }
    : { discovered: 0, validated: 0, duplicates: 0, falsePositives: 0, errors: [] as string[] };
  const extractionCompatibility = extraction.discovered >= 5 ? 90 : extraction.discovered >= 2 ? 70 : page.link_count >= 25 ? 45 : page.link_count >= 10 ? 30 : 10;
  const duplicateRate = percentage(extraction.duplicates, Math.max(extraction.discovered + extraction.duplicates, 1));
  const verifiedRate = percentage(extraction.validated, Math.max(extraction.discovered, 1));
  const falsePositiveRate = percentage(extraction.falsePositives, Math.max(extraction.discovered, 1));
  const sourceQuality = Math.min(100,
    20 +
    (robots.accessible ? 20 : 0) +
    (page.accessible ? 20 : 0) +
    extractionCompatibility * 0.25 +
    Math.min(20, extraction.validated * 8) +
    Math.min(10, extraction.discovered * 2) -
    Math.min(25, Math.round(duplicateRate / 4)) -
    Math.min(20, Math.round(falsePositiveRate / 5))
  );
  const confidence = Math.min(100, Math.round((sourceQuality + extractionCompatibility + (robots.accessible ? 80 : 20)) / 3));
  return {
    website_accessible: page.accessible,
    robots_accessible: robots.accessible,
    source_quality_score: Math.round(sourceQuality),
    estimated_merchant_count: candidate.estimated_merchant_count,
    extraction_compatibility_score: extractionCompatibility,
    confidence_score: confidence,
    acquisition_yield_score: calculateYieldScore({
      businessesDiscovered: extraction.discovered,
      businessesValidated: extraction.validated,
      duplicateRate,
      robotsBlocked: !robots.accessible
    }),
    evidence: {
      robots_status: robots.status,
      page_status: page.status,
      link_count: page.link_count,
      business_like_link_count: page.business_like_link_count,
      phone_count: page.phone_count,
      email_count: page.email_count,
      title: page.title,
      extraction_discovered: extraction.discovered,
      extraction_validated: extraction.validated,
      duplicate_rate: duplicateRate,
      verified_rate: verifiedRate,
      false_positive_rate: falsePositiveRate,
      extraction_errors: extraction.errors
    }
  };
}

async function probeSourceExtraction(candidate: IntelligenceSourceCandidate) {
  try {
    const adapterKey = sourceToAdapterKey(candidate as MerchantAcquisitionSource);
    const discovery = await getAcquisitionAdapter(adapterKey).discover({
      urls: [candidate.source_url],
      category: candidate.industry,
      location: candidate.state ?? undefined,
      limit: 8
    });
    const deduped = deduplicateAcquisitionRecords(discovery.records);
    let validated = 0;
    let falsePositives = 0;
    for (const record of deduped.unique.slice(0, 8)) {
      const normalized = normalizeBusinessLead(record);
      const quality = scoreLeadQuality(normalized, candidate.industry, { uniqueDomain: true });
      if (normalized.website_url && normalized.domain && normalized.phone && quality.score >= 80) validated += 1;
      if (!normalized.website_url || !normalized.domain || quality.score < 45) falsePositives += 1;
    }
    return {
      discovered: discovery.records.length,
      validated,
      duplicates: deduped.duplicates.length,
      falsePositives,
      errors: discovery.errors
    };
  } catch (error) {
    return {
      discovered: 0,
      validated: 0,
      duplicates: 0,
      falsePositives: 0,
      errors: [error instanceof Error ? error.message : String(error || "source probe failed")]
    };
  }
}

function buildSourceCandidateLibrary() {
  const chamberCandidates = CHAMBER_DISCOVERY_MARKETS.flatMap(([stateName, state, city]) =>
    CHAMBER_DISCOVERY_CATEGORIES.map(([industry, category]) => ({
      source_url: `https://www.chamberofcommerce.com/business-directory/${stateName.toLowerCase().replace(/\s+/g, "-")}/${city}/${category}`,
      source_name: `${titleCase(city)} ${titleCase(industry.replace(/_/g, " "))} - Chamber`,
      source_type: "directory" as const,
      industry,
      state,
      estimated_merchant_count: 75
    }))
  );
  const all = [...SOURCE_CANDIDATE_LIBRARY, ...FRESH_SOURCE_CANDIDATE_LIBRARY, ...chamberCandidates];
  const seen = new Set<string>();
  return all.filter((candidate) => {
    const key = normalizeUrl(candidate.source_url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    if (!response.ok) return { accessible: false, status: response.status, link_count: 0, business_like_link_count: 0, phone_count: 0, email_count: 0, title: null };
    const html = (await response.text()).slice(0, 500_000);
    const base = new URL(response.url || sourceUrl);
    return {
      accessible: true,
      status: response.status,
      link_count: [...html.matchAll(/<a\b/gi)].length,
      business_like_link_count: countBusinessLikeLinks(html, base),
      phone_count: [...html.matchAll(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g)].length,
      email_count: [...html.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].length,
      title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim().slice(0, 120) ?? null
    };
  } catch {
    return { accessible: false, status: null, link_count: 0, business_like_link_count: 0, phone_count: 0, email_count: 0, title: null };
  }
}

function countBusinessLikeLinks(html: string, baseUrl: URL) {
  const hosts = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(match[1] ?? "", baseUrl);
      const label = stripTags(match[2] ?? "");
      if (!["http:", "https:"].includes(url.protocol)) continue;
      if (sameRegistrableHost(url.hostname, baseUrl.hostname)) continue;
      if (isNonBusinessDiscoveryHost(url.hostname)) continue;
      if (/^(home|login|sign in|facebook|instagram|linkedin|twitter|privacy|terms|email|website)$/i.test(label.trim())) continue;
      hosts.add(url.hostname.replace(/^www\./i, "").toLowerCase());
    } catch {
      continue;
    }
  }
  return hosts.size;
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

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function sameRegistrableHost(left: string, right: string) {
  return registrableHost(left) === registrableHost(right);
}

function registrableHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "").split(".").slice(-2).join(".");
}

function isNonBusinessDiscoveryHost(hostname: string) {
  return /(facebook|instagram|linkedin|twitter|x\.com|youtube|google|bing|yelp|bbb|chamberofcommerce|growthzone|yourmembership|higherlogic|mailchimp|constantcontact|wixpress)\./i.test(hostname);
}
