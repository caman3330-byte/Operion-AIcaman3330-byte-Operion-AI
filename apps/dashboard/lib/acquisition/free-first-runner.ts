import type { Json, LeadTier } from "@operion/shared";
import { applyValidationToQuality, validateAcquisitionLead, type LeadValidationStatus } from "@/lib/acquisition/validation";
import { deduplicateAcquisitionRecords } from "@/lib/acquisition/deduplication";
import { getAcquisitionAdapter } from "@/lib/acquisition/adapters/registry";
import type { FreeFirstSourceKey } from "@/lib/acquisition/adapters/types";
import { normalizeBusinessLead, type RawBusinessLead } from "@/lib/acquisition/normalization";
import { ingestLeadBatch } from "@/lib/acquisition/pipeline";
import { scoreLeadQuality } from "@/lib/acquisition/scoring";
import { logger } from "@/lib/logger";
import { acquisitionRepository } from "@/lib/repositories/acquisition";

export interface FreeFirstRunInput {
  sourceKeys: FreeFirstSourceKey[];
  query?: string | undefined;
  category?: string | undefined;
  location?: string | undefined;
  urls?: string[] | undefined;
  limit: number;
  dryRun: boolean;
  requestedBy: string;
}

interface AcquisitionPreview {
  record: RawBusinessLead;
  validation_status: LeadValidationStatus;
  validation_reason: string;
  validation_score: number;
  quality_score: number;
  tier: LeadTier;
}

export async function runFreeFirstAcquisition(input: FreeFirstRunInput) {
  const startedAt = new Date().toISOString();
  const job = await acquisitionRepository.createJob({
    job_type: "business_discovery",
    status: "running",
    requested_by: input.requestedBy,
    assigned_agent_key: "lead_generation_agent",
    is_test_data: input.dryRun,
    started_at: startedAt,
    parameters: {
      source_keys: input.sourceKeys,
      query: input.query ?? null,
      category: input.category ?? null,
      location: input.location ?? null,
      limit: input.limit,
      dry_run: input.dryRun
    } as Json
  });

  try {
    const discoveryResults = [];
    for (const sourceKey of input.sourceKeys) {
      const result = await getAcquisitionAdapter(sourceKey).discover({
        query: input.query,
        category: input.category,
        location: input.location,
        urls: input.urls,
        limit: input.limit
      });
      discoveryResults.push(result);
    }

    const discovered = discoveryResults.flatMap((result) => result.records).slice(0, input.limit);
    const batchDeduplication = deduplicateAcquisitionRecords(discovered);
    const previews: AcquisitionPreview[] = [];
    const databaseDuplicates: Array<{ business_name: string; reason: string }> = [];

    for (const record of batchDeduplication.unique) {
      const normalized = normalizeBusinessLead(record);
      const existing = await acquisitionRepository.findLeadByEmailOrName({
        businessName: normalized.business_name,
        email: normalized.email,
        phone: normalized.phone,
        domain: normalized.domain
      });
      if (existing.length > 0) {
        databaseDuplicates.push({ business_name: normalized.business_name, reason: "existing_production_record" });
        continue;
      }

      const validation = await validateAcquisitionLead({
        businessName: normalized.business_name,
        websiteUrl: normalized.website_url,
        email: normalized.email,
        phone: normalized.phone,
        businessCategory: normalized.industry,
        source: record.source,
        sourcePageUrl: readSourcePageUrl(record)
      });
      const quality = applyValidationToQuality(scoreLeadQuality(normalized, input.category, { uniqueDomain: true }), validation);
      previews.push({
        record,
        validation_status: validation.status,
        validation_reason: validation.validation_reason,
        validation_score: validation.validation_score,
        quality_score: quality.score,
        tier: quality.tier
      });
    }

    const importable = previews.filter((preview) => preview.validation_status === "verified" && preview.quality_score >= 80);
    let imported = 0;
    let ingestionFailed = 0;
    if (!input.dryRun) {
      for (const [sourceKey, sourceRecords] of groupBySource(importable.map((preview) => preview.record))) {
        const ingest = await ingestLeadBatch({
          sourceKey,
          records: sourceRecords,
          requestedBy: input.requestedBy,
          isTestData: false
        });
        imported += ingest.created.length;
        ingestionFailed += ingest.failed.length;
      }
    }

    const counts = {
      discovered: discovered.length,
      previewed: previews.length,
      verified: countStatus(previews, "verified"),
      unverified: countStatus(previews, "unverified"),
      invalid: countStatus(previews, "invalid"),
      duplicates: batchDeduplication.duplicates.length + databaseDuplicates.length,
      imported,
      failed: ingestionFailed + discoveryResults.reduce((sum, result) => sum + result.errors.length, 0),
      source_breakdown: Object.fromEntries(discoveryResults.map((result) => [
        result.sourceKey,
        {
          discovered: result.records.length,
          qualified: previews.filter(
            (preview) => preview.record.source === result.sourceKey && preview.validation_status === "verified"
          ).length,
          errors: result.errors.length
        }
      ]))
    };

    await acquisitionRepository.updateJob(job.id, {
      status: "completed",
      counts: counts as Json,
      result_summary: input.dryRun
        ? `Dry run previewed ${counts.previewed} unique lead(s); no production leads created.`
        : `Imported ${counts.imported} verified lead(s); unverified and invalid records were not imported.`,
      error_message: discoveryResults.flatMap((result) => result.errors).slice(0, 10).join("; ") || null,
      completed_at: new Date().toISOString()
    });

    logger.info("free_first_acquisition_completed", { job_id: job.id, dry_run: input.dryRun, ...counts });
    return {
      job_id: job.id,
      dry_run: input.dryRun,
      counts,
      source_results: discoveryResults.map((result) => ({
        source: result.sourceKey,
        found: result.records.length,
        errors: result.errors,
        metadata: result.metadata
      })),
      duplicates: [...batchDeduplication.duplicates, ...databaseDuplicates],
      preview: previews.slice(0, 50)
    };
  } catch (error) {
    await acquisitionRepository.updateJob(job.id, {
      status: "failed",
      error_message: error instanceof Error ? error.message : "Unknown free-first acquisition error",
      completed_at: new Date().toISOString()
    });
    throw error;
  }
}

function readSourcePageUrl(record: RawBusinessLead) {
  if (!record.raw_payload || typeof record.raw_payload !== "object" || Array.isArray(record.raw_payload)) return null;
  const value = (record.raw_payload as Record<string, unknown>).source_url;
  return typeof value === "string" ? value : null;
}

function countStatus(records: Array<{ validation_status: LeadValidationStatus }>, status: LeadValidationStatus) {
  return records.filter((record) => record.validation_status === status).length;
}

function groupBySource(records: RawBusinessLead[]) {
  const groups = new Map<string, RawBusinessLead[]>();
  for (const record of records) {
    const source = record.source ?? "website_extraction";
    groups.set(source, [...(groups.get(source) ?? []), record]);
  }
  return groups;
}
