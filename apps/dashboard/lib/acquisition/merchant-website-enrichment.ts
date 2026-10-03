import type { Json, MerchantAcquisitionCandidate, MerchantAcquisitionSource } from "@operion/shared";
import {
  assertBudgetAvailable,
  boundedNumber,
  boundedTimeoutMs,
  createRunBudget,
  runWithConcurrency,
  type AcquisitionRunBudget
} from "@/lib/acquisition/runtime-controls";
import { acquisitionRepository } from "@/lib/repositories/acquisition";

const USER_AGENT = "OperionCapital-MerchantWebsiteEnrichment/1.0";
const ENRICHMENT_PATHS = ["/", "/contact", "/about", "/about-us"];
const DEFAULT_ENRICHMENT_TIMEOUT_MS = 15_000;
const DEFAULT_ENRICHMENT_CONCURRENCY = 4;

interface DiscoveredMerchantCandidate {
  business_name: string;
  website_url: string;
  domain: string;
  source_phone: string | null;
}

export interface MerchantWebsiteEnrichmentResult {
  source_name: string;
  candidates_enriched: number;
  phones_found: number;
  emails_found: number;
  verified_merchants: number;
  projected_crm_imports: number;
  samples: Array<{
    business_name: string;
    website_url: string;
    business_phone: string | null;
    business_email: string | null;
    contact_page_url: string | null;
    quality_score: number;
    enrichment_status: string;
  }>;
}

export async function enrichMerchantWebsitesForSource(sourceName: string, limit = 50): Promise<MerchantWebsiteEnrichmentResult> {
  const sources = await acquisitionRepository.listMerchantSources({ activeOnly: true, limit: 200 });
  const source = sources.find((candidate) => candidate.source_name === sourceName);
  if (!source) throw new Error(`Merchant acquisition source not found: ${sourceName}`);

  const candidates = await discoverSourceCandidates(source, limit);
  const concurrency = boundedNumber(process.env.MERCHANT_ACQUISITION_CONCURRENCY, DEFAULT_ENRICHMENT_CONCURRENCY, 1, 5);
  const enriched = await runWithConcurrency(candidates.slice(0, limit), concurrency, async (candidate) => {
    const stored = await acquisitionRepository.upsertMerchantCandidate({
      source_id: source.id,
      business_name: candidate.business_name,
      website_url: candidate.website_url,
      domain: candidate.domain,
      industry: source.industry,
      state: source.state,
      source_phone: candidate.source_phone,
      enrichment_status: "queued",
      raw_payload: { source_url: source.source_url, discovered_from: source.source_name } as Json
    });
    return enrichMerchantAcquisitionCandidate(stored);
  });

  const verified = enriched.filter((candidate) => isImportReady(candidate));
  return {
    source_name: source.source_name,
    candidates_enriched: enriched.length,
    phones_found: enriched.filter((candidate) => candidate.phone_verified).length,
    emails_found: enriched.filter((candidate) => candidate.email_found).length,
    verified_merchants: verified.length,
    projected_crm_imports: verified.length,
    samples: enriched.slice(0, 15).map((candidate) => ({
      business_name: candidate.business_name,
      website_url: candidate.website_url,
      business_phone: candidate.business_phone,
      business_email: candidate.business_email,
      contact_page_url: candidate.contact_page_url,
      quality_score: candidate.quality_score,
      enrichment_status: candidate.enrichment_status
    }))
  };
}

export async function enrichMerchantAcquisitionCandidate(
  candidate: MerchantAcquisitionCandidate,
  options: { timeoutMs?: number; sourcePhone?: string | null; sourceDomain?: string | null } = {}
) {
  const attemptCount = Number(candidate.attempt_count ?? 0) + 1;
  await acquisitionRepository.updateMerchantCandidate(candidate.id, {
    enrichment_status: "running",
    attempt_count: attemptCount,
    last_attempt_at: new Date().toISOString(),
    last_error: null
  });
  try {
    const timeoutMs = options.timeoutMs ?? boundedNumber(
      process.env.MERCHANT_ACQUISITION_ENRICHMENT_TIMEOUT_MS,
      DEFAULT_ENRICHMENT_TIMEOUT_MS,
      5_000,
      30_000
    );
    const budget = createRunBudget(timeoutMs);
    const evidence = await collectWebsiteEvidence(candidate.website_url, budget);
    const identityMatch = businessIdentityMatches(candidate.business_name, evidence.text, candidate.domain);
    const phone = normalizeUsPhone(evidence.phone);
    const sourcePhone = normalizeUsPhone(options.sourcePhone ?? candidate.source_phone);
    const websiteVerified = evidence.websiteVerified;
    const cleanEmail = isPlaceholderEmail(evidence.email) ? null : evidence.email;
    const emailFound = Boolean(cleanEmail);
    const falsePositive = isGenericSourceLinkName(candidate.business_name)
      || isNonBusinessHost(candidate.domain)
      || looksLikePhoneNumberName(candidate.business_name);
    const selectedPhone = phone ?? (websiteVerified && identityMatch && !falsePositive ? sourcePhone : null);
    const phoneVerified = Boolean(selectedPhone) && isValidUsPhone(selectedPhone);
    const score = scoreCandidate({
      websiteVerified,
      phoneVerified,
      emailFound,
      identityMatch,
      industry: candidate.industry
    });
    const status = websiteVerified && phoneVerified && identityMatch && score >= 80 && !falsePositive ? "completed" : "rejected";
    const rejectionReason = status === "completed"
      ? null
      : [
          websiteVerified ? null : "website not reachable",
          phoneVerified ? null : "business phone not found",
          identityMatch ? null : "business identity did not match source",
          falsePositive ? "non-merchant or directory/platform page" : null,
          score >= 80 ? null : "quality score below 80"
        ].filter(Boolean).join("; ");
    const failureCode = status === "completed" ? null : classifyEnrichmentFailure(rejectionReason);

    return await acquisitionRepository.updateMerchantCandidate(candidate.id, {
      business_phone: selectedPhone ?? null,
      business_email: cleanEmail,
      contact_page_url: evidence.contactPageUrl,
      company_description: evidence.description,
      website_verified: websiteVerified,
      phone_verified: phoneVerified,
      email_found: emailFound,
      identity_match: identityMatch,
      enrichment_status: status,
      import_review_status: status === "rejected" ? "rejected" : candidate.import_review_status,
      quality_score: score,
      rejection_reason: rejectionReason,
      failure_reason_code: failureCode,
      next_retry_at: null,
      last_error: rejectionReason,
      last_enriched_at: new Date().toISOString(),
      raw_payload: {
        ...(candidate.raw_payload && typeof candidate.raw_payload === "object" && !Array.isArray(candidate.raw_payload) ? candidate.raw_payload : {}),
        enrichment_paths_checked: evidence.pathsChecked,
        website_status: evidence.statuses,
        enrichment_timeout_ms: timeoutMs,
        enrichment_stopped_early: evidence.stoppedEarly,
        source_phone_used: Boolean(sourcePhone && !phone && selectedPhone === sourcePhone),
        source_phone_rejected: Boolean(sourcePhone && !selectedPhone)
      } as Json
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown website enrichment error";
    const failureCode = classifyEnrichmentFailure(message);
    const retryable = failureCode === "WEBSITE_TIMEOUT" || failureCode === "WEBSITE_HTTP_ERROR";
    return acquisitionRepository.updateMerchantCandidate(candidate.id, {
      enrichment_status: "failed",
      rejection_reason: message,
      failure_reason_code: failureCode,
      last_error: message,
      next_retry_at: retryable && attemptCount < 3 ? nextRetryAt(attemptCount) : null,
      import_review_status: attemptCount >= 3 ? "rejected" : candidate.import_review_status,
      last_enriched_at: new Date().toISOString(),
      raw_payload: {
        ...(candidate.raw_payload && typeof candidate.raw_payload === "object" && !Array.isArray(candidate.raw_payload) ? candidate.raw_payload : {}),
        enrichment_failure_code: failureCode,
        bounded_retry: retryable,
        attempt_count: attemptCount
      } as Json
    });
  }
}

async function discoverSourceCandidates(source: MerchantAcquisitionSource, limit: number) {
  const response = await fetch(source.source_url, {
    headers: { "user-agent": USER_AGENT },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`${source.source_name} returned HTTP ${response.status}`);
  const html = (await response.text()).slice(0, 2_000_000);
  const baseUrl = new URL(response.url || source.source_url);
  const candidates: DiscoveredMerchantCandidate[] = [];
  for (const link of extractLinks(html, baseUrl)) {
    if (candidates.length >= limit) break;
    if (!isIndependentBusinessUrl(link.url, source.source_url)) continue;
    const context = html.slice(Math.max(0, link.index - 2_500), Math.min(html.length, link.index + 3_500));
    const businessName = cleanBusinessName(link.text, link.url);
    if (!businessName || isGenericSourceLinkName(businessName)) continue;
    const domain = normalizeHost(link.url.href);
    if (!domain || candidates.some((candidate) => candidate.domain === domain)) continue;
    candidates.push({
      business_name: businessName,
      website_url: link.url.origin,
      domain,
      source_phone: findPhone(context)
    });
  }
  return candidates;
}

async function collectWebsiteEvidence(websiteUrl: string, budget?: AcquisitionRunBudget) {
  const root = new URL(websiteUrl);
  const statuses: Record<string, number | null> = {};
  const pathsChecked = [];
  let combinedText = "";
  let phone: string | null = null;
  let email: string | null = null;
  let contactPageUrl: string | null = null;
  let description: string | null = null;
  let websiteVerified = false;
  let stoppedEarly = false;

  for (const path of ENRICHMENT_PATHS) {
    assertBudgetAvailable(budget, "website enrichment");
    const url = new URL(path, root.origin);
    pathsChecked.push(url.toString());
    try {
      const response = await fetch(url, {
        headers: { "user-agent": USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(boundedTimeoutMs(8_000, budget))
      });
      statuses[url.toString()] = response.status;
      if (!response.ok) continue;
      websiteVerified = true;
      const html = (await response.text()).slice(0, 300_000);
      const text = stripTags(html);
      combinedText += ` ${text}`;
      phone = phone ?? findPhone(html);
      email = email ?? findEmail(html);
      description = description ?? findDescription(html, text);
      if (!contactPageUrl && path.includes("contact")) contactPageUrl = response.url;
      if (websiteVerified && phone && businessPageHasIdentitySignal(text, root.hostname) && (email || path.includes("contact"))) {
        stoppedEarly = true;
        break;
      }
    } catch {
      statuses[url.toString()] = null;
    }
  }

  return {
    websiteVerified,
    phone,
    email,
    contactPageUrl,
    description,
    text: combinedText,
    pathsChecked,
    statuses,
    stoppedEarly
  };
}

function extractLinks(html: string, baseUrl: URL) {
  const links: Array<{ url: URL; text: string; index: number }> = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(decodeEntities(safeDecodeURIComponent(match[1] ?? "")), baseUrl);
      if (["http:", "https:"].includes(url.protocol)) {
        links.push({ url, text: decodeEntities(match[2] ?? ""), index: match.index ?? 0 });
      }
    } catch {
      continue;
    }
  }
  return links;
}

function isIndependentBusinessUrl(candidate: URL, sourceUrl: string) {
  return registrablePart(candidate.hostname) !== registrablePart(new URL(sourceUrl).hostname)
    && !isNonBusinessHost(candidate.hostname)
    && !/\/(?:login|signin|search|category|categories)(?:\/|$)/i.test(candidate.pathname);
}

function cleanBusinessName(text: string, url: URL) {
  const value = decodeEntities(text).replace(/\s+/g, " ").trim();
  if (value.length >= 3 && value.length <= 90 && !/^(home|website|visit website|learn more|read more|click here|contact|view|more|full|email)$/i.test(value)) {
    return value;
  }
  const hostPart = url.hostname.replace(/^www\./i, "").split(".")[0]?.replace(/[-_]+/g, " ").trim();
  return hostPart && hostPart.length >= 3 ? hostPart : null;
}

function businessIdentityMatches(name: string, text: string, domain: string) {
  const normalizedText = normalizeText(text);
  const nameTokens = normalizeText(name).split(" ").filter((token) => token.length >= 4);
  const domainToken = normalizeText(domain.split(".")[0] ?? "").split(" ").find((token) => token.length >= 4);
  return nameTokens.some((token) => normalizedText.includes(token)) || Boolean(domainToken && normalizedText.includes(domainToken));
}

function scoreCandidate(input: { websiteVerified: boolean; phoneVerified: boolean; emailFound: boolean; identityMatch: boolean; industry: string }) {
  let score = 0;
  if (input.websiteVerified) score += 35;
  if (input.phoneVerified) score += 35;
  if (input.emailFound) score += 10;
  if (input.identityMatch) score += 15;
  if (input.industry) score += 5;
  return Math.min(100, score);
}

function isImportReady(candidate: MerchantAcquisitionCandidate) {
  return candidate.website_verified &&
    candidate.phone_verified &&
    candidate.identity_match &&
    candidate.quality_score >= 80 &&
    !isGenericSourceLinkName(candidate.business_name) &&
    !isNonBusinessHost(candidate.domain) &&
    !isPlaceholderEmail(candidate.business_email);
}

function findPhone(value: string) {
  const tel = value.match(/tel:([^"'? >]+)/i)?.[1];
  if (tel) return safeDecodeURIComponent(tel);
  return value.match(/((?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})/)?.[1] ?? null;
}

function findEmail(value: string) {
  const mailto = value.match(/mailto:([^"'? >]+)/i)?.[1];
  const candidate = mailto ? safeDecodeURIComponent(mailto) : value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  return isUsefulEmail(candidate) ? candidate : null;
}

function isUsefulEmail(value: string | null) {
  return Boolean(value)
    && !/^user@domain\.com$/i.test(value ?? "")
    && !/sentry-next\.wixpress\.com$/i.test(value ?? "")
    && !isPlaceholderEmail(value)
    && !/\.(png|jpe?g|gif|svg|webp)$/i.test(value ?? "");
}

function findDescription(html: string, fallbackText: string) {
  const meta = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1];
  return decodeEntities(meta ?? fallbackText).slice(0, 500) || null;
}

function isValidUsPhone(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

function normalizeUsPhone(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return null;
}

function isNonBusinessHost(hostname: string) {
  return /(facebook|instagram|linkedin|twitter|x\.com|youtube|google|bing|yelp|bbb|chamberofcommerce|chamberorganizer|growthzone|zoho|mapquest|apple|constantcontact|mailchimp|authorize|paypal|emailmeform|thinkific|flashpoint|typeform|memberclicks|termsfeed|texas|txdot|govdelivery)\./i.test(hostname)
    || /(?:^|\.)ieci\.org$/i.test(hostname)
    || /(?:^|\.)gotomyunion\.com$/i.test(hostname)
    || /(?:^|\.)tdlr\.texas\.gov$/i.test(hostname)
    || /(?:^|\.)goo\.gl$/i.test(hostname)
    || /\.(gov|edu)$/i.test(hostname)
    || /\b(nrca|nationalroofingdirectory|mycrowdwisdom|blob\.core\.windows|confirmsubscription|roofingalliance|professionalroofing|everybodyneedsaroof|careersinroofing|livechat|givelively|phccweb|webpolicyportal|b2clogin|hubs\.li|hvacindustrymarketplace|aimg|higherlogic|emflipbooks|yourmembership|browsehappy|flickr|sunbeltbuildersshow|texasbuildersfoundation|tabproductdepot|growthzonecms|gilmoreglobal|standardindustries|members1st|saferoofsovertexas|bimsmith|leverage\.gallery|capitol\.texas)\b/i.test(hostname);
}

function isGenericSourceLinkName(value: string) {
  return /\b(?:be safe\.?\s*be smart\.?\s*hire a phcc professional|our sponsors|national roofing directory|find a contractor|find an iec chapter|health and welfare office|drug testing portal|make-up classes|tdlr renew|update company information|renew your license|class|portal|chapter|my courses|benefits|catalog|subscribe|roofing alliance|professional roofing|everybody needs a roof|careers in roofing|tiktok|chat with us|donate|search our national database|privacy policy|member login|join acca|marketplace|website by|powered by|membership directory|yourmembership|upgrade your browser|photos|sunbelt builders show|foundation|product depot|current bylaws|members$|get in touch|for the next 24 hours|evacuations|active fire|document before you discard|useful links|standards and field guides|legislative fly-in|upcoming events|annual sponsors|details|territory manager|roofing fraud|applicable texas codes|important website information|main navigation|resources|helpful tools|connect with us)\b/i.test(value)
    || looksLikePhoneNumberName(value);
}

function isPlaceholderEmail(value: string | null) {
  return /(@company\.com|@companyname\.com|example@domain\.com|latinotype\.com)$/i.test(value ?? "");
}

function looksLikePhoneNumberName(value: string) {
  return /^\s*(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/i.test(value)
    || /\b(?:toll free|fax)\b/i.test(value);
}

function classifyEnrichmentFailure(message: string | null) {
  const value = (message ?? "").toLowerCase();
  if (/timed out|timeout|aborted/.test(value)) return "WEBSITE_TIMEOUT";
  if (/http\s?\d{3}|not reachable|fetch failed|website not reachable/.test(value)) return "WEBSITE_HTTP_ERROR";
  if (/identity/.test(value)) return "IDENTITY_MISMATCH";
  if (/invalid phone/.test(value)) return "PHONE_INVALID";
  if (/phone.*not found|no phone|business phone not found/.test(value)) return "NO_PHONE";
  if (/independent website|website missing/.test(value)) return "NO_INDEPENDENT_WEBSITE";
  if (/false positive|non-merchant|directory\/platform|generic/.test(value)) return "FALSE_POSITIVE";
  if (/source data/.test(value)) return "SOURCE_DATA_INVALID";
  if (/parse|parser/.test(value)) return "PARSER_ERROR";
  return "SOURCE_DATA_INVALID";
}

function nextRetryAt(attemptCount: number) {
  const hours = attemptCount <= 1 ? 6 : 24;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function normalizeHost(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function registrablePart(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "").split(".").slice(-2).join(".");
}

function normalizeText(value: string) {
  return decodeEntities(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function businessPageHasIdentitySignal(text: string, hostname: string) {
  const normalizedText = normalizeText(text);
  const domainToken = normalizeText(hostname.replace(/^www\./, "").split(".")[0] ?? "");
  return Boolean(domainToken && domainToken.length >= 4 && normalizedText.includes(domainToken));
}

function stripTags(value: string) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value: string) {
  return stripTags(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#8217;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
