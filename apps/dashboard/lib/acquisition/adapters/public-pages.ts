import { lookup } from "node:dns/promises";
import type { Json } from "@operion/shared";
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
          const allowed = await isAllowedByRobots(url);
          if (!allowed) {
            errors.push(`${url.hostname}: blocked by robots.txt`);
            continue;
          }

          const html = await fetchPublicPage(url);
          records.push(...extractBusinesses(html, url, key, input.category).slice(0, input.limit - records.length));
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
          request_delay_ms: delayMs
        } as Json
      };
    }
  };
}

async function fetchPublicPage(url: URL) {
  const response = await withRetry(
    async () => {
      const result = await fetchWithValidatedRedirects(url);
      if (result.status === 429 || result.status >= 500) {
        throw new Error(`${url.hostname}: transient HTTP ${result.status}`);
      }
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
  const redirectUrl = await validatePublicUrl(new URL(location, url).toString());
  return fetchWithValidatedRedirects(redirectUrl, redirects + 1);
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

function extractBusinesses(
  html: string,
  url: URL,
  source: FreeFirstSourceKey,
  fallbackCategory?: string
): RawBusinessLead[] {
  const structured = extractStructuredBusinesses(html, url, source, fallbackCategory);
  if (structured.length > 0) return structured;

  const title = decodeEntities(matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? url.hostname);
  const heading = decodeEntities(matchFirst(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? title);
  const businessName = stripTags(heading).split(/[|\-–]/)[0]?.trim() || url.hostname;
  const email = matchFirst(html, /mailto:([^"'? >]+)/i);
  const phone = matchFirst(html, /tel:([^"'? >]+)/i);

  return [{
    business_name: businessName,
    email: email ? decodeURIComponent(email) : null,
    phone: phone ? decodeURIComponent(phone) : null,
    website_url: url.origin,
    industry: fallbackCategory ?? null,
    source,
    source_record_id: url.toString(),
    raw_payload: { source_url: url.toString(), extraction: "public_html_fallback", acquired_at: new Date().toISOString() }
  }];
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
        const address = asRecord(entity.address);
        const website = stringValue(entity.url) ?? stringValue(entity.website) ?? url.origin;
        records.push({
          business_name: stringValue(entity.name) ?? url.hostname,
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

function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  const record = asRecord(value);
  const graph = record["@graph"];
  return graph ? [record, ...flattenJsonLd(graph)] : [record];
}

function isBusinessEntity(value: Record<string, unknown>) {
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  return types.some((type) => typeof type === "string" && /business|organization|corporation|store|restaurant|contractor/i.test(type));
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
