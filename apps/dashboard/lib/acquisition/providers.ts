import type { AcquisitionProvider, Json, LeadSourceType } from "@operion/shared";
import { ConfigurationError, ValidationError } from "@/lib/errors";
import { simulationRepository } from "@/lib/repositories/simulation";

export interface AcquisitionProviderRequest {
  providerKey: string;
  query?: string;
  location?: string;
  records?: Json[];
  limit?: number;
}

export interface AcquisitionProviderResult {
  provider_key: string;
  source_type: LeadSourceType;
  accepted: boolean;
  records: Json[];
  latency_ms: number;
  message: string;
}

export interface AcquisitionProviderAdapter {
  providerKey: string;
  sourceType: LeadSourceType;
  capabilities: string[];
  execute(request: AcquisitionProviderRequest, provider: AcquisitionProvider): Promise<AcquisitionProviderResult>;
}

const adapters: Record<string, AcquisitionProviderAdapter> = {
  simulation: createAdapter("simulation", "api", ["lead_generation", "stress_testing", "replay"]),
  csv_ingestion: createAdapter("csv_ingestion", "manual_upload", ["batch_ingestion", "normalization"]),
  api_ingestion: createAdapter("api_ingestion", "api", ["batch_ingestion", "webhook_ingestion"]),
  apollo: createExternalPlaceholder("apollo", "apollo", "Configure Apollo endpoint mapping before live discovery."),
  google_maps: createExternalPlaceholder("google_maps", "google_maps", "Connect an approved Google Maps/business directory provider before live scraping."),
  website_scraper: createExternalPlaceholder("website_scraper", "website", "Connect website scraping extraction workflow before live contact discovery."),
  business_directory: createExternalPlaceholder("business_directory", "directory", "Connect directory source workflow before live business discovery.")
};

export async function listAcquisitionProviders() {
  return simulationRepository.listProviders();
}

export async function setProviderEnabled(providerKey: string, enabled: boolean, updatedBy: string) {
  const provider = await simulationRepository.updateProvider(providerKey, {
    enabled,
    status: enabled ? "enabled" : "disabled",
    last_checked_at: new Date().toISOString()
  });
  return { provider, updated_by: updatedBy };
}

export async function executeProvider(request: AcquisitionProviderRequest) {
  const providers = await simulationRepository.listProviders();
  const provider = providers.find((candidate) => candidate.provider_key === request.providerKey);
  if (!provider) {
    throw new ValidationError(`Acquisition provider is not registered: ${request.providerKey}`);
  }

  if (!provider.enabled) {
    throw new ConfigurationError(`Acquisition provider is disabled: ${request.providerKey}`);
  }

  const adapter = adapters[request.providerKey];
  if (!adapter) {
    throw new ConfigurationError(`No adapter is registered for provider: ${request.providerKey}`);
  }

  const startedAt = Date.now();
  try {
    const result = await adapter.execute(request, provider);
    await simulationRepository.updateProvider(request.providerKey, {
      status: "enabled",
      last_latency_ms: result.latency_ms,
      last_error: null,
      last_checked_at: new Date().toISOString()
    });
    return result;
  } catch (error) {
    await simulationRepository.updateProvider(request.providerKey, {
      status: "degraded",
      failure_count: provider.failure_count + 1,
      last_latency_ms: Date.now() - startedAt,
      last_error: error instanceof Error ? error.message : "Unknown provider execution error",
      last_checked_at: new Date().toISOString()
    });
    throw error;
  }
}

function createAdapter(providerKey: string, sourceType: LeadSourceType, capabilities: string[]): AcquisitionProviderAdapter {
  return {
    providerKey,
    sourceType,
    capabilities,
    async execute(request) {
      const startedAt = Date.now();
      return {
        provider_key: providerKey,
        source_type: sourceType,
        accepted: true,
        records: request.records ?? [],
        latency_ms: Date.now() - startedAt,
        message: `${providerKey} accepted ${request.records?.length ?? 0} record(s).`
      };
    }
  };
}

function createExternalPlaceholder(providerKey: string, sourceType: LeadSourceType, message: string): AcquisitionProviderAdapter {
  return {
    providerKey,
    sourceType,
    capabilities: [],
    async execute() {
      throw new ConfigurationError(message, { provider_key: providerKey });
    }
  };
}
