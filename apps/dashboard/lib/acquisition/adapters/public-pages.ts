import { lookup } from "node:dns/promises";
import type { Json } from "@operion/shared";
import { isGenericBusinessName } from "@/lib/acquisition/validation";
import { identifyMcaIndustry } from "@/lib/acquisition/industry-profiles";
import {
  AcquisitionTimeoutError,
  assertBudgetAvailable,
  boundedNumber,
  boundedTimeoutMs,
  createRunBudget,
  type AcquisitionRunBudget
} from "@/lib/acquisition/runtime-controls";
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
const DEFAULT_SOURCE_TIMEOUT_MS = 45_000;
const DEFAULT_DETAIL_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_SOURCE_PAGES = 10;

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
      const sourceTimeoutMs = input.sourceTimeoutMs ?? boundedNumber(
        process.env.MERCHANT_ACQUISITION_SOURCE_TIMEOUT_MS,
        DEFAULT_SOURCE_TIMEOUT_MS,
        10_000,
        55_000
      );
      const pageTimeoutMs = input.pageTimeoutMs ?? boundedNumber(
        process.env.MERCHANT_ACQUISITION_PAGE_TIMEOUT_MS,
        REQUEST_TIMEOUT_MS,
        3_000,
        20_000
      );
      const detailTimeoutMs = input.detailTimeoutMs ?? boundedNumber(
        process.env.MERCHANT_ACQUISITION_DETAIL_TIMEOUT_MS,
        DEFAULT_DETAIL_TIMEOUT_MS,
        2_000,
        15_000
      );
      const maxPages = input.maxPages ?? boundedNumber(process.env.MAX_SOURCE_PAGES, DEFAULT_MAX_SOURCE_PAGES, 1, 10);
      const budget = createRunBudget(sourceTimeoutMs);
      let pagesVisited = 0;
      let timedOut = false;

      for (const rawUrl of urls) {
        try {
          assertBudgetAvailable(budget, "source extraction");
          const url = await validatePublicUrl(rawUrl);
          if (!(await isAllowedByRobots(url))) {
            errors.push(`${url.hostname}: blocked by robots.txt`);
            continue;
          }

          const html = await fetchPublicPage(url, { timeoutMs: pageTimeoutMs, budget });
          pagesVisited += 1;
          const extracted = await extractBusinesses(html, url, key, input.category, input.limit - records.length, {
            delayMs,
            pageTimeoutMs,
            detailTimeoutMs,
            maxPages,
            budget,
            pagesVisited
          });
          pagesVisited = extracted.pagesVisited;
          records.push(...extracted.records);
          errors.push(...extracted.errors);
          logger.info("acquisition_public_page_processed", { source: key, host: url.hostname, records: records.length });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown public page error";
          errors.push(message);
          timedOut = timedOut || error instanceof AcquisitionTimeoutError || /timed out|aborted/i.test(message);
          logger.warn("acquisition_public_page_failed", { source: key, url: safeUrlForLog(rawUrl), error: message });
        }

        if (records.length >= input.limit) break;
        if (remainingBudgetExceeded(budget)) {
          timedOut = true;
          errors.push("source extraction timed out before all URLs were processed");
          break;
        }
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
          business_level_extraction: true,
          source_timeout_ms: sourceTimeoutMs,
          page_timeout_ms: pageTimeoutMs,
          detail_timeout_ms: detailTimeoutMs,
          max_source_pages: maxPages,
          pages_visited: pagesVisited,
          timed_out: timedOut
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
  controls: DirectoryExtractionControls
): Promise<{ records: RawBusinessLead[]; errors: string[]; pagesVisited: number }> {
  const structured = extractStructuredBusinesses(html, url, source, fallbackCategory)
    .map((record) => hydrateStructuredRecord(record, html, url, source, fallbackCategory))
    .filter((record) => isEligibleExtractedBusiness(record, url, source));
  if (structured.length > 0) return { records: structured.slice(0, limit), errors: [], pagesVisited: controls.pagesVisited };
  if (isDirectoryAdapter(source)) {
    return extractDirectoryBusinesses(html, url, source, fallbackCategory, limit, controls);
  }

  const title = decodeEntities(matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? url.hostname);
  const heading = decodeEntities(matchFirst(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? title);
  const record = recordFromContext(selectBusinessName(title, heading, url.hostname), url, html, url, source, fallbackCategory, "company_website");
  return { records: isEligibleExtractedBusiness(record, url, source) ? [record] : [], errors: [], pagesVisited: controls.pagesVisited };
}

interface DirectoryExtractionControls {
  delayMs: number;
  pageTimeoutMs: number;
  detailTimeoutMs: number;
  maxPages: number;
  pagesVisited: number;
  budget: AcquisitionRunBudget;
}

async function extractDirectoryBusinesses(
  html: string,
  directoryUrl: URL,
  source: FreeFirstSourceKey,
  fallbackCategory: string | undefined,
  limit: number,
  controls: DirectoryExtractionControls
) {
  const records: RawBusinessLead[] = [];
  const errors: string[] = [];
  const links = extractLinks(html, directoryUrl);

  const patternRecords = [
    ...extractCommunityBuilderRows(html, directoryUrl, source, fallbackCategory),
    ...extractContractorProfileCards(html, directoryUrl, source, fallbackCategory),
    ...extractWordPressBusinessDirectoryListings(html, directoryUrl, source, fallbackCategory)
  ].filter((record) => isEligibleExtractedBusiness(record, directoryUrl, source))
    .slice(readOperionOffset(directoryUrl));
  records.push(...uniqueRecords(patternRecords).slice(0, limit));

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
      assertBudgetAvailable(controls.budget, "detail extraction");
      if (!(await isAllowedByRobots(detail.url))) {
        errors.push(`${detail.url.hostname}${detail.url.pathname}: blocked by robots.txt`);
        continue;
      }
      const detailHtml = await fetchPublicPage(detail.url, { timeoutMs: controls.detailTimeoutMs, budget: controls.budget });
      const external = extractLinks(detailHtml, detail.url).find((link) => isIndependentBusinessUrl(link.url, directoryUrl));
      if (!external) continue;
      const heading = decodeEntities(matchFirst(detailHtml, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? detail.text);
      const record = recordFromContext(heading, external.url, detailHtml, directoryUrl, source, fallbackCategory, "directory_member_detail");
      if (isEligibleExtractedBusiness(record, directoryUrl, source)) records.push(record);
      await sleep(controls.delayMs);
    } catch (error) {
      errors.push(`${detail.url.hostname}${detail.url.pathname}: ${error instanceof Error ? error.message : "detail extraction failed"}`);
      if (error instanceof AcquisitionTimeoutError) break;
    }
  }

  const paginationLinks = links
    .filter((link) => sameSite(link.url.hostname, directoryUrl.hostname) && isPaginationPath(link.url, link.text))
    .filter((link, index, rows) => rows.findIndex((candidate) => candidate.url.toString() === link.url.toString()) === index)
    .slice(0, Math.max(0, controls.maxPages - controls.pagesVisited));

  for (const page of paginationLinks) {
    if (records.length >= limit) break;
    if (controls.pagesVisited >= controls.maxPages) {
      errors.push(`pagination paused after ${controls.pagesVisited} pages; more work may remain`);
      break;
    }
    try {
      assertBudgetAvailable(controls.budget, "pagination extraction");
      if (!(await isAllowedByRobots(page.url))) {
        errors.push(`${page.url.hostname}${page.url.pathname}: blocked by robots.txt`);
        continue;
      }
      const pageHtml = await fetchPublicPage(page.url, { timeoutMs: controls.pageTimeoutMs, budget: controls.budget });
      controls.pagesVisited += 1;
      const pageRecords = await extractDirectoryBusinesses(pageHtml, page.url, source, fallbackCategory, limit - records.length, controls);
      records.push(...pageRecords.records);
      errors.push(...pageRecords.errors);
      await sleep(controls.delayMs);
    } catch (error) {
      errors.push(`${page.url.hostname}${page.url.pathname}: ${error instanceof Error ? error.message : "pagination extraction failed"}`);
      if (error instanceof AcquisitionTimeoutError) break;
    }
  }

  return {
    records: uniqueRecords(records).slice(0, limit),
    errors,
    pagesVisited: controls.pagesVisited
  };
}

function extractCommunityBuilderRows(
  html: string,
  directoryUrl: URL,
  source: FreeFirstSourceKey,
  fallbackCategory: string | undefined
) {
  const records: RawBusinessLead[] = [];
  const rowPattern = /<div\b[^>]*class=["'][^"']*\bcbUserListRow\b[^"']*["'][^>]*data-id=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bcbUserListRow\b|<\/form>|<div class=["']cbPoweredBy\b)/gi;
  for (const match of html.matchAll(rowPattern)) {
    const rowHtml = match[2] ?? "";
    const memberType = fieldText(rowHtml, "cb_membertype");
    if (memberType && !/\bcontractor\b/i.test(memberType)) continue;
    const businessName = fieldText(rowHtml, "cb_company");
    const city = fieldText(rowHtml, "cb_workcity");
    const phone = fieldText(rowHtml, "cb_workphone");
    const websiteText = fieldText(rowHtml, "cb_website");
    const website = parseWebsiteUrl(websiteText);
    if (!businessName || !website || !isIndependentBusinessUrl(website, directoryUrl)) continue;
    records.push(recordFromFields({
      businessName,
      website,
      phone,
      city,
      state: null,
      context: rowHtml,
      sourceUrl: directoryUrl,
      source,
      fallbackCategory,
      extraction: "community_builder_member_row",
      sourceRecordId: match[1] ?? website.toString()
    }));
  }
  return records;
}

function extractContractorProfileCards(
  html: string,
  directoryUrl: URL,
  source: FreeFirstSourceKey,
  fallbackCategory: string | undefined
) {
  const records: RawBusinessLead[] = [];
  const cardPattern = /<div\b[^>]*class=["'][^"']*\bprofile\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bprofile\b|<ul\b[^>]*class=["'][^"']*\bpagination\b|<\/section>)/gi;
  for (const match of html.matchAll(cardPattern)) {
    const cardHtml = match[1] ?? "";
    const businessName = textByClass(cardHtml, "company-name");
    const websiteLink = extractLinks(cardHtml, directoryUrl).find((link) =>
      /website|visit site|view site/i.test(link.text) && isIndependentBusinessUrl(link.url, directoryUrl)
    );
    const website = websiteLink?.url;
    if (!businessName || !website) continue;
    records.push(recordFromFields({
      businessName,
      website,
      phone: matchFirst(cardHtml, /tel:([^"'? >]+)/i) ?? matchFirst(cardHtml, /((?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})/),
      city: null,
      state: null,
      context: cardHtml,
      sourceUrl: directoryUrl,
      source,
      fallbackCategory,
      extraction: "contractor_profile_card",
      sourceRecordId: website.toString()
    }));
  }
  return records;
}

function extractWordPressBusinessDirectoryListings(
  html: string,
  directoryUrl: URL,
  source: FreeFirstSourceKey,
  fallbackCategory: string | undefined
) {
  const records: RawBusinessLead[] = [];
  const listingPattern = /<div\b[^>]*class=["'][^"']*\bwpbdp-listing\b[^"']*\bexcerpt\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bwpbdp-listing\b[^"']*\bexcerpt\b|<div\b[^>]*class=["'][^"']*\bwpbdp-pagination\b|<\/main>|<\/article>)/gi;
  for (const match of html.matchAll(listingPattern)) {
    const listingHtml = match[1] ?? "";
    if (!/\bcontractor members?\b/i.test(stripTags(listingHtml))) continue;
    const businessName = fieldValueByLabel(listingHtml, "Listing Title")
      ?? decodeEntities(matchFirst(listingHtml, /<div\b[^>]*class=["'][^"']*\blisting-title\b[^"']*["'][^>]*>[\s\S]*?<h\d[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i) ?? "");
    const websiteText = fieldValueByLabel(listingHtml, "Website");
    const website = parseWebsiteUrl(websiteText)
      ?? extractLinks(listingHtml, directoryUrl).find((link) => isIndependentBusinessUrl(link.url, directoryUrl))?.url;
    if (!businessName || !website || !isIndependentBusinessUrl(website, directoryUrl)) continue;
    records.push(recordFromFields({
      businessName,
      website,
      phone: matchFirst(listingHtml, /tel:([^"'? >]+)/i) ?? fieldValueByLabel(listingHtml, "Phone"),
      city: null,
      state: null,
      context: listingHtml,
      sourceUrl: directoryUrl,
      source,
      fallbackCategory,
      extraction: "wordpress_business_directory_listing",
      sourceRecordId: website.toString()
    }));
  }
  return records;
}

function recordFromFields(input: {
  businessName: string;
  website: URL;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  context: string;
  sourceUrl: URL;
  source: FreeFirstSourceKey;
  fallbackCategory: string | undefined;
  extraction: string;
  sourceRecordId: string;
}): RawBusinessLead {
  const contextText = stripTags(input.context);
  return {
    business_name: decodeEntities(input.businessName),
    email: matchFirst(input.context, /mailto:([^"'? >]+)/i),
    phone: input.phone ? safeDecodeURIComponent(input.phone) : null,
    website_url: input.website.origin,
    city: input.city,
    state: input.state,
    industry: identifyMcaIndustry(input.businessName, contextText, input.fallbackCategory),
    source: input.source,
    source_record_id: input.sourceRecordId,
    raw_payload: {
      source_url: input.sourceUrl.toString(),
      extraction: input.extraction,
      acquired_at: new Date().toISOString(),
      city: input.city,
      state: input.state
    }
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
    email: email ? safeDecodeURIComponent(email) : null,
    phone: phone ? safeDecodeURIComponent(phone) : null,
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

async function fetchPublicPage(url: URL, options: { timeoutMs?: number; budget?: AcquisitionRunBudget } = {}) {
  const response = await withRetry(
    async () => {
      assertBudgetAvailable(options.budget, `${url.hostname} request`);
      const result = await fetchWithValidatedRedirects(url, 0, {
        timeoutMs: options.timeoutMs ?? REQUEST_TIMEOUT_MS,
        budget: options.budget
      });
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

async function fetchWithValidatedRedirects(
  url: URL,
  redirects = 0,
  options: { timeoutMs: number; budget?: AcquisitionRunBudget | undefined }
): Promise<Response> {
  const response = await fetch(url, {
    headers: { "user-agent": "OperionCapital-FounderAcquisition/1.0" },
    redirect: "manual",
    signal: AbortSignal.timeout(boundedTimeoutMs(options.timeoutMs, options.budget))
  });
  if (response.status < 300 || response.status >= 400) return response;
  if (redirects >= 3) throw new Error(`${url.hostname}: too many redirects`);
  const location = response.headers.get("location");
  if (!location) throw new Error(`${url.hostname}: redirect missing location`);
  return fetchWithValidatedRedirects(await validatePublicUrl(new URL(location, url).toString()), redirects + 1, options);
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

function fieldText(html: string, fieldSuffix: string) {
  const pattern = new RegExp(`<[^>]+class=["'][^"']*cbUserListFL_${fieldSuffix}[^"']*["'][^>]*>[\\s\\S]*?<span[^>]+class=["'][^"']*cbListFieldCont[^"']*["'][^>]*>([\\s\\S]*?)<\\/span>`, "i");
  return decodeEntities(matchFirst(html, pattern) ?? "");
}

function textByClass(html: string, className: string) {
  const pattern = new RegExp(`<[^>]+class=["'][^"']*\\b${escapeRegExp(className)}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i");
  return decodeEntities(matchFirst(html, pattern) ?? "");
}

function fieldValueByLabel(html: string, label: string) {
  const pattern = new RegExp(`<span\\b[^>]*class=["'][^"']*\\bfield-label\\b[^"']*["'][^>]*>\\s*${escapeRegExp(label)}\\s*<\\/span>\\s*<div\\b[^>]*class=["'][^"']*\\bvalue\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, "i");
  const value = matchFirst(html, pattern);
  return value ? decodeEntities(value) : null;
}

function uniqueRecords(records: RawBusinessLead[]) {
  return records.filter((record, index, rows) => {
    const host = normalizeHost(record.website_url);
    if (!host) return false;
    return rows.findIndex((candidate) => normalizeHost(candidate.website_url) === host) === index;
  });
}

function isEligibleExtractedBusiness(record: RawBusinessLead, sourceUrl: URL, source: FreeFirstSourceKey) {
  if (!record.business_name || isGenericBusinessName(record.business_name) || isNonMerchantLinkName(record.business_name)) return false;
  if (!record.website_url || !identifyMcaIndustry(record.industry)) return false;
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
    && !/\/(?:login|signin|search|category|categories|cart|checkout|privacy|terms|events?)(?:\/|$)/i.test(candidate.pathname);
}

function isNonBusinessHost(hostname: string) {
  return /(facebook|instagram|linkedin|twitter|x\.com|youtube|google|bing|yelp|bbb|chamberofcommerce|chamberorganizer|growthzone|zoho|mapquest|apple|constantcontact|mailchimp|authorize|paypal|wixpress|yourmembership|higherlogic|typeform|memberclicks|termsfeed|texas|txdot|govdelivery)\./i.test(hostname)
    || /\.(gov|edu)$/i.test(hostname)
    || /\b(nationalroofingdirectory|roofingalliance|professionalroofing|everybodyneedsaroof|careersinroofing|hvacindustrymarketplace|gilmoreglobal|standardindustries|members1st|saferoofsovertexas|bimsmith|leverage\.gallery|capitol\.texas)\b/i.test(hostname);
}

function isDirectoryAdapter(source: FreeFirstSourceKey) {
  return ["public_business_directories", "chamber_directories", "industry_associations", "public_local_listings"].includes(source);
}

function isMemberDetailPath(pathname: string) {
  return /\/(?:member|members|directory|details|profile|business|listing)s?\//i.test(pathname)
    && !/\/(?:category|categories|search|login|events?)\//i.test(pathname);
}

function isPaginationPath(url: URL, text: string) {
  const label = text.toLowerCase().replace(/\s+/g, " ").trim();
  return /\b(?:next|more|load more|older|2|3)\b/.test(label)
    || /(?:[?&](?:page|p|pg)=\d+|\/page\/\d+)/i.test(url.toString());
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

function isNonMerchantLinkName(value: string) {
  return /\b(?:be safe\.?\s*be smart\.?\s*hire a phcc professional|our sponsors|current bylaws|members$|get in touch|for the next 24 hours|evacuations|active fire|document before you discard|useful links|standards and field guides|legislative fly-in|upcoming events|annual sponsors|details|territory manager|roofing fraud|applicable texas codes|important website information|main navigation|resources|helpful tools|connect with us|privacy policy|powered by|membership directory)\b/i.test(value)
    || /^\s*(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/i.test(value)
    || /\b(?:toll free|fax)\b/i.test(value);
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseUrlList(value?: string) {
  return (value ?? "").split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readOperionOffset(url: URL) {
  const value = Number(url.searchParams.get("operion_offset") ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 500) : 0;
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

function remainingBudgetExceeded(budget: AcquisitionRunBudget) {
  return boundedTimeoutMs(1, budget) <= 1 && Date.now() - budget.startedAt >= budget.timeoutMs;
}
