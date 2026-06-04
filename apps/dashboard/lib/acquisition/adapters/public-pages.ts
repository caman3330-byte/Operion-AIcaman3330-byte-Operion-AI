import { lookup } from "node:dns/promises";
import type { Json } from "@operion/shared";
import { isGenericBusinessName } from "@/lib/acquisition/validation";
import { identifyMcaIndustry } from "@/lib/acquisition/industry-profiles";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/retry";
import type { RawBusinessLead } from "@/lib/acquisition/normalization";
import type {
  AcquisitionAdapterInput,
  AcquisitionAdapterResult,
  AcquisitionSourceAdapter,
  FreeFirstSourceKey
} from "@/lib/acquisition/adapters/types";

const MAX_RESPONSE_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 10_000;

export function createPublicPageAdapter(
  key: Exclude<FreeFirstSourceKey, "apollo" | "google_places">,
  environmentVariable: string
): AcquisitionSourceAdapter {
  return {
    key,
    async discover(input) {
      const configured = parseUrlList(process.env[environmentVariable]);
      const urls = [...new Set([...(input.urls ?? []), ...configured])].slice(0, input.limit);
      const records: RawBusinessLead[] = [];
      const errors: string[] = [];
      const delayMs = boundedNumber(process.env.ACQUISITION_REQUEST_DELAY_MS, 1_000, 250, 10_000);

      for (const rawUrl of urls) {
        try {
          const url = await validatePublicUrl(rawUrl);
          if (!(await isAllowedByRobots(url))) {
            errors.push(`${url.hostname}: blocked by robots.txt`);
            continue;
          }

          const html = await fetchPublicPage(url);
          const extracted = await extractBusinesses(html, url, key, input.category, input.limit - records.length, delayMs);
          records.push(...extracted.records);
          errors.push(...extracted.errors);
          logger.info("acquisition_public_page_processed", { source: key, host: url.hostname, records: records.length });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown public page error";
          errors.push(message);
          logger.warn("acquisition_public_page_failed", { source: key, url: safeUrlForLog(rawUrl), error: message });
        }

        if (records.length >= input.limit) break;
        await sleep(delayMs);
      }

      return {
        sourceKey: key,
        records: records.slice(0, input.limit),
        errors,
        metadata: {
          configured_url_count: configured.length,
          requested_url_count: urls.length,
          robots_respected: true,
          request_delay_ms: delayMs,
          business_level_extraction: true
        } as Json
      };
    }
  };
}

async function extractBusinesses(
  html: string,
  url: URL,
  source: FreeFirstSourceKey,
  fallbackCategory: string | undefined,
  limit: number,
  delayMs: number
): Promise<{ records: RawBusinessLead[]; errors: string[] }> {
  const structured = extractStructuredBusinesses(html, url, source, fallbackCategory)
    .map((record) => hydrateStructuredRecord(record, html, url, source, fallbackCategory))
    .filter((record) => isEligibleExtractedBusiness(record, url, source));
  if (structured.length > 0) return { records: structured.slice(0, limit), errors: [] };
  if (isDirectoryAdapter(source)) {
    return extractDirectoryBusinesses(html, url, source, fallbackCategory, limit, delayMs);
  }

  const title = decodeEntities(matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? url.hostname);
  const heading = decodeEntities(matchFirst(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? title);
  const record = recordFromContext(selectBusinessName(title, heading, url.hostname), url, html, url, source, fallbackCategory, "company_website");
  return { records: isEligibleExtractedBusiness(record, url, source) ? [record] : [], errors: [] };
}

async function extractDirectoryBusinesses(
  html: string,
  directoryUrl: URL,
  source: FreeFirstSourceKey,
  fallbackCategory: string | undefined,
  limit: number,
  delayMs: number
) {
  const records: RawBusinessLead[] = [];
  const errors: string[] = [];
  const links = extractLinks(html, directoryUrl);

  for (const entry of extractMemberEntries(html)) {
    if (records.length >= limit) break;
    const external = extractLinks(entry.html, directoryUrl).find((link) => isIndependentBusinessUrl(link.url, directoryUrl));
    if (!external) continue;
    const record = recordFromContext(entry.name, external.url, entry.html, directoryUrl, source, fallbackCategory, "directory_member_entry");
    if (isEligibleExtractedBusiness(record, directoryUrl, source)) records.push(record);
  }

  const detailLinks = links
    .filter((link) => sameSite(link.url.hostname, directoryUrl.hostname) && isMemberDetailPath(link.url.pathname))
    .filter((link, index, rows) => rows.findIndex((candidate) => candidate.url.toString() === link.url.toString()) === index)
    .slice(0, Math.min(12, limit * 2));

  for (const detail of detailLinks) {
    if (records.length >= limit) break;
    try {
      if (!(await isAllowedByRobots(detail.url))) {
        errors.push(`${detail.url.hostname}${detail.url.pathname}: blocked by robots.txt`);
        continue;
      }
      const detailHtml = await fetchPublicPage(detail.url);
      const external = extractLinks(detailHtml, detail.url).find((link) => isIndependentBusinessUrl(link.url, directoryUrl));
      if (!external) continue;
      const heading = decodeEntities(matchFirst(detailHtml, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? detail.text);
      const record = recordFromContext(heading, external.url, detailHtml, directoryUrl, source, fallbackCategory, "directory_member_detail");
      if (isEligibleExtractedBusiness(record, directoryUrl, source)) records.push(record);
      await sleep(delayMs);
    } catch (error) {
      errors.push(`${detail.url.hostname}${detail.url.pathname}: ${error instanceof Error ? error.message : "detail extraction failed"}`);
    }
  }

  return {
    records: records.filter((record, index, rows) =>
      rows.findIndex((candidate) => normalizeHost(candidate.website_url) === normalizeHost(record.website_url)) === index
    ).slice(0, limit),
    errors
  };
}

function extractStructuredBusinesses(
  html: string,
  url: URL,
  source: FreeFirstSourceKey,
  fallbackCategory?: string
): RawBusinessLead[] {
  const records: RawBusinessLead[] = [];
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[1] ?? "null") as unknown;
      for (const entity of flattenJsonLd(parsed)) {
        if (!isBusinessEntity(entity)) continue;
        const website = stringValue(entity.url) ?? stringValue(entity.website);
        if (!website) continue;
        const address = asRecord(entity.address);
        records.push({
          business_name: stringValue(entity.name) ?? "",
          email: stringValue(entity.email),
          phone: stringValue(entity.telephone),
          website_url: website,
          city: stringValue(address.addressLocality),
          state: stringValue(address.addressRegion),
          industry: stringValue(entity.category) ?? fallbackCategory ?? null,
          source,
          source_record_id: stringValue(entity["@id"]) ?? website,
          raw_payload: {
            source_url: url.toString(),
            extraction: "json_ld",
            acquired_at: new Date().toISOString(),
            city: stringValue(address.addressLocality)
          }
        });
      }
    } catch {
      continue;
    }
  }
  return records;
}

function recordFromContext(
  name: string,
  website: URL,
  context: string,
  sourceUrl: URL,
  source: FreeFirstSourceKey,
  fallbackCategory: string | undefined,
  extraction: string
): RawBusinessLead {
  const cleanName = decodeEntities(name).split(/[|–—]/)[0]?.trim() ?? "";
  const email = matchFirst(context, /mailto:([^"'? >]+)/i);
  const phone = matchFirst(context, /tel:([^"'? >]+)/i) ?? matchFirst(context, /((?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})/);
  const location = extractCityState(context);
  return {
    business_name: cleanName,
    email: email ? decodeURIComponent(email) : null,
    phone: phone ? decodeURIComponent(phone) : null,
    website_url: website.origin,
    city: location.city,
    state: location.state,
    industry: identifyMcaIndustry(cleanName, stripTags(context), fallbackCategory),
    source,
    source_record_id: website.toString(),
    raw_payload: {
      source_url: sourceUrl.toString(),
      extraction,
      acquired_at: new Date().toISOString(),
      city: location.city
    }
  };
}

function hydrateStructuredRecord(
  record: RawBusinessLead,
  html: string,
  sourceUrl: URL,
  source: FreeFirstSourceKey,
  fallbackCategory: string | undefined
): RawBusinessLead {
  const pageContact = recordFromContext(
    record.business_name,
    parseWebsiteUrl(record.website_url) ?? sourceUrl,
    html,
    sourceUrl,
    source,
    fallbackCategory,
    "json_ld_with_page_contact"
  );
  return {
    ...record,
    email: record.email ?? pageContact.email,
    phone: record.phone ?? pageContact.phone,
    city: record.city ?? pageContact.city,
    state: record.state ?? pageContact.state,
    industry: identifyMcaIndustry(record.industry, fallbackCategory, record.business_name, stripTags(html))
  };
}

function parseWebsiteUrl(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
}

async function fetchPublicPage(url: URL) {
  const response = await withRetry(
    async () => {
      const result = await fetchWithValidatedRedirects(url);
      if (result.status === 429 || result.status >= 500) throw new Error(`${url.hostname}: transient HTTP ${result.status}`);
      return result;
    },
    { operation: `acquisition.public_page.${url.hostname}`, retries: 2, baseDelayMs: 750 }
  );
  if (!response.ok) throw new Error(`${url.hostname}: HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error(`${url.hostname}: unsupported content type`);
  }
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) throw new Error(`${url.hostname}: response exceeds size limit`);
  return (await response.text()).slice(0, MAX_RESPONSE_BYTES);
}

async function isAllowedByRobots(url: URL) {
  try {
    const response = await fetch(new URL("/robots.txt", url.origin), {
      headers: { "user-agent": "OperionCapital-FounderAcquisition/1.0" },
      redirect: "error",
      signal: AbortSignal.timeout(4_000)
    });
    if (!response.ok) return true;
    const rules = parseRobots(await response.text());
    return !rules.some((path) => path === "/" || (path.length > 1 && url.pathname.startsWith(path)));
  } catch {
    return true;
  }
}

async function fetchWithValidatedRedirects(url: URL, redirects = 0): Promise<Response> {
  const response = await fetch(url, {
    headers: { "user-agent": "OperionCapital-FounderAcquisition/1.0" },
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (response.status < 300 || response.status >= 400) return response;
  if (redirects >= 3) throw new Error(`${url.hostname}: too many redirects`);
  const location = response.headers.get("location");
  if (!location) throw new Error(`${url.hostname}: redirect missing location`);
  return fetchWithValidatedRedirects(await validatePublicUrl(new URL(location, url).toString()), redirects + 1);
}

async function validatePublicUrl(rawUrl: string) {
  const url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only public HTTP(S) URLs are allowed");
  if (url.username || url.password || url.port) throw new Error(`${url.hostname}: credentials and custom ports are not allowed`);
  if (isPrivateHostname(url.hostname)) throw new Error(`${url.hostname}: private or local host is not allowed`);
  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error(`${url.hostname}: private or unresolved address is not allowed`);
  }
  return url;
}

function extractLinks(html: string, baseUrl: URL) {
  const links: Array<{ url: URL; text: string; index: number }> = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(decodeEntities(match[1] ?? ""), baseUrl);
      if (["http:", "https:"].includes(url.protocol)) {
        links.push({ url, text: decodeEntities(match[2] ?? ""), index: match.index ?? 0 });
      }
    } catch {
      continue;
    }
  }
  return links;
}

function selectBusinessName(title: string, heading: string, hostname: string) {
  const cleanHeading = heading.trim();
  const headingLooksPromotional =
    cleanHeading.length > 70
    || /[?!]$/.test(cleanHeading)
    || /^(need|our|expert|commercial|residential|car care|building the)/i.test(cleanHeading);
  const titleName = title.split(/[|–—-]/)[0]?.trim();
  if (headingLooksPromotional && titleName && titleName.length >= 3 && titleName.length <= 80) return titleName;
  return cleanHeading || titleName || hostname;
}

function extractMemberEntries(html: string) {
  const headings = [...html.matchAll(/<h[2-5]\b[^>]*>([\s\S]*?)<\/h[2-5]>/gi)]
    .map((match) => ({ name: decodeEntities(match[1] ?? ""), index: match.index ?? 0 }))
    .filter((heading) => heading.name && !isGenericBusinessName(heading.name));
  return headings.map((heading, index) => ({
    name: heading.name,
    html: html.slice(heading.index, headings[index + 1]?.index ?? Math.min(html.length, heading.index + 5_000))
  }));
}

function isEligibleExtractedBusiness(record: RawBusinessLead, sourceUrl: URL, source: FreeFirstSourceKey) {
  if (!record.business_name || isGenericBusinessName(record.business_name)) return false;
  if (!record.website_url || !isValidUsPhone(record.phone) || !identifyMcaIndustry(record.industry)) return false;
  try {
    return !isDirectoryAdapter(source) || isIndependentBusinessUrl(new URL(record.website_url), sourceUrl);
  } catch {
    return false;
  }
}

function isValidUsPhone(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

function isIndependentBusinessUrl(candidate: URL, directoryUrl: URL) {
  return !sameSite(candidate.hostname, directoryUrl.hostname)
    && !isNonBusinessHost(candidate.hostname)
    && !/\/(?:login|signin|search|category|categories)(?:\/|$)/i.test(candidate.pathname);
}

function isNonBusinessHost(hostname: string) {
  return /(facebook|instagram|linkedin|twitter|x\.com|youtube|google|bing|yelp|bbb|chamberofcommerce|chamberorganizer|growthzone|zoho|mapquest|apple)\./i.test(hostname);
}

function isDirectoryAdapter(source: FreeFirstSourceKey) {
  return ["public_business_directories", "chamber_directories", "industry_associations", "public_local_listings"].includes(source);
}

function isMemberDetailPath(pathname: string) {
  return /\/(?:member|members|directory|details|profile|business|listing)s?\//i.test(pathname)
    && !/\/(?:category|categories|search|login|events?)\//i.test(pathname);
}

function parseRobots(text: string) {
  const disallowed: string[] = [];
  let applies = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    const [rawKey, ...parts] = line.split(":");
    const key = rawKey?.trim().toLowerCase();
    const value = parts.join(":").trim();
    if (key === "user-agent") applies = value === "*";
    if (applies && key === "disallow" && value) disallowed.push(value);
  }
  return disallowed;
}

function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  const record = asRecord(value);
  return record["@graph"] ? [record, ...flattenJsonLd(record["@graph"])] : [record];
}

function isBusinessEntity(value: Record<string, unknown>) {
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  return types.some((type) => typeof type === "string" && /business|organization|corporation|store|restaurant|contractor/i.test(type));
}

function extractCityState(value: string) {
  const match = stripTags(value).match(/\b([A-Za-z][A-Za-z .'-]{2,40}),\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/);
  return { city: match?.[1]?.trim() ?? null, state: match?.[2] ?? null };
}

function sameSite(left: string, right: string) {
  return registrablePart(left) === registrablePart(right);
}

function registrablePart(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "").split(".").slice(-2).join(".");
}

function normalizeHost(value?: string | null) {
  try {
    return value ? new URL(value).hostname.replace(/^www\./, "").toLowerCase() : "";
  } catch {
    return "";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function matchFirst(value: string, pattern: RegExp) {
  return value.match(pattern)?.[1]?.trim() ?? null;
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string) {
  return stripTags(value).replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"").replace(/&#39;/gi, "'");
}

function parseUrlList(value?: string) {
  return (value ?? "").split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean);
}

function boundedNumber(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function isPrivateHostname(hostname: string) {
  return hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal") || isPrivateAddress(hostname);
}

function isPrivateAddress(address: string) {
  return /^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1$|fc|fd|fe80)/i.test(address)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
}

function safeUrlForLog(value: string) {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname;
  } catch {
    return "invalid_url";
  }
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
