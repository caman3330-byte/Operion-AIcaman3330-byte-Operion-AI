import type { Json, MerchantAcquisitionSource, MerchantSourceHealthStatus } from "@operion/shared";
import { deduplicateAcquisitionRecords } from "@/lib/acquisition/deduplication";
import { getAcquisitionAdapter } from "@/lib/acquisition/adapters/registry";
import type { FreeFirstSourceKey } from "@/lib/acquisition/adapters/types";
import { ingestLeadBatch } from "@/lib/acquisition/pipeline";
import { normalizeBusinessLead } from "@/lib/acquisition/normalization";
import { scoreLeadQuality } from "@/lib/acquisition/scoring";
import { applyValidationToQuality, validateAcquisitionLead } from "@/lib/acquisition/validation";
import { logger } from "@/lib/logger";
import { acquisitionRepository } from "@/lib/repositories/acquisition";

export interface MerchantSourceScanOptions {
  limit?: number;
  sourceLimit?: number;
  importVerified?: boolean;
  requestedBy: string;
}

export async function scanMerchantAcquisitionSources(options: MerchantSourceScanOptions) {
  const sources = (await acquisitionRepository.listMerchantSources({ activeOnly: true, limit: options.sourceLimit ?? 10 }))
    .filter((source) => source.health_status !== "blocked" && source.health_status !== "disabled");
  const results = [];

  for (const source of sources) {
    results.push(await scanMerchantSource(source, options));
  }

  return {
    scanned: results.length,
    extracted: results.reduce((sum, result) => sum + result.extracted_businesses, 0),
    verified: results.reduce((sum, result) => sum + result.verified_businesses, 0),
    rejected: results.reduce((sum, result) => sum + result.rejected_businesses, 0),
    duplicates: results.reduce((sum, result) => sum + result.duplicate_businesses, 0),
    imported: results.reduce((sum, result) => sum + result.imported, 0),
    results
  };
}

async function scanMerchantSource(source: MerchantAcquisitionSource, options: MerchantSourceScanOptions) {
  const scan = await acquisitionRepository.createMerchantSourceScan({
    source_id: source.id,
    status: "running",
    metadata: { source_url: source.source_url, source_name: source.source_name } as Json
  });

  try {
    const adapterKey = sourceToAdapterKey(source);
    const discovery = await getAcquisitionAdapter(adapterKey).discover({
      urls: [source.source_url],
      category: source.industry,
      location: source.state ?? undefined,
      limit: options.limit ?? 25
    });
    const deduped = deduplicateAcquisitionRecords(discovery.records);
    const previews = [];
    let databaseDuplicates = 0;

    for (const record of deduped.unique) {
      const normalized = normalizeBusinessLead(record);
      const existing = await acquisitionRepository.findLeadByEmailOrName({
        businessName: normalized.business_name,
        email: normalized.email,
        phone: normalized.phone,
        domain: normalized.domain
      });
      if (existing.length > 0) {
        databaseDuplicates += 1;
        continue;
      }

      const validation = await validateAcquisitionLead({
        businessName: normalized.business_name,
        websiteUrl: normalized.website_url,
        email: normalized.email,
        phone: normalized.phone,
        businessCategory: normalized.industry ?? source.industry,
        source: record.source,
        sourcePageUrl: readSourcePageUrl(record)
      });
      const quality = applyValidationToQuality(scoreLeadQuality(normalized, source.industry, { uniqueDomain: true }), validation);
      previews.push({ record, validation, quality });
    }

    const importable = previews.filter((preview) => preview.validation.status === "verified" && preview.quality.score >= 80);
    let imported = 0;
    if (options.importVerified) {
      const ingest = await ingestLeadBatch({
        sourceKey: adapterKey,
        records: importable.map((preview) => preview.record),
        requestedBy: options.requestedBy,
        isTestData: false
      });
      imported = ingest.created.length;
      databaseDuplicates += ingest.duplicates.length;
    }

    const robotsBlocked = discovery.errors.some((error) => error.toLowerCase().includes("blocked by robots"));
    const verified = importable.length;
    const rejected = previews.length - verified;
    const duplicateCount = deduped.duplicates.length + databaseDuplicates;
    const status = discovery.errors.length > 0 && discovery.records.length === 0 ? "failed" : "completed";
    const healthStatus = nextHealthStatus({
      previous: source.health_status,
      status,
      robotsBlocked,
      extracted: discovery.records.length,
      errors: discovery.errors.length
    });
    const sourceTotals = calculateSourceTotals(source, {
      success: status === "completed",
      robotsBlocked,
      extracted: discovery.records.length
    });

    await acquisitionRepository.updateMerchantSourceScan(scan.id, {
      status,
      completed_at: new Date().toISOString(),
      extracted_businesses: discovery.records.length,
      verified_businesses: verified,
      rejected_businesses: rejected,
      duplicate_businesses: duplicateCount,
      robots_blocked: robotsBlocked,
      error_message: discovery.errors.join("; ") || null,
      metadata: {
        adapter_key: adapterKey,
        source_errors: discovery.errors,
        imported
      } as Json
    });
    await acquisitionRepository.updateMerchantSource(source.id, {
      health_status: healthStatus,
      last_scanned_at: new Date().toISOString(),
      success_rate: sourceTotals.successRate,
      scan_success_count: sourceTotals.successCount,
      scan_failure_count: sourceTotals.failureCount,
      robots_blocked_count: sourceTotals.robotsBlockedCount,
      extracted_business_count: sourceTotals.extractedBusinessCount,
      last_error: discovery.errors.join("; ") || null
    });

    return {
      source_id: source.id,
      source_name: source.source_name,
      status,
      health_status: healthStatus,
      extracted_businesses: discovery.records.length,
      verified_businesses: verified,
      rejected_businesses: rejected,
      duplicate_businesses: duplicateCount,
      imported,
      errors: discovery.errors
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown source scan error";
    const sourceTotals = calculateSourceTotals(source, { success: false, robotsBlocked: false, extracted: 0 });
    await acquisitionRepository.updateMerchantSourceScan(scan.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: message
    });
    await acquisitionRepository.updateMerchantSource(source.id, {
      health_status: nextHealthStatus({ previous: source.health_status, status: "failed", robotsBlocked: false, extracted: 0, errors: 1 }),
      last_scanned_at: new Date().toISOString(),
      success_rate: sourceTotals.successRate,
      scan_failure_count: sourceTotals.failureCount,
      last_error: message
    });
    logger.warn("merchant_source_scan_failed", { source_id: source.id, source_url: source.source_url, error: message });
    return {
      source_id: source.id,
      source_name: source.source_name,
      status: "failed" as const,
      health_status: "degraded" as const,
      extracted_businesses: 0,
      verified_businesses: 0,
      rejected_businesses: 0,
      duplicate_businesses: 0,
      imported: 0,
      errors: [message]
    };
  }
}

function sourceToAdapterKey(source: MerchantAcquisitionSource): FreeFirstSourceKey {
  if (source.source_type === "chamber") return "chamber_directories";
  if (source.source_type === "association") return "industry_associations";
  if (source.source_type === "contractor_listing" || source.source_type === "directory") return "public_business_directories";
  return "company_websites";
}

function nextHealthStatus(input: {
  previous: MerchantSourceHealthStatus;
  status: "completed" | "failed";
  robotsBlocked: boolean;
  extracted: number;
  errors: number;
}): MerchantSourceHealthStatus {
  if (input.previous === "disabled") return "disabled";
  if (input.robotsBlocked) return "blocked";
  if (input.status === "failed" || (input.errors > 0 && input.extracted === 0)) return "degraded";
  return "active";
}

function calculateSourceTotals(
  source: MerchantAcquisitionSource,
  result: { success: boolean; robotsBlocked: boolean; extracted: number }
) {
  const successCount = source.scan_success_count + (result.success ? 1 : 0);
  const failureCount = source.scan_failure_count + (result.success ? 0 : 1);
  const totalScans = successCount + failureCount;
  return {
    successCount,
    failureCount,
    robotsBlockedCount: source.robots_blocked_count + (result.robotsBlocked ? 1 : 0),
    extractedBusinessCount: source.extracted_business_count + result.extracted,
    successRate: totalScans === 0 ? 0 : Math.round((successCount / totalScans) * 10000) / 100
  };
}

function readSourcePageUrl(record: { raw_payload?: unknown }) {
  if (!record.raw_payload || typeof record.raw_payload !== "object" || Array.isArray(record.raw_payload)) return null;
  const value = (record.raw_payload as Record<string, unknown>).source_url;
  return typeof value === "string" ? value : null;
}
