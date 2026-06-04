export interface RawBusinessLead {
  business_name: string;
  contact_name?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  website_url?: string | null | undefined;
  city?: string | null | undefined;
  industry?: string | null | undefined;
  state?: string | null | undefined;
  annual_revenue_est?: number | null | undefined;
  time_in_business_years?: number | null | undefined;
  employee_count?: number | null | undefined;
  source?: string | null | undefined;
  source_record_id?: string | null | undefined;
  raw_payload?: unknown;
}

export interface NormalizedBusinessLead {
  business_name: string;
  normalized_business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website_url: string | null;
  domain: string | null;
  city: string | null;
  industry: string | null;
  state: string | null;
  annual_revenue_est: number | null;
  time_in_business_years: number | null;
  source_record_id: string | null;
  raw_payload: unknown;
}

export function normalizeBusinessLead(input: RawBusinessLead): NormalizedBusinessLead {
  const businessName = compactWhitespace(input.business_name);
  const websiteUrl = normalizeUrl(input.website_url ?? null);

  return {
    business_name: businessName,
    normalized_business_name: normalizeBusinessName(businessName),
    contact_name: nullableCompact(input.contact_name),
    email: normalizeEmail(input.email ?? null),
    phone: normalizePhone(input.phone ?? null),
    website_url: websiteUrl,
    domain: extractDomain(websiteUrl),
    city: nullableCompact(input.city),
    industry: nullableCompact(input.industry),
    state: normalizeState(input.state ?? null),
    annual_revenue_est: normalizeMoney(input.annual_revenue_est),
    time_in_business_years: normalizeNumber(input.time_in_business_years),
    source_record_id: nullableCompact(input.source_record_id),
    raw_payload: input.raw_payload ?? input
  };
}

export function normalizeBusinessName(value: string) {
  return compactWhitespace(value)
    .toLowerCase()
    .replace(/\b(llc|inc|corp|corporation|company|co|ltd|limited)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function extractDomain(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalizeUrl(value: string | null) {
  const trimmed = nullableCompact(value);
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProtocol).toString();
  } catch {
    return null;
  }
}

function normalizeEmail(value: string | null) {
  const trimmed = nullableCompact(value);
  if (!trimmed || !trimmed.includes("@")) return null;
  return trimmed.toLowerCase();
}

function normalizePhone(value: string | null) {
  const trimmed = nullableCompact(value);
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

function normalizeState(value: string | null) {
  const trimmed = nullableCompact(value);
  return trimmed ? trimmed.toUpperCase() : null;
}

function normalizeMoney(value: number | null | undefined) {
  const normalized = normalizeNumber(value);
  return normalized === null ? null : Math.round(normalized);
}

function normalizeNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function nullableCompact(value: string | null | undefined) {
  const compacted = compactWhitespace(value ?? "");
  return compacted.length > 0 ? compacted : null;
}

function compactWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}
