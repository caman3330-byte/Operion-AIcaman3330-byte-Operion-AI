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
    async discover() {
      return {
        sourceKey: "google_places",
        records: [],
        errors: [],
        metadata: { status: "placeholder", enabled: false, reason: "future_optional_adapter" } as Json
      };
    }
  }
};

export function getAcquisitionAdapter(sourceKey: FreeFirstSourceKey) {
  return adapters[sourceKey];
}

async function discoverWithApollo(input: AcquisitionAdapterInput): Promise<AcquisitionAdapterResult> {
  const env = readServerEnv();
  if (!env.APOLLO_API_KEY) {
    return {
      sourceKey: "apollo",
      records: [],
      errors: [],
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
