import type { Json } from "@operion/shared";
import { ConfigurationError } from "@/lib/errors";
import { readServerEnv } from "@/lib/env";
import { recordApiUsage } from "@/lib/api-usage";
import { logger } from "@/lib/logger";
import type { RawBusinessLead } from "@/lib/acquisition/normalization";

export interface DiscoveryQuery {
  sourceKey: "apollo" | "google_maps" | "website_extraction" | "manual_upload" | "n8n_webhook";
  query?: string;
  industry?: string;
  location?: string;
  limit?: number;
  websiteUrl?: string;
  records?: RawBusinessLead[];
}

export interface DiscoveryResult {
  sourceKey: string;
  records: RawBusinessLead[];
  metadata: Json;
}

export async function discoverBusinesses(input: DiscoveryQuery): Promise<DiscoveryResult> {
  switch (input.sourceKey) {
    case "apollo":
      return discoverWithApollo(input);
    case "google_maps":
      return discoverWithGoogleMaps(input);
    case "website_extraction":
      return extractFromWebsite(input);
    case "manual_upload":
    case "n8n_webhook":
      return {
        sourceKey: input.sourceKey,
        records: input.records ?? [],
        metadata: { supplied_records: input.records?.length ?? 0 }
      };
    default:
      return exhaustive(input.sourceKey);
  }
}

async function discoverWithApollo(input: DiscoveryQuery): Promise<DiscoveryResult> {
  const env = readServerEnv();
  if (!env.APOLLO_API_KEY) {
    throw new ConfigurationError("APOLLO_API_KEY is required for Apollo discovery");
  }

  const startedAt = Date.now();
  try {
    // Apollo endpoints differ by account/product. This adapter intentionally keeps
    // one boundary for future account-specific mapping instead of scattering HTTP
    // details through the acquisition pipeline.
    throw new ConfigurationError("Apollo endpoint mapping is not configured for this workspace", {
      source: "apollo",
      expected: "Configure Apollo search endpoint and field mapper before enabling live discovery."
    });
  } finally {
    await recordApiUsage({
      service: "apollo",
      operation: "business_discovery",
      success: false,
      latencyMs: Date.now() - startedAt,
      estimatedCostUsd: 0
    }).catch((error) => logger.warn("apollo_usage_log_failed", { error }));
  }
}

async function discoverWithGoogleMaps(input: DiscoveryQuery): Promise<DiscoveryResult> {
  throw new ConfigurationError("Google Maps/business directory discovery connector is not configured", {
    source: "google_maps",
    query: input.query ?? null,
    location: input.location ?? null,
    expected: "Connect an approved Maps/directory provider or n8n workflow before live scraping."
  });
}

async function extractFromWebsite(input: DiscoveryQuery): Promise<DiscoveryResult> {
  if (!input.websiteUrl) {
    throw new ConfigurationError("websiteUrl is required for website contact extraction");
  }

  return {
    sourceKey: "website_extraction",
    records: [
      {
        business_name: input.query ?? input.websiteUrl,
        website_url: input.websiteUrl,
        raw_payload: {
          extraction_status: "pending_connector",
          website_url: input.websiteUrl
        }
      }
    ],
    metadata: {
      extraction_status: "pending_connector",
      website_url: input.websiteUrl
    }
  };
}

function exhaustive(value: never): never {
  throw new ConfigurationError(`Unsupported discovery source: ${String(value)}`);
}
