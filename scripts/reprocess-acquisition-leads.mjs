import { lookup } from "node:dns/promises";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

loadEnv(join(process.cwd(), "apps", "dashboard", ".env.local"));
loadEnv(join(process.cwd(), ".env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const { data: leads, error } = await supabase
  .from("leads")
  .select("id,business_name,email,phone,qualification_score,tier,status,internal_notes,is_test_data")
  .eq("is_test_data", false)
  .order("created_at", { ascending: true });

if (error) {
  console.error(error.message);
  process.exit(1);
}

const counts = {
  total: leads.length,
  verified: 0,
  unverified: 0,
  invalid: 0,
  parked_domains: 0,
  domains_for_sale: 0,
  placeholder_sites: 0,
  ai_seed: 0,
  updated: 0,
  failed: 0
};

for (const lead of leads) {
  try {
    const notes = parseNotes(lead.internal_notes);
    const source = typeof notes.discovery_source === "string" ? notes.discovery_source : null;
    const websiteUrl = typeof notes.website_url === "string" ? notes.website_url : null;
    const validation = await validateLead({
      businessName: lead.business_name,
      websiteUrl,
      email: lead.email,
      phone: lead.phone,
      source
    });
    const currentScore = Number(lead.qualification_score ?? 0);
    const adjustedScore =
      validation.status === "invalid" ? Math.min(currentScore, 20) : validation.status === "unverified" ? Math.min(currentScore, 60) : currentScore;
    const adjustedTier = scoreToTier(adjustedScore);
    const status = validation.status === "invalid" ? "rejected" : lead.status === "rejected" ? "pending_approval" : lead.status;
    const mergedNotes = {
      ...notes,
      validation: {
        status: validation.status,
        website_verified: validation.website_verified,
        email_verified: validation.email_verified,
        phone_verified: validation.phone_verified,
        business_verified: validation.business_verified,
        validation_score: validation.validation_score,
        validation_reason: validation.validation_reason,
        validation_flags: validation.flags
      }
    };

    const update = await supabase
      .from("leads")
      .update({
        qualification_score: adjustedScore,
        tier: adjustedTier,
        status,
        website_verified: validation.website_verified,
        email_verified: validation.email_verified,
        phone_verified: validation.phone_verified,
        business_verified: validation.business_verified,
        validation_score: validation.validation_score,
        validation_reason: validation.validation_reason,
        validation_timestamp: validation.validation_timestamp,
        internal_notes: JSON.stringify(mergedNotes)
      })
      .eq("id", lead.id);

    if (update.error) throw update.error;

    counts.updated += 1;
    counts[validation.status] += 1;
    if (validation.flags.parked_domain) counts.parked_domains += 1;
    if (validation.flags.domain_for_sale) counts.domains_for_sale += 1;
    if (validation.flags.placeholder_site) counts.placeholder_sites += 1;
    if (validation.flags.fake_ai_domain) counts.ai_seed += 1;
  } catch (err) {
    counts.failed += 1;
    console.error(`Failed ${lead.id} ${lead.business_name}: ${err instanceof Error ? err.message : "unknown"}`);
  }
}

console.log(JSON.stringify(counts, null, 2));

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

async function validateLead(input) {
  const timestamp = new Date().toISOString();
  const source = String(input.source ?? "").toLowerCase();
  const phoneVerified = isValidUsPhone(input.phone);
  const emailLooksValid = isValidEmail(input.email);

  if (source === "ai_seed") {
    return result("invalid", timestamp, false, false, phoneVerified, false, 0, "AI seed leads are research-only and cannot enter production acquisition queues", {
      fake_ai_domain: true
    });
  }

  const url = normalizeUrl(input.websiteUrl);
  if (!url) {
    return result("unverified", timestamp, false, emailLooksValid, phoneVerified, false, phoneVerified || emailLooksValid ? 30 : 10, "No valid website URL available for business validation");
  }

  const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  const dnsExists = await hasDns(host);
  if (!dnsExists) {
    return result("invalid", timestamp, false, false, phoneVerified, false, 0, `DNS resolution failed for ${host}`, { dns_exists: false });
  }

  const http = await fetchEvidence(url);
  const text = http.text;
  const parked = /parked domain|this domain is parked|related searches|sponsored listings|domain parking|godaddy.*domain/i.test(text);
  const forSale = /domain (?:is )?for sale|buy this domain|this domain may be for sale|make an offer|afternic|sedo|dan\.com/i.test(text);
  const suspended = /suspended|account has been suspended/i.test(text);
  const comingSoon = /coming soon|launching soon|site coming soon|website coming soon/i.test(text);
  const placeholder = /under construction|default page|just another wordpress site|index of \//i.test(text) || text.trim().length < 180;
  const emailVerified = emailLooksValid && emailMatchesDomain(input.email, host);
  const businessVerified = Boolean(http.status && http.status < 400 && !parked && !forSale && !suspended && !comingSoon && !placeholder && businessNameAppears(input.businessName, text));

  const flags = {
    dns_exists: dnsExists,
    http_status: http.status,
    parked_domain: parked,
    domain_for_sale: forSale,
    coming_soon: comingSoon,
    placeholder_site: placeholder,
    suspended_site: suspended,
    fake_ai_domain: false
  };

  if (!http.status) return result("unverified", timestamp, false, emailVerified, phoneVerified, false, 25, `DNS exists for ${host}, but website did not return an HTTP response`, flags);
  if (http.status >= 400 || parked || forSale || suspended) {
    const reasons = [http.status >= 400 ? `Website returned HTTP ${http.status}` : null, parked ? "Parked domain detected" : null, forSale ? "Domain-for-sale language detected" : null, suspended ? "Suspended site language detected" : null].filter(Boolean);
    return result("invalid", timestamp, false, emailVerified, phoneVerified, false, Math.min(20, phoneVerified ? 20 : 10), reasons.join("; "), flags);
  }

  if (!businessVerified) {
    const reasons = [comingSoon ? "Coming-soon page detected" : null, placeholder ? "Placeholder or low-content website detected" : null, "Business name was not found on website content"].filter(Boolean);
    return result("unverified", timestamp, true, emailVerified, phoneVerified, false, 60, reasons.join("; "), flags);
  }

  return result("verified", timestamp, true, emailVerified, phoneVerified, true, 85 + (emailVerified ? 10 : 0) + (phoneVerified ? 5 : 0), "Website verified; business name appears on website", flags);
}

function result(status, timestamp, website, email, phone, business, score, reason, flags = {}) {
  return {
    status,
    website_verified: website,
    email_verified: email,
    phone_verified: phone,
    business_verified: business,
    validation_score: Math.max(0, Math.min(100, Math.round(score))),
    validation_reason: reason,
    validation_timestamp: timestamp,
    flags: {
      dns_exists: flags.dns_exists ?? false,
      http_status: flags.http_status ?? null,
      parked_domain: flags.parked_domain ?? false,
      domain_for_sale: flags.domain_for_sale ?? false,
      coming_soon: flags.coming_soon ?? false,
      placeholder_site: flags.placeholder_site ?? false,
      suspended_site: flags.suspended_site ?? false,
      fake_ai_domain: flags.fake_ai_domain ?? false
    }
  };
}

async function hasDns(hostname) {
  try {
    await lookup(hostname);
    return true;
  } catch {
    return false;
  }
}

async function fetchEvidence(url) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "Operion Capital Lead Validation/1.0" }
    });
    const text = await response.text();
    return { status: response.status, text: text.slice(0, 120000).toLowerCase() };
  } catch {
    return { status: null, text: "" };
  }
}

function normalizeUrl(value) {
  if (!value) return null;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withProtocol).toString();
  } catch {
    return null;
  }
}

function isValidEmail(value) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function isValidUsPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

function emailMatchesDomain(email, hostname) {
  const domain = String(email ?? "").split("@")[1]?.toLowerCase().replace(/^www\./, "");
  return Boolean(domain && (domain === hostname || domain.endsWith(`.${hostname}`)));
}

function businessNameAppears(name, text) {
  const terms = String(name ?? "")
    .toLowerCase()
    .replace(/\b(llc|inc|corp|corporation|company|co|ltd|limited)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((term) => term.length >= 4);
  if (terms.length === 0) return false;
  return terms.filter((term) => text.includes(term)).length >= Math.min(2, terms.length);
}

function scoreToTier(score) {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 45) return "C";
  return "D";
}

function parseNotes(notes) {
  if (!notes) return {};
  try {
    return JSON.parse(notes);
  } catch {
    return {};
  }
}
