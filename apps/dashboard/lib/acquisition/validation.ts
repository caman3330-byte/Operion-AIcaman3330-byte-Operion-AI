import { lookup } from "node:dns/promises";
import type { LeadTier } from "@operion/shared";
import type { LeadQualityScore } from "@/lib/acquisition/scoring";
import { isMcaPriorityIndustry } from "@/lib/acquisition/industry-profiles";

export type LeadValidationStatus = "verified" | "unverified" | "invalid";

export interface LeadValidationInput {
  businessName: string;
  websiteUrl: string | null;
  email: string | null;
  phone: string | null;
  businessCategory?: string | null | undefined;
  source?: string | null | undefined;
  sourcePageUrl?: string | null | undefined;
}

export interface LeadValidationResult {
  status: LeadValidationStatus;
  website_verified: boolean;
  email_verified: boolean;
  phone_verified: boolean;
  business_verified: boolean;
  validation_score: number;
  validation_reason: string;
  validation_timestamp: string;
  flags: {
    dns_exists: boolean;
    http_status: number | null;
    parked_domain: boolean;
    domain_for_sale: boolean;
    coming_soon: boolean;
    placeholder_site: boolean;
    suspended_site: boolean;
    fake_ai_domain: boolean;
  };
}

const INVALID_PATTERNS = [
  /\bdomain (?:is )?for sale\b/i,
  /\bbuy this domain\b/i,
  /\bthis domain may be for sale\b/i,
  /\bmake an offer\b/i,
  /\bparkingcrew\b/i,
  /\bsedo\b/i,
  /\bdan\.com\b/i,
  /\bafternic\b/i,
  /\bgodaddy (?:parking|auctions|domain)\b/i,
  /\bnamecheap parking\b/i,
  /\bsuspended\b/i,
  /\baccount has been suspended\b/i
];

const PARKED_PATTERNS = [
  /\bparked (?:free|domain)\b/i,
  /\bthis domain is parked\b/i,
  /\brelated searches\b/i,
  /\bsponsored listings\b/i,
  /\bdomain parking\b/i
];

const PLACEHOLDER_PATTERNS = [
  /\bcoming soon\b/i,
  /\blaunching soon\b/i,
  /\bunder construction\b/i,
  /\bsite coming soon\b/i,
  /\bdefault page\b/i,
  /\bjust another wordpress site\b/i,
  /\bthere has been a critical error on this website\b/i,
  /\bindex of \//i
];

export async function validateAcquisitionLead(input: LeadValidationInput): Promise<LeadValidationResult> {
  const timestamp = new Date().toISOString();
  const url = normalizeUrl(input.websiteUrl);
  const source = (input.source ?? "").toLowerCase();
  const phoneVerified = isValidUsPhone(input.phone);
  const emailVerified = isValidEmail(input.email);
  const genericName = isGenericBusinessName(input.businessName);

  if (genericName) {
    return buildResult({
      status: "invalid",
      timestamp,
      phoneVerified,
      emailVerified: false,
      websiteVerified: false,
      businessVerified: false,
      score: 0,
      reasons: ["Generic directory or landing-page title is not a business"]
    });
  }

  if (source === "ai_seed") {
    return buildResult({
      status: "invalid",
      timestamp,
      phoneVerified,
      emailVerified: false,
      websiteVerified: false,
      businessVerified: false,
      score: 0,
      reasons: ["AI seed leads are research-only and cannot enter production acquisition queues"],
      flags: { fake_ai_domain: true }
    });
  }

  if (!url) {
    return buildResult({
      status: "unverified",
      timestamp,
      phoneVerified,
      emailVerified,
      websiteVerified: false,
      businessVerified: false,
      score: phoneVerified || emailVerified ? 30 : 10,
      reasons: ["No valid website URL available for business validation"]
    });
  }

  const hostname = extractHostname(url);
  if (!hostname) {
    return buildResult({
      status: "unverified",
      timestamp,
      phoneVerified,
      emailVerified,
      websiteVerified: false,
      businessVerified: false,
      score: phoneVerified || emailVerified ? 30 : 10,
      reasons: ["Website URL could not be parsed"]
    });
  }

  const sourceHostname = input.sourcePageUrl ? extractHostname(input.sourcePageUrl) : null;
  if (sourceHostname && hostname === sourceHostname && isDirectorySource(source)) {
    return buildResult({
      status: "invalid",
      timestamp,
      phoneVerified,
      emailVerified: false,
      websiteVerified: false,
      businessVerified: false,
      score: 0,
      reasons: ["Independent company website was not found"]
    });
  }

  if (!phoneVerified) {
    return buildResult({
      status: "invalid",
      timestamp,
      phoneVerified,
      emailVerified: false,
      websiteVerified: false,
      businessVerified: false,
      score: 10,
      reasons: ["Verified phone number is required for a valid MCA acquisition lead"]
    });
  }

  if (!isMcaPriorityIndustry(input.businessCategory)) {
    return buildResult({
      status: "invalid",
      timestamp,
      phoneVerified,
      emailVerified,
      websiteVerified: false,
      businessVerified: false,
      score: 20,
      reasons: ["MCA priority business category was not identified"]
    });
  }

  const dnsExists = await hasDnsRecord(hostname);
  if (!dnsExists) {
    return buildResult({
      status: "invalid",
      timestamp,
      phoneVerified,
      emailVerified: emailVerified && emailMatchesDomain(input.email, hostname),
      websiteVerified: false,
      businessVerified: false,
      score: 0,
      reasons: [`DNS resolution failed for ${hostname}`],
      flags: { dns_exists: false }
    });
  }

  const http = await fetchWebsiteEvidence(url);
  const text = http.text;
  const parkedDomain = matchesAny(text, PARKED_PATTERNS) || isLikelyParkedHost(hostname, text);
  const domainForSale = matchesAny(text, INVALID_PATTERNS.filter((pattern) => /sale|buy|offer|sedo|dan|afternic|godaddy/i.test(pattern.source)));
  const suspendedSite = matchesAny(text, INVALID_PATTERNS.filter((pattern) => /suspended/i.test(pattern.source)));
  const comingSoon = /\b(?:coming soon|launching soon|site coming soon|website coming soon)\b/i.test(text);
  const placeholderSite = matchesAny(text, PLACEHOLDER_PATTERNS) || text.trim().length < 180;
  const websiteVerified = Boolean(http.status && http.status >= 200 && http.status < 400 && !parkedDomain && !domainForSale && !suspendedSite);
  const emailDomainMatch = emailVerified ? emailMatchesDomain(input.email, hostname) : false;

  const flags = {
    dns_exists: dnsExists,
    http_status: http.status,
    parked_domain: parkedDomain,
    domain_for_sale: domainForSale,
    coming_soon: comingSoon,
    placeholder_site: placeholderSite,
    suspended_site: suspendedSite,
    fake_ai_domain: false
  };

  if (!http.status) {
    return buildResult({
      status: "unverified",
      timestamp,
      phoneVerified,
      emailVerified: emailDomainMatch,
      websiteVerified: false,
      businessVerified: false,
      score: 25,
      reasons: [`DNS exists for ${hostname}, but website did not return an HTTP response`],
      flags
    });
  }

  if (http.status >= 400 || parkedDomain || domainForSale || suspendedSite) {
    const reasons = [
      http.status >= 400 ? `Website returned HTTP ${http.status}` : null,
      parkedDomain ? "Parked domain detected" : null,
      domainForSale ? "Domain-for-sale language detected" : null,
      suspendedSite ? "Suspended site language detected" : null
    ].filter(Boolean) as string[];

    return buildResult({
      status: "invalid",
      timestamp,
      phoneVerified,
      emailVerified: emailDomainMatch,
      websiteVerified: false,
      businessVerified: false,
      score: Math.min(20, phoneVerified ? 20 : 10),
      reasons,
      flags
    });
  }

  const businessVerified = websiteVerified && !comingSoon && !placeholderSite && phoneVerified && isMcaPriorityIndustry(input.businessCategory);
  const score =
    20 +
    (websiteVerified ? 25 : 0) +
    (businessVerified ? 25 : 0) +
    (emailDomainMatch ? 15 : 0) +
    (phoneVerified ? 10 : 0) +
    (http.status >= 200 && http.status < 300 ? 5 : 0);

  if (businessVerified) {
    return buildResult({
      status: "verified",
      timestamp,
      phoneVerified,
      emailVerified: emailDomainMatch,
      websiteVerified,
      businessVerified,
      score,
      reasons: [`Website verified at HTTP ${http.status}`, "Phone verified", "MCA priority category identified"],
      flags
    });
  }

  return buildResult({
    status: "unverified",
    timestamp,
    phoneVerified,
    emailVerified: emailDomainMatch,
    websiteVerified,
    businessVerified: false,
    score: Math.min(60, score),
    reasons: [
      comingSoon ? "Coming-soon page detected" : null,
      placeholderSite ? "Placeholder or low-content website detected" : null,
    ].filter(Boolean) as string[],
    flags
  });
}

export function isGenericBusinessName(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (value.includes("${") || value.includes("@") || /^https?:\/\//i.test(value)) return true;
  if ([
    "member directory", "directory", "home", "listings", "categories", "search results",
    "member search", "business directory", "membership directory", "roofing contractors",
    "login", "log in", "sign in", "contact", "contact us", "learn more", "visit website", "member application", "full"
  ].includes(normalized)) return true;
  return /\b(?:sponsorship campaign|member login|directory search|view directory)\b/.test(normalized);
}

function isDirectorySource(source: string) {
  return ["public_business_directories", "chamber_directories", "industry_associations", "public_local_listings"].includes(source);
}

export function applyValidationToQuality(quality: LeadQualityScore, validation: LeadValidationResult): LeadQualityScore {
  if (validation.status === "invalid") {
    return {
      score: Math.min(quality.score, 20),
      tier: "D",
      reasons: [...quality.reasons, validation.validation_reason]
    };
  }

  if (validation.status === "unverified") {
    const score = Math.min(quality.score, 60);
    return {
      score,
      tier: scoreToTierWithValidation(score),
      reasons: [...quality.reasons, validation.validation_reason]
    };
  }

  return quality;
}

function buildResult(input: {
  status: LeadValidationStatus;
  timestamp: string;
  phoneVerified: boolean;
  emailVerified: boolean;
  websiteVerified: boolean;
  businessVerified: boolean;
  score: number;
  reasons: string[];
  flags?: Partial<LeadValidationResult["flags"]>;
}): LeadValidationResult {
  return {
    status: input.status,
    website_verified: input.websiteVerified,
    email_verified: input.emailVerified,
    phone_verified: input.phoneVerified,
    business_verified: input.businessVerified,
    validation_score: Math.max(0, Math.min(100, Math.round(input.score))),
    validation_reason: input.reasons.join("; ") || "Validation completed",
    validation_timestamp: input.timestamp,
    flags: {
      dns_exists: input.flags?.dns_exists ?? false,
      http_status: input.flags?.http_status ?? null,
      parked_domain: input.flags?.parked_domain ?? false,
      domain_for_sale: input.flags?.domain_for_sale ?? false,
      coming_soon: input.flags?.coming_soon ?? false,
      placeholder_site: input.flags?.placeholder_site ?? false,
      suspended_site: input.flags?.suspended_site ?? false,
      fake_ai_domain: input.flags?.fake_ai_domain ?? false
    }
  };
}

async function hasDnsRecord(hostname: string) {
  try {
    await lookup(hostname);
    return true;
  } catch {
    return false;
  }
}

async function fetchWebsiteEvidence(url: string) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: {
        "user-agent": "Operion Capital Lead Validation/1.0"
      }
    });
    const html = await response.text();
    return {
      status: response.status,
      text: html.slice(0, 120_000).toLowerCase()
    };
  } catch {
    return { status: null, text: "" };
  }
}

function normalizeUrl(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProtocol).toString();
  } catch {
    return null;
  }
}

function extractHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function isValidEmail(value: string | null) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function isValidUsPhone(value: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

function emailMatchesDomain(email: string | null, hostname: string) {
  if (!email || !isValidEmail(email)) return false;
  const domain = email.split("@")[1]?.toLowerCase().replace(/^www\./, "");
  if (!domain) return false;
  return domain === hostname || domain.endsWith(`.${hostname}`);
}

function matchesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function isLikelyParkedHost(hostname: string, text: string) {
  return (
    text.includes(`${hostname} is for sale`) ||
    text.includes(`buy ${hostname}`) ||
    text.includes("godaddy.com/domainsearch") ||
    text.includes("namebright.com") ||
    text.includes("hugedomains.com")
  );
}

function scoreToTierWithValidation(score: number): LeadTier {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 45) return "C";
  return "D";
}
