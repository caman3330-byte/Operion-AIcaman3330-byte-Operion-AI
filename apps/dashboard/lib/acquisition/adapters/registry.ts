import type { Json } from "@operion/shared";
import { readServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/retry";
import { createPublicPageAdapter } from "@/lib/acquisition/adapters/public-pages";
import type {
  AcquisitionAdapterInput,
  AcquisitionAdapterResult,
  AcquisitionSourceAdapter,
  FreeFirstSourceKey
} from "@/lib/acquisition/adapters/types";

const adapters: Record<FreeFirstSourceKey, AcquisitionSourceAdapter> = {
  company_websites: createPublicPageAdapter("company_websites", "ACQUISITION_COMPANY_WEBSITE_URLS"),
  public_business_directories: createPublicPageAdapter("public_business_directories", "ACQUISITION_PUBLIC_DIRECTORY_URLS"),
  chamber_directories: createPublicPageAdapter("chamber_directories", "ACQUISITION_CHAMBER_DIRECTORY_URLS"),
  industry_associations: createPublicPageAdapter("industry_associations", "ACQUISITION_INDUSTRY_ASSOCIATION_URLS"),
  public_local_listings: createPublicPageAdapter("public_local_listings", "ACQUISITION_LOCAL_LISTING_URLS"),
  apollo: {
    key: "apollo",
    discover: discoverWithApollo
  },
  google_places: {
    key: "google_places",
    discover: discoverWithGooglePlaces
  }
};

async function discoverWithGooglePlaces(input: AcquisitionAdapterInput): Promise<AcquisitionAdapterResult> {
  const apiKey = readServerEnv().GOOGLE_PLACES_API_KEY?.trim();
  const requested = Math.min(Math.max(input.limit, 1), 20);
  const query = [input.query || input.category || "businesses", input.location].filter(Boolean).join(" in ");
  const baseMetadata = {
    provider: "google_places",
    enabled: Boolean(apiKey),
    query,
    requested_limit: requested
  };

  if (!apiKey) {
    logger.warn("google_places_discovery_disabled", { provider: "google_places", reason: "missing_server_key" });
    return {
      sourceKey: "google_places",
      records: [],
      errors: ["GOOGLE_PLACES_API_KEY is not configured"],
      metadata: { ...baseMetadata, status: "disabled", returned: 0, skipped: 0, validation_failures: 0 } as Json
    };
  }

  try {
    const response = await withRetry(
      () => fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
          "x-goog-fieldmask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.types"
        },
        body: JSON.stringify({ textQuery: query, pageSize: requested, languageCode: "en" }),
        signal: AbortSignal.timeout(input.sourceTimeoutMs ?? 12_000)
      }).catch((error: unknown) => {
        // Sanitize before the shared retry helper can log the exception.
        throw new Error(redactGoogleError(error instanceof Error ? error.message : "Google Places network request failed", apiKey));
      }),
      { operation: "acquisition.google_places_text_search", retries: 2, baseDelayMs: 500 }
    );

    const body = await response.json().catch(() => ({})) as { places?: unknown; error?: { message?: string } };
    if (!response.ok) {
      logger.warn("google_places_discovery_failed", { provider: "google_places", status: response.status });
      return {
        sourceKey: "google_places",
        records: [],
        errors: [`Google Places HTTP ${response.status}`],
        metadata: { ...baseMetadata, status: "failed", http_status: response.status, returned: 0, skipped: 0, validation_failures: 0, provider_error: body.error?.message ? redactGoogleError(body.error.message, apiKey) : null } as Json
      };
    }

    let skipped = 0;
    const records = (Array.isArray(body.places) ? body.places : []).flatMap((value) => {
      const place = asRecord(value);
      const id = stringValue(place.id);
      const displayName = asRecord(place.displayName);
      const name = stringValue(displayName.text);
      if (!id || !name) {
        skipped += 1;
        return [];
      }
      const address = stringValue(place.formattedAddress);
      const location = parseAddress(address);
      return [{
        business_name: name,
        phone: stringValue(place.nationalPhoneNumber),
        website_url: stringValue(place.websiteUri),
        address: location.address,
        zip: location.zip,
        city: location.city,
        state: location.state,
        industry: firstBusinessType(place.types) ?? input.category ?? null,
        source: "google_places",
        source_record_id: id,
        raw_payload: {
          provider: "google_places",
          place_id: id,
          formatted_address: address,
          types: Array.isArray(place.types) ? place.types : [],
          source_url: "https://www.google.com/maps/search/?api=1&query=Google&query_place_id=" + encodeURIComponent(id)
        }
      }];
    });

    logger.info("google_places_discovery_completed", { provider: "google_places", returned: records.length, skipped });
    return {
      sourceKey: "google_places",
      records,
      errors: [],
      metadata: { ...baseMetadata, status: "completed", http_status: response.status, returned: records.length, skipped, validation_failures: skipped } as Json
    };
  } catch (error) {
    const message = redactGoogleError(error instanceof Error ? error.message : "Unknown Google Places error", apiKey);
    logger.warn("google_places_discovery_error", { provider: "google_places", error: message });
    return {
      sourceKey: "google_places",
      records: [],
      errors: [message],
      metadata: { ...baseMetadata, status: "failed", returned: 0, skipped: 0, validation_failures: 0 } as Json
    };
  }
}

function redactGoogleError(message: string, apiKey: string) {
  return message.split(apiKey).join("[REDACTED]").replace(/AIza[0-9A-Za-z_-]{35}/g, "[REDACTED]");
}

function firstBusinessType(types: unknown) {
  if (!Array.isArray(types)) return null;
  const value = types.find((item) => typeof item === "string" && !["establishment", "point_of_interest"].includes(item));
  return typeof value === "string" ? value.replaceAll("_", " ") : null;
}

function parseAddress(address: string | null) {
  if (!address) return { address: null, city: null, state: null, zip: null };
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const reverseStateIndex = [...parts].reverse().findIndex((part) => /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(part));
  const stateIndex = reverseStateIndex < 0 ? -1 : parts.length - 1 - reverseStateIndex;
  const statePart = parts[stateIndex] ?? "";
  const state = statePart.match(/\b([A-Z]{2})\b/)?.[1] ?? null;
  const city = stateIndex > 0 ? parts[stateIndex - 1] ?? null : null;
  const zip = statePart.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] ?? null;
  const street = stateIndex > 1 ? parts.slice(0, stateIndex - 1).join(", ") : address;
  return { address: street, city, state, zip };
}

export function getAcquisitionAdapter(sourceKey: FreeFirstSourceKey) {
  return adapters[sourceKey];
}

async function discoverWithApollo(input: AcquisitionAdapterInput): Promise<AcquisitionAdapterResult> {
  const env = readServerEnv();
  if (!env.APOLLO_API_KEY) {
    return {
      sourceKey: "apollo",
      records: [],
      errors: ["APOLLO_API_KEY is not configured"],
      metadata: { status: "disabled", reason: "apollo_not_configured" } as Json
    };
  }

  const response = await withRetry(
    async () => {
      const result = await fetch(`${env.APOLLO_API_BASE_URL.replace(/\/$/, "")}/mixed_companies/search`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": env.APOLLO_API_KEY as string },
        body: JSON.stringify({
          q_organization_keyword_tags: input.category ? [input.category] : undefined,
          q_organization_name: input.query || undefined,
          organization_locations: input.location ? [input.location] : undefined,
          page: 1,
          per_page: Math.min(input.limit, 25)
        }),
        signal: AbortSignal.timeout(10_000)
      });
      if (result.status === 429 || result.status >= 500) throw new Error(`Apollo transient HTTP ${result.status}`);
      return result;
    },
    { operation: "acquisition.apollo_discovery", retries: 2, baseDelayMs: 750 }
  );

  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    logger.warn("acquisition_apollo_failed", { status: response.status });
    return {
      sourceKey: "apollo",
      records: [],
      errors: [`Apollo HTTP ${response.status}`],
      metadata: { status: "failed" } as Json
    };
  }

  const organizations = Array.isArray(body.organizations) ? body.organizations : [];
  const records = organizations.slice(0, input.limit).flatMap((value) => {
    const organization = asRecord(value);
    const name = stringValue(organization.name);
    if (!name) return [];
    return [{
      business_name: name,
      website_url: stringValue(organization.website_url),
      phone: stringValue(organization.phone),
      address: stringValue(organization.street_address),
      zip: stringValue(organization.postal_code),
      city: stringValue(organization.city),
      state: stringValue(organization.state),
      industry: stringValue(organization.industry) ?? input.category ?? null,
      source: "apollo",
      source_record_id: stringValue(organization.id),
      raw_payload: { provider: "apollo", acquired_at: new Date().toISOString() }
    }];
  });

  return {
    sourceKey: "apollo",
    records,
    errors: [],
    metadata: { status: "completed", returned: records.length } as Json
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
