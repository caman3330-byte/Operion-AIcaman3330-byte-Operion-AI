import type { Json } from "@operion/shared";
import { writeAuditLog } from "@/lib/audit";
import { normalizeBusinessLead, type RawBusinessLead } from "@/lib/acquisition/normalization";
import { scoreLeadQuality } from "@/lib/acquisition/scoring";
import { applyValidationToQuality, validateAcquisitionLead } from "@/lib/acquisition/validation";
import { selectAnthropicModel } from "@/lib/ai/anthropic-models";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { leadsRepository } from "@/lib/repositories/leads";
import { readServerEnv } from "@/lib/env";
import { ConfigurationError } from "@/lib/errors";
import { logger } from "@/lib/logger";

// ─────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────

export interface AcquisitionAgentResult {
  total_fetched: number;
  inserted: number;
  duplicates: number;
  failed: number;
  sources_used: string[];
  items: Array<{
    business_name: string;
    state: string | null;
    industry: string | null;
    score: number;
    tier: string;
    source: string;
    status: "inserted" | "duplicate" | "failed";
    reason?: string;
  }>;
}

// ─────────────────────────────────────────────
// Discovery targets
// ─────────────────────────────────────────────

const MCA_INDUSTRIES = [
  { keyword: "restaurant", industry: "restaurant", placeType: "restaurant" },
  { keyword: "auto repair", industry: "automotive", placeType: "car_repair" },
  { keyword: "construction company", industry: "construction", placeType: "" },
  { keyword: "medical clinic", industry: "healthcare", placeType: "doctor" },
  { keyword: "hair salon", industry: "beauty", placeType: "beauty_salon" },
  { keyword: "trucking company", industry: "logistics", placeType: "" },
  { keyword: "retail store", industry: "retail", placeType: "store" },
  { keyword: "dental office", industry: "healthcare", placeType: "dentist" }
];

const PRIORITY_STATES = ["TX", "FL", "CA", "NY", "IL", "GA", "NC", "OH"];

// ─────────────────────────────────────────────
// Source 1: Google Places API
// ─────────────────────────────────────────────

interface GooglePlacesResult {
  name: string;
  formatted_address: string;
  place_id?: string;
  formatted_phone_number?: string;
  website?: string;
  business_status?: string;
}

interface GooglePlaceDetails {
  formatted_phone_number?: string;
  website?: string;
  url?: string;
}

async function discoverViaGooglePlaces(
  apiKey: string,
  industry: { keyword: string; industry: string; placeType: string },
  state: string,
  limit: number
): Promise<RawBusinessLead[]> {
  const query = encodeURIComponent(`${industry.keyword} in ${state}`);
  const typeParam = industry.placeType ? `&type=${industry.placeType}` : "";
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}${typeParam}&key=${apiKey}`;

  try {
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) return [];

    const data = await response.json() as { results?: GooglePlacesResult[]; status?: string };
    if (data.status !== "OK" || !data.results) return [];

    return data.results.slice(0, limit).map((place) => {
      // Extract state from formatted_address (last part before zip/country)
      const addressParts = place.formatted_address.split(",").map((s) => s.trim());
      const stateZip = addressParts[addressParts.length - 2] ?? "";
      const extractedState = stateZip.split(" ")[0] ?? state;

      return {
        business_name: place.name,
        phone: place.formatted_phone_number ?? null,
        website_url: place.website ?? null,
        industry: industry.industry,
        state: extractedState.length === 2 ? extractedState : state,
        source: "google_places",
        raw_payload: place as unknown as Json
      };
    });
  } catch (err) {
    logger.warn("lead_acquisition_google_places_failed", {
      keyword: industry.keyword,
      state,
      error: err instanceof Error ? err.message : "unknown"
    });
    return [];
  }
}

async function enrichGooglePlacesDetails(apiKey: string, leads: RawBusinessLead[]): Promise<RawBusinessLead[]> {
  const enriched: RawBusinessLead[] = [];

  for (const lead of leads) {
    const payload = lead.raw_payload && typeof lead.raw_payload === "object" ? (lead.raw_payload as Record<string, unknown>) : {};
    const placeId = typeof payload.place_id === "string" ? payload.place_id : null;

    if (!placeId) {
      enriched.push(lead);
      continue;
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=formatted_phone_number,website,url&key=${apiKey}`;
      const response = await fetch(url, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) {
        enriched.push(lead);
        continue;
      }

      const data = await response.json() as { status?: string; result?: GooglePlaceDetails };
      if (data.status !== "OK" || !data.result) {
        enriched.push(lead);
        continue;
      }

      enriched.push({
        ...lead,
        phone: lead.phone ?? data.result.formatted_phone_number ?? null,
        website_url: lead.website_url ?? data.result.website ?? data.result.url ?? null,
        raw_payload: {
          ...payload,
          details: data.result
        } as unknown as Json
      });
    } catch (err) {
      logger.warn("lead_acquisition_google_places_details_failed", {
        business_name: lead.business_name,
        error: err instanceof Error ? err.message : "unknown"
      });
      enriched.push(lead);
    }
  }

  return enriched;
}

async function discoverGooglePlacesBatch(
  apiKey: string,
  industry: { keyword: string; industry: string; placeType: string },
  state: string,
  limit: number
) {
  const places = await discoverViaGooglePlaces(apiKey, industry, state, limit);
  return enrichGooglePlacesDetails(apiKey, places);
}

// ─────────────────────────────────────────────
// Source 2: OpenCorporates (free public API)
// ─────────────────────────────────────────────

interface OpenCorporatesCompany {
  company: {
    name: string;
    company_type: string | null;
    current_status: string | null;
    incorporation_date: string | null;
    registered_address?: {
      region?: string | null;
      locality?: string | null;
    } | null;
    company_number: string;
  };
}

async function discoverViaOpenCorporates(
  keyword: string,
  industry: string,
  state: string,
  limit: number
): Promise<RawBusinessLead[]> {
  const jurisdiction = `us_${state.toLowerCase()}`;
  const url = `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(keyword)}&jurisdiction_code=${jurisdiction}&inactive=false&current_status=Active&per_page=${Math.min(limit, 20)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Operion Capital Lead Acquisition Agent (business-funding-research)"
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) return [];

    const data = await response.json() as { results?: { companies?: OpenCorporatesCompany[] } };
    const companies = data.results?.companies ?? [];

    return companies.map((entry) => {
      const co = entry.company;
      let timeInBusiness: number | null = null;
      if (co.incorporation_date) {
        const incorporated = new Date(co.incorporation_date);
        timeInBusiness = Math.max(0, (Date.now() - incorporated.getTime()) / (1000 * 60 * 60 * 24 * 365));
      }

      return {
        business_name: co.name,
        industry,
        state: co.registered_address?.region ?? state,
        time_in_business_years: timeInBusiness,
        source: "opencorporates",
        source_record_id: co.company_number,
        raw_payload: co as unknown as Json
      };
    });
  } catch (err) {
    logger.warn("lead_acquisition_opencorporates_failed", {
      keyword,
      state,
      error: err instanceof Error ? err.message : "unknown"
    });
    return [];
  }
}

// ─────────────────────────────────────────────
// Source 3: Claude AI Seed (fallback when no APIs configured)
// ─────────────────────────────────────────────

interface ClaudeLeadProfile {
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  industry: string;
  state: string;
  annual_revenue_est: number | null;
  time_in_business_years: number | null;
}

async function discoverViaClaudeSeed(
  apiKey: string,
  model: string,
  industries: Array<{ keyword: string; industry: string }>,
  states: string[],
  count: number
): Promise<RawBusinessLead[]> {
  const industryList = industries.slice(0, 4).map((i) => i.industry).join(", ");
  const stateList = states.slice(0, 5).join(", ");

  const prompt = `You are a business data researcher specializing in small business profiles for the MCA (Merchant Cash Advance) and working capital lending industry.

Generate ${count} realistic small business prospect profiles for MCA lead discovery. Focus on businesses in these industries: ${industryList}. Businesses should be located in: ${stateList}.

Requirements:
- These should represent realistic small businesses that commonly seek working capital
- Include a mix of business types: sole proprietors, LLCs, and S-Corps
- Revenue should range from $15K-$150K/month (typical MCA range)
- Time in business: 1-8 years
- Include realistic (but not real) contact info formatted correctly
- Phone numbers: US format with area codes appropriate to the state
- Email: professional email using domain based on business name

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "business_name": "...",
    "contact_name": "First Last",
    "phone": "+1XXXXXXXXXX",
    "email": "owner@businessdomain.com",
    "website_url": "https://businessdomain.com",
    "industry": "restaurant|automotive|construction|healthcare|beauty|logistics|retail",
    "state": "2-letter state code",
    "annual_revenue_est": <integer USD>,
    "time_in_business_years": <decimal years>
  }
]`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 2500,
        temperature: 0,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      logger.error("lead_acquisition_claude_seed_api_error", {
        status: response.status,
        error: errText.slice(0, 300),
        model
      });
      return [];
    }

    const data = await response.json() as { content?: Array<{ type: string; text?: string }> };
    const rawText = data.content?.find((c) => c.type === "text")?.text ?? "";
    const cleanText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    if (!cleanText) {
      logger.warn("lead_acquisition_claude_seed_empty_response", { model, count });
      return [];
    }

    const profiles = JSON.parse(cleanText) as ClaudeLeadProfile[];
    if (!Array.isArray(profiles) || profiles.length === 0) {
      logger.warn("lead_acquisition_claude_seed_no_profiles", { raw: cleanText.slice(0, 200), count });
      return [];
    }

    logger.info("lead_acquisition_claude_seed_success", { generated: profiles.length, model });

    return profiles.map((p) => ({
      business_name: p.business_name,
      contact_name: p.contact_name,
      phone: p.phone,
      email: p.email,
      website_url: p.website_url,
      industry: p.industry,
      state: p.state,
      annual_revenue_est: p.annual_revenue_est,
      time_in_business_years: p.time_in_business_years,
      source: "ai_seed",
      raw_payload: p as unknown as Json
    }));
  } catch (err) {
    logger.error("lead_acquisition_claude_seed_exception", {
      error: err instanceof Error ? err.message : "unknown",
      model,
      count
    });
    return [];
  }
}

// ─────────────────────────────────────────────
// Main agent entry point
// ─────────────────────────────────────────────

export interface LeadAcquisitionAgentOptions {
  limit?: number;
  sources?: Array<"google_places" | "opencorporates" | "ai_seed">;
  industries?: string[];
  states?: string[];
  researchMode?: boolean;
}

export async function runLeadAcquisitionAgent(
  options: LeadAcquisitionAgentOptions = {}
): Promise<AcquisitionAgentResult> {
  const env = readServerEnv();
  const limit = Math.min(options.limit ?? 30, 100);
  const targetStates = options.states?.length ? options.states : PRIORITY_STATES.slice(0, 4);
  const targetIndustries = MCA_INDUSTRIES.filter((i) =>
    !options.industries?.length || options.industries.includes(i.industry)
  );

  const result: AcquisitionAgentResult = {
    total_fetched: 0,
    inserted: 0,
    duplicates: 0,
    failed: 0,
    sources_used: [],
    items: []
  };

  // ── Collect raw leads from all available sources ──
  const rawLeads: RawBusinessLead[] = [];

  const hasGooglePlaces = Boolean(env.GOOGLE_PLACES_API_KEY);
  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY);
  const allowAiSeed = options.researchMode === true;
  const requestedSources = allowAiSeed ? options.sources ?? ["google_places"] : ["google_places"];

  if (!allowAiSeed && !hasGooglePlaces) {
    throw new ConfigurationError("GOOGLE_PLACES_API_KEY is required for production lead acquisition");
  }

  // Source 1: Google Places
  if (hasGooglePlaces && requestedSources.includes("google_places")) {
    result.sources_used.push("google_places");
    const perTarget = Math.ceil(limit / (targetIndustries.length * targetStates.length));
    for (const industry of targetIndustries.slice(0, 3)) {
      for (const state of targetStates.slice(0, 2)) {
        const found = await discoverGooglePlacesBatch(
          env.GOOGLE_PLACES_API_KEY as string,
          industry,
          state,
          perTarget
        );
        rawLeads.push(...found);
        if (rawLeads.length >= limit) break;
      }
      if (rawLeads.length >= limit) break;
    }
    logger.info("lead_acquisition_google_places_done", { fetched: rawLeads.length });
  }

  // Source 2: OpenCorporates (free public registry)
  if (requestedSources.includes("opencorporates") && rawLeads.length < limit) {
    result.sources_used.push("opencorporates");
    const needed = limit - rawLeads.length;
    const perTarget = Math.max(1, Math.ceil(needed / (targetIndustries.length * targetStates.length)));
    for (const industry of targetIndustries.slice(0, 3)) {
      for (const state of targetStates.slice(0, 3)) {
        const found = await discoverViaOpenCorporates(
          industry.keyword,
          industry.industry,
          state,
          perTarget
        );
        rawLeads.push(...found);
        if (rawLeads.length >= limit) break;
      }
      if (rawLeads.length >= limit) break;
    }
    logger.info("lead_acquisition_opencorporates_done", { fetched: rawLeads.length });
  }

  // Source 3: Claude AI Seed (when Anthropic is configured)
  if (allowAiSeed && hasAnthropic && requestedSources.includes("ai_seed") && rawLeads.length < limit) {
    result.sources_used.push("ai_seed");
    const needed = Math.min(limit - rawLeads.length, 20);
    const seedLeads = await discoverViaClaudeSeed(
      env.ANTHROPIC_API_KEY as string,
      selectAnthropicModel(env, "default"),
      targetIndustries,
      targetStates,
      needed
    );
    rawLeads.push(...seedLeads);
    logger.info("lead_acquisition_ai_seed_done", { generated: seedLeads.length });
  }

  result.total_fetched = rawLeads.length;
  logger.info("lead_acquisition_agent_processing", {
    total: rawLeads.length,
    sources: result.sources_used
  });

  // ── Process each raw lead: normalize → dedup → score → insert ──
  for (const raw of rawLeads.slice(0, limit)) {
    try {
      const normalized = normalizeBusinessLead(raw);
      const validation = await validateAcquisitionLead({
        businessName: normalized.business_name,
        websiteUrl: normalized.website_url,
        email: normalized.email,
        phone: normalized.phone,
        businessCategory: normalized.industry,
        source: raw.source
      });
      const quality = applyValidationToQuality(scoreLeadQuality(normalized), validation);

      // Deduplication check
      const existing = await acquisitionRepository.findLeadByEmailOrName({
        email: normalized.email,
        businessName: normalized.business_name,
        domain: normalized.domain
      });

      if (existing.length > 0) {
        result.duplicates++;
        result.items.push({
          business_name: normalized.business_name,
          state: normalized.state,
          industry: normalized.industry,
          score: quality.score,
          tier: quality.tier,
          source: raw.source ?? "unknown",
          status: "duplicate"
        });
        continue;
      }

      // Insert with pending_approval status — no autonomous action
      const isResearchLead = raw.source === "ai_seed" || options.researchMode === true;
      const leadStatus = validation.status === "invalid" ? "rejected" : "pending_approval";
      const validationMetadata = {
        status: validation.status,
        website_verified: validation.website_verified,
        email_verified: validation.email_verified,
        phone_verified: validation.phone_verified,
        business_verified: validation.business_verified,
        validation_score: validation.validation_score,
        validation_reason: validation.validation_reason,
        validation_flags: validation.flags
      };

      const lead = await leadsRepository.create({
        business_name: normalized.business_name,
        contact_name: normalized.contact_name,
        email: normalized.email,
        phone: normalized.phone,
        industry: normalized.industry,
        state: normalized.state,
        annual_revenue_est: normalized.annual_revenue_est,
        time_in_business_years: normalized.time_in_business_years,
        qualification_score: quality.score,
        tier: quality.tier,
        status: leadStatus,
        website_verified: validation.website_verified,
        email_verified: validation.email_verified,
        phone_verified: validation.phone_verified,
        business_verified: validation.business_verified,
        validation_score: validation.validation_score,
        validation_reason: validation.validation_reason,
        validation_timestamp: validation.validation_timestamp,
        is_test_data: isResearchLead,
        ai_summary: quality.score >= 65
          ? `Tier ${quality.tier} prospect: ${quality.reasons.join(", ")}. Discovered via ${raw.source ?? "agent"}.`
          : null,
        internal_notes: JSON.stringify({
          discovery_source: raw.source ?? "lead_acquisition_agent",
          discovered_by: "lead_acquisition_agent",
          discovered_at: new Date().toISOString(),
          website_url: normalized.website_url,
          score_reasons: quality.reasons,
          validation: validationMetadata,
          source_record_id: raw.source_record_id ?? null
        })
      });

      await writeAuditLog({
        eventType: "lead_acquired",
        actorType: "system",
        actorId: "lead_acquisition_agent",
        entityType: "lead",
        entityId: lead.id,
        metadata: {
          business_name: normalized.business_name,
          state: normalized.state,
          industry: normalized.industry,
          score: quality.score,
          tier: quality.tier,
          source: raw.source ?? "unknown"
        } as Json
      });

      result.inserted++;
      result.items.push({
        business_name: normalized.business_name,
        state: normalized.state,
        industry: normalized.industry,
        score: quality.score,
        tier: quality.tier,
        source: raw.source ?? "unknown",
        status: "inserted",
        reason: validation.validation_reason
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logger.error("lead_acquisition_record_failed", {
        business_name: raw.business_name,
        error: msg
      });
      result.failed++;
      result.items.push({
        business_name: raw.business_name,
        state: raw.state ?? null,
        industry: raw.industry ?? null,
        score: 0,
        tier: "D",
        source: raw.source ?? "unknown",
        status: "failed",
        reason: msg
      });
    }
  }

  logger.info("lead_acquisition_agent_done", {
    total_fetched: result.total_fetched,
    inserted: result.inserted,
    duplicates: result.duplicates,
    failed: result.failed,
    sources: result.sources_used
  });

  return result;
}
