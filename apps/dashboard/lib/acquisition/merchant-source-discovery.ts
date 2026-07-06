import type { Json, MerchantSourceType } from "@operion/shared";
import { acquisitionRepository } from "@/lib/repositories/acquisition";

const DISCOVERY_USER_AGENT = "OperionCapital-MerchantSourceDiscovery/1.0";

type SourceCandidate = {
  source_url: string;
  source_name: string;
  source_type: MerchantSourceType;
  industry: string;
  state: string | null;
};

const STARTER_SOURCE_CANDIDATES: SourceCandidate[] = [
  { source_url: "https://www.ieci.org/member-directory", source_name: "IEC National Member Directory", source_type: "association", industry: "electrical", state: null },
  { source_url: "https://www.necanet.org/member-directory", source_name: "NECA Contractor Directory", source_type: "association", industry: "electrical", state: null },
  { source_url: "https://iecpennsylvania.org/about/member-directory/", source_name: "IEC Pennsylvania Member Directory", source_type: "association", industry: "electrical", state: "PA" },
  { source_url: "https://members.centexiec.com/contractormemberdirectory/FindStartsWith?term=A", source_name: "CenTex IEC Contractor Directory", source_type: "association", industry: "electrical", state: "TX" },
  { source_url: "https://www.phccweb.org/find-a-contractor", source_name: "PHCC National Contractor Locator", source_type: "association", industry: "plumbing", state: null },
  { source_url: "https://www.nahb.org/nahb-community/find-a-member", source_name: "NAHB Member Directory", source_type: "association", industry: "construction", state: null },
  { source_url: "https://www.nari.org/homeowners/find-a-remodeler", source_name: "NARI Remodeler Directory", source_type: "association", industry: "construction", state: null },
  { source_url: "https://www.mcaepa.org/list/searchalpha/a", source_name: "MCA Eastern PA Member Directory", source_type: "association", industry: "construction", state: "PA" },
  { source_url: "https://memberships.cwhba.org/directory", source_name: "Central Washington Builders Directory", source_type: "association", industry: "construction", state: "WA" },
  { source_url: "https://members.cmbaonline.org/member-directory", source_name: "Central Minnesota Builders Directory", source_type: "association", industry: "construction", state: "MN" },
  { source_url: "https://www.metalroofing.com/find-a-contractor/", source_name: "Metal Roofing Alliance Contractor Finder", source_type: "contractor_listing", industry: "roofing", state: null },
  { source_url: "https://www.nationalroofingdirectory.org/", source_name: "National Roofing Directory", source_type: "directory", industry: "roofing", state: null },
  { source_url: "https://www.azroofing.org/find-a-contractor", source_name: "Arizona Roofing Contractors Finder", source_type: "association", industry: "roofing", state: "AZ" },
  { source_url: "https://www.rcat.net/consumers.html", source_name: "RCAT Licensed Roofer Finder", source_type: "association", industry: "roofing", state: "TX" },
  { source_url: "https://www.angi.com/companylist/us/tx/dallas/roofing.htm", source_name: "Angi Dallas Roofing Directory", source_type: "directory", industry: "roofing", state: "TX" },
  { source_url: "https://www.angi.com/companylist/us/fl/tampa/hvac.htm", source_name: "Angi Tampa HVAC Directory", source_type: "directory", industry: "hvac", state: "FL" },
  { source_url: "https://www.angi.com/companylist/us/tx/houston/plumbing.htm", source_name: "Angi Houston Plumbing Directory", source_type: "directory", industry: "plumbing", state: "TX" },
  { source_url: "https://www.bbb.org/us/tx/dallas/category/roofing-contractors", source_name: "BBB Dallas Roofing Contractors", source_type: "directory", industry: "roofing", state: "TX" },
  { source_url: "https://www.bbb.org/us/tx/houston/category/plumbers", source_name: "BBB Houston Plumbers", source_type: "directory", industry: "plumbing", state: "TX" },
  { source_url: "https://www.bbb.org/us/fl/tampa/category/air-conditioning-contractor", source_name: "BBB Tampa HVAC Contractors", source_type: "directory", industry: "hvac", state: "FL" },
  { source_url: "https://www.acca.org/directories/", source_name: "ACCA Directory Hub", source_type: "association", industry: "hvac", state: null },
  { source_url: "https://taccagreatersanantonio.org/contractor-directory/", source_name: "TACCA Greater San Antonio Contractor Directory", source_type: "association", industry: "hvac", state: "TX" },
  { source_url: "https://www.landscapeprofessionals.org/LP/Connect/Find_a_Landscape_Professional/LP/Connect/Find_A_Landscape_Professional.aspx", source_name: "NALP Landscape Professional Finder", source_type: "association", industry: "landscaping", state: null },
  { source_url: "https://www.trucking.org/member-directory", source_name: "ATA Member Directory", source_type: "association", industry: "trucking", state: null },
  { source_url: "https://members.asashop.org/find-a-shop", source_name: "Automotive Service Association Shop Finder", source_type: "association", industry: "auto_repair", state: null },
  { source_url: "https://manufacturingutah.com/member-directory/", source_name: "Utah Manufacturers Association Directory", source_type: "association", industry: "manufacturing", state: "UT" },
  { source_url: "https://trma.org/about-us/member-directory/", source_name: "TRMA Member Directory", source_type: "association", industry: "manufacturing", state: null }
];

export async function discoverMerchantAcquisitionSourceCandidates(limit = 15) {
  const existingSources = await acquisitionRepository.listMerchantSources({ limit: 500 });
  const existingUrls = new Set(existingSources.map((source) => normalizeUrl(source.source_url)));
  const discovered = [];

  for (const candidate of STARTER_SOURCE_CANDIDATES.slice(0, limit)) {
    const normalizedUrl = normalizeUrl(candidate.source_url);
    if (existingUrls.has(normalizedUrl)) {
      discovered.push({ ...candidate, status: "duplicate" as const, http_status: null, stored: false });
      continue;
    }

    const httpStatus = await checkReachability(candidate.source_url);
    if (!httpStatus || httpStatus >= 500) {
      discovered.push({ ...candidate, status: "unreachable" as const, http_status: httpStatus, stored: false });
      continue;
    }

    await acquisitionRepository.upsertMerchantSource({
      ...candidate,
      active: false,
      approval_status: "pending_review",
      health_status: "disabled",
      disabled_reason: "Pending founder approval",
      metadata: {
        discovered_by: "merchant_source_discovery",
        discovery_mode: "candidate_only",
        http_status: httpStatus
      } as Json
    });
    existingUrls.add(normalizedUrl);
    discovered.push({ ...candidate, status: "pending_review" as const, http_status: httpStatus, stored: true });
  }

  return {
    candidates_checked: Math.min(limit, STARTER_SOURCE_CANDIDATES.length),
    candidates_stored: discovered.filter((candidate) => candidate.stored).length,
    duplicates: discovered.filter((candidate) => candidate.status === "duplicate").length,
    unreachable: discovered.filter((candidate) => candidate.status === "unreachable").length,
    candidates: discovered
  };
}

async function checkReachability(url: string) {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": DISCOVERY_USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000)
    });
    return response.status;
  } catch {
    return null;
  }
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
