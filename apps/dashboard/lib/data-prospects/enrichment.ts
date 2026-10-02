import { getAcquisitionAdapter } from "@/lib/acquisition/adapters/registry";
import { buildProspectIdentity, normalizeBusinessLead, normalizeBusinessName, type RawBusinessLead } from "@/lib/acquisition/normalization";
import { getDataProspect, updateDataProspect } from "@/lib/data-prospects/repository";
import type { DataProspect } from "@/lib/data-prospects/types";
import { readServerEnv } from "@/lib/env";
import { ConfigurationError, ValidationError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/** Exact business and location evidence is required; ambiguous matches never fill fields. */
export function matchesProspectIdentity(prospect: DataProspect, candidate: RawBusinessLead) {
  const identity = buildProspectIdentity({
    business_name: candidate.business_name,
    address: candidate.address ?? null,
    city: candidate.city ?? null,
    state: candidate.state ?? null,
    zip: candidate.zip ?? null
  });
  if (!identity.normalized_business_name || identity.normalized_business_name !== prospect.normalized_business_name) return false;
  for (const field of ["city", "state", "zip"] as const) {
    const expected = normalizeLocation(prospect[field]);
    const actual = normalizeLocation(candidate[field]);
    if (expected && actual && expected !== actual) return false;
  }
  const address = normalizeAddress(prospect.address);
  if (address) {
    const street = normalizeAddress(candidate.address);
    const full = normalizeAddress([candidate.address, candidate.city, candidate.state, candidate.zip].filter(Boolean).join(" "));
    return Boolean(street && (address === street || address === full));
  }
  return Boolean(prospect.zip && candidate.zip && normalizeLocation(prospect.zip) === normalizeLocation(candidate.zip))
    || Boolean(prospect.city && prospect.state && candidate.city && candidate.state
      && normalizeLocation(prospect.city) === normalizeLocation(candidate.city)
      && normalizeLocation(prospect.state) === normalizeLocation(candidate.state));
}

export async function enrichDataProspect(id: string) {
  const prospect = await getDataProspect(id);
  if (prospect.enrichment_status === "enriching" && Date.now() - Date.parse(prospect.updated_at) < 5 * 60_000) {
    throw new ValidationError("This business is already being enriched. Refresh in a moment.");
  }
  // The timestamp comparison also prevents two simultaneous requests spending provider credits.
  const { data: claimed, error } = await getSupabaseAdmin().from("acquisition_prospects" as never)
    .update({ enrichment_status: "enriching", enrichment_error: null } as never)
    .eq("id" as never, id as never).eq("updated_at" as never, prospect.updated_at as never).select("id").maybeSingle();
  if (error) throw error;
  if (!claimed) throw new ValidationError("This business changed. Refresh before trying again.");
  try {
    const env = readServerEnv();
    const provider = env.GOOGLE_PLACES_API_KEY?.trim() ? "google_places" : env.APOLLO_API_KEY?.trim() ? "apollo" : null;
    if (!provider) throw new ConfigurationError("Google Places or Apollo must be configured on the server before enrichment.");
    const lookup = await getAcquisitionAdapter(provider).discover({
      query: prospect.business_name,
      location: [prospect.address, prospect.city, prospect.state, prospect.zip].filter(Boolean).join(", "),
      limit: 5,
      sourceTimeoutMs: 12_000
    });
    const matches = lookup.records.filter((record) => matchesProspectIdentity(prospect, record));
    const uniqueMatches = [...new Map(matches.map((record) => [record.source_record_id ?? JSON.stringify([record.business_name, record.address, record.city, record.state, record.zip]), record])).values()];
    const candidate = uniqueMatches.length === 1 ? uniqueMatches[0] : null;
    if (!candidate) {
      if (lookup.errors.length > 0 && lookup.records.length === 0) throw new Error(lookup.errors.join("; "));
      return await updateDataProspect(id, {
        enrichment_status: "no_match", enriched_at: new Date().toISOString(),
        enrichment_error: uniqueMatches.length > 1 ? "Multiple matching businesses found; no information was changed." : "No confident business and location match found; missing information remains empty.",
        source_payload: { ...prospect.source_payload, last_enrichment: { provider, matched: false, candidates: lookup.records.length } }
      });
    }
    let additional: RawBusinessLead | undefined;
    if (candidate.website_url && !prospect.normalized_email && !candidate.email) {
      const website = await getAcquisitionAdapter("company_websites").discover({
        urls: [candidate.website_url], limit: 1, sourceTimeoutMs: 10_000, pageTimeoutMs: 5_000, maxPages: 1
      });
      const domain = normalizeBusinessLead(candidate).domain;
      additional = website.records.find((record) => normalizeBusinessName(record.business_name) === prospect.normalized_business_name
        && domain && normalizeBusinessLead(record).domain === domain);
    }
    const normalized = normalizeBusinessLead({ ...candidate, email: candidate.email ?? additional?.email, phone: candidate.phone ?? additional?.phone });
    const timestamp = new Date().toISOString();
    return await updateDataProspect(id, {
      normalized_email: prospect.normalized_email ?? normalized.email,
      normalized_phone: prospect.normalized_phone ?? normalized.phone,
      website_url: prospect.website_url ?? normalized.website_url,
      domain: prospect.domain ?? normalized.domain,
      industry: prospect.industry ?? normalized.industry,
      // Preserve the identity used to deduplicate the original uploaded location.
      enrichment_status: "enriched", enrichment_error: null, enriched_at: timestamp, verified_at: timestamp,
      source_payload: {
        ...prospect.source_payload,
        last_enrichment: { provider, matched: true, source_record_id: candidate.source_record_id ?? null, matched_at: timestamp, record: candidate, website_record: additional ?? null }
      }
    });
  } catch (error) {
    await updateDataProspect(id, {
      enrichment_status: "failed", enriched_at: new Date().toISOString(),
      enrichment_error: error instanceof Error ? error.message : "Enrichment failed. Try again later."
    });
    throw error;
  }
}

function normalizeLocation(value?: string | null) { return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function normalizeAddress(value?: string | null) {
  return normalizeLocation(value).replace(/\b(united states|usa)\b/g, "").replace(/\bstreet\b/g, "st").replace(/\bavenue\b/g, "ave")
    .replace(/\broad\b/g, "rd").replace(/\bboulevard\b/g, "blvd").replace(/\bsuite\b/g, "ste").replace(/\s+/g, " ").trim();
}
