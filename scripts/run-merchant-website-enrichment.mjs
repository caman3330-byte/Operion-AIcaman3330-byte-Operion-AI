import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

loadLocalEnv();

const sourceName = process.argv[2] ?? "IEC Fort Worth Member Directory";
const limit = Math.min(Number(process.argv[3] ?? 50), 75);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const source = await getSource(sourceName);
const candidates = await discoverCandidates(source, limit);
const enriched = [];

for (const candidate of candidates) {
  const stored = await upsertCandidate(source, candidate);
  enriched.push(await enrichCandidate(stored));
}

const verified = enriched.filter((candidate) =>
  candidate.website_verified && candidate.phone_verified && candidate.identity_match && candidate.quality_score >= 80
);

console.log(JSON.stringify({
  source_name: source.source_name,
  candidates_enriched: enriched.length,
  phones_found: enriched.filter((candidate) => candidate.phone_verified).length,
  emails_found: enriched.filter((candidate) => candidate.email_found).length,
  verified_merchants: verified.length,
  projected_crm_imports: verified.length,
  samples: enriched.slice(0, 25).map((candidate) => ({
    business_name: candidate.business_name,
    website_url: candidate.website_url,
    business_phone: candidate.business_phone,
    business_email: candidate.business_email,
    contact_page_url: candidate.contact_page_url,
    quality_score: candidate.quality_score,
    enrichment_status: candidate.enrichment_status,
    rejection_reason: candidate.rejection_reason
  }))
}, null, 2));

async function getSource(name) {
  const { data, error } = await supabase
    .from("merchant_acquisition_sources")
    .select("*")
    .eq("source_name", name)
    .single();
  if (error) throw error;
  return data;
}

async function upsertCandidate(source, candidate) {
  const { data, error } = await supabase
    .from("merchant_acquisition_candidates")
    .upsert({
      source_id: source.id,
      business_name: candidate.business_name,
      website_url: candidate.website_url,
      domain: candidate.domain,
      industry: source.industry,
      state: source.state,
      source_phone: candidate.source_phone,
      enrichment_status: "queued",
      raw_payload: { source_url: source.source_url, runner: "script" }
    }, { onConflict: "source_id,domain" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function enrichCandidate(candidate) {
  await supabase.from("merchant_acquisition_candidates").update({ enrichment_status: "running" }).eq("id", candidate.id);
  try {
    const evidence = await collectWebsiteEvidence(candidate.website_url);
    const phone = evidence.phone;
    const phoneVerified = isValidPhone(phone);
    const identityMatch = identityMatches(candidate.business_name, evidence.text, candidate.domain);
    const score =
      (evidence.websiteVerified ? 35 : 0) +
      (phoneVerified ? 35 : 0) +
      (evidence.email ? 10 : 0) +
      (identityMatch ? 15 : 0) +
      (candidate.industry ? 5 : 0);
    const status = evidence.websiteVerified && phoneVerified && identityMatch && score >= 80 ? "completed" : "rejected";
    const rejection = status === "completed" ? null : [
      evidence.websiteVerified ? null : "website not reachable",
      phoneVerified ? null : "business phone not found",
      identityMatch ? null : "business identity did not match source",
      score >= 80 ? null : "quality score below 80"
    ].filter(Boolean).join("; ");

    const { data, error } = await supabase
      .from("merchant_acquisition_candidates")
      .update({
        business_phone: phone,
        business_email: evidence.email,
        contact_page_url: evidence.contactPageUrl,
        company_description: evidence.description,
        website_verified: evidence.websiteVerified,
        phone_verified: phoneVerified,
        email_found: Boolean(evidence.email),
        identity_match: identityMatch,
        enrichment_status: status,
        quality_score: Math.min(100, score),
        rejection_reason: rejection,
        last_enriched_at: new Date().toISOString(),
        raw_payload: { ...(candidate.raw_payload ?? {}), evidence: evidence.statuses, paths_checked: evidence.pathsChecked }
      })
      .eq("id", candidate.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    const { data } = await supabase
      .from("merchant_acquisition_candidates")
      .update({
        enrichment_status: "failed",
        rejection_reason: error instanceof Error ? error.message : "Unknown enrichment failure",
        last_enriched_at: new Date().toISOString()
      })
      .eq("id", candidate.id)
      .select("*")
      .single();
    return data ?? candidate;
  }
}

async function discoverCandidates(source, max) {
  const response = await fetch(source.source_url, {
    headers: { "user-agent": "OperionCapital-MerchantWebsiteEnrichment/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`${source.source_name} returned HTTP ${response.status}`);
  const html = (await response.text()).slice(0, 2_000_000);
  const base = new URL(response.url || source.source_url);
  const candidates = [];
  for (const link of extractLinks(html, base)) {
    if (candidates.length >= max) break;
    if (!isIndependent(link.url, source.source_url)) continue;
    const context = html.slice(Math.max(0, link.index - 2500), Math.min(html.length, link.index + 3500));
    const businessName = cleanName(link.text, link.url);
    const domain = normalizeHost(link.url.href);
    if (!businessName || isGenericSourceLinkName(businessName) || !domain || candidates.some((candidate) => candidate.domain === domain)) continue;
    candidates.push({
      business_name: businessName,
      website_url: link.url.origin,
      domain,
      source_phone: findPhone(context)
    });
  }
  return candidates;
}

async function collectWebsiteEvidence(websiteUrl) {
  const root = new URL(websiteUrl);
  const paths = ["/", "/contact", "/about", "/about-us"];
  const statuses = {};
  const pathsChecked = [];
  let websiteVerified = false;
  let phone = null;
  let email = null;
  let contactPageUrl = null;
  let description = null;
  let text = "";

  for (const path of paths) {
    const url = new URL(path, root.origin);
    pathsChecked.push(url.toString());
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "OperionCapital-MerchantWebsiteEnrichment/1.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(12_000)
      });
      statuses[url.toString()] = response.status;
      if (!response.ok) continue;
      websiteVerified = true;
      const html = (await response.text()).slice(0, 300_000);
      const pageText = stripTags(html);
      text += ` ${pageText}`;
      phone ??= findPhone(html);
      email ??= findEmail(html);
      description ??= findDescription(html, pageText);
      if (!contactPageUrl && path.includes("contact")) contactPageUrl = response.url;
    } catch {
      statuses[url.toString()] = null;
    }
  }
  return { websiteVerified, phone, email, contactPageUrl, description, text, pathsChecked, statuses };
}

function extractLinks(html, baseUrl) {
  return [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => {
      try {
        return { url: new URL(decode(match[1] ?? ""), baseUrl), text: decode(match[2] ?? ""), index: match.index ?? 0 };
      } catch {
        return null;
      }
    })
    .filter((link) => link && ["http:", "https:"].includes(link.url.protocol));
}

function isIndependent(url, sourceUrl) {
  return registrable(url.hostname) !== registrable(new URL(sourceUrl).hostname)
    && !/(facebook|instagram|linkedin|twitter|x\.com|youtube|google|bing|yelp|bbb|chamberofcommerce|chamberorganizer|growthzone|zoho|mapquest|apple|constantcontact|mailchimp|authorize|paypal|emailmeform|thinkific|flashpoint)\./i.test(url.hostname)
    && !/(^|\.)ieci\.org$/i.test(url.hostname)
    && !/(^|\.)tdlr\.texas\.gov$/i.test(url.hostname)
    && !/(^|\.)goo\.gl$/i.test(url.hostname)
    && !/\/(?:login|signin|search|category|categories)(?:\/|$)/i.test(url.pathname);
}

function cleanName(text, url) {
  const value = decode(text).replace(/\s+/g, " ").trim();
  if (value.length >= 3 && value.length <= 90 && !/^(home|website|visit website|learn more|read more|click here|contact|view|more|full|email)$/i.test(value)) return value;
  return url.hostname.replace(/^www\./i, "").split(".")[0]?.replace(/[-_]+/g, " ").trim() ?? null;
}

function identityMatches(name, text, domain) {
  const normalizedText = normalizeText(text);
  const tokens = normalizeText(name).split(" ").filter((token) => token.length >= 4);
  const domainToken = normalizeText(domain.split(".")[0] ?? "").split(" ").find((token) => token.length >= 4);
  return tokens.some((token) => normalizedText.includes(token)) || Boolean(domainToken && normalizedText.includes(domainToken));
}

function findPhone(value) {
  const tel = String(value).match(/tel:([^"'? >]+)/i)?.[1];
  if (tel) return decodeURIComponent(tel);
  return String(value).match(/((?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})/)?.[1] ?? null;
}

function findEmail(value) {
  const mailto = String(value).match(/mailto:([^"'? >]+)/i)?.[1];
  const candidate = mailto ? decodeURIComponent(mailto) : String(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  return isUsefulEmail(candidate) ? candidate : null;
}

function isUsefulEmail(value) {
  return Boolean(value)
    && !/^user@domain\.com$/i.test(value)
    && !/sentry-next\.wixpress\.com$/i.test(value)
    && !/\.(png|jpe?g|gif|svg|webp)$/i.test(value);
}

function isGenericSourceLinkName(value) {
  return /\b(?:find an iec chapter|drug testing portal|make-up classes|tdlr renew|update company information|renew your license|class|portal|chapter)\b/i.test(value);
}

function findDescription(html, fallback) {
  const meta = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1];
  return decode(meta ?? fallback).slice(0, 500) || null;
}

function isValidPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

function normalizeHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function registrable(hostname) {
  return String(hostname).toLowerCase().replace(/^www\./, "").split(".").slice(-2).join(".");
}

function normalizeText(value) {
  return decode(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stripTags(value) {
  return String(value).replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decode(value) {
  return stripTags(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#8217;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function loadLocalEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // Production runners should provide env directly.
  }
}
