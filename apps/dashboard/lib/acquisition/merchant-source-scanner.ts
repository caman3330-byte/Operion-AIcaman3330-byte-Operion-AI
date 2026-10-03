import type { Json, MerchantAcquisitionSource, MerchantAcquisitionSourceShard, MerchantSourceHealthStatus } from "@operion/shared";
import { randomUUID } from "node:crypto";
import { deduplicateAcquisitionRecords } from "@/lib/acquisition/deduplication";
import { getAcquisitionAdapter } from "@/lib/acquisition/adapters/registry";
import type { FreeFirstSourceKey } from "@/lib/acquisition/adapters/types";
import { ingestLeadBatch } from "@/lib/acquisition/pipeline";
import { normalizeBusinessLead } from "@/lib/acquisition/normalization";
import { scoreLeadQuality } from "@/lib/acquisition/scoring";
import { applyValidationToQuality, validateAcquisitionLead } from "@/lib/acquisition/validation";
import { enrichMerchantAcquisitionCandidate } from "@/lib/acquisition/merchant-website-enrichment";
import {
  AcquisitionTimeoutError,
  assertBudgetAvailable,
  boundedNumber,
  createRunBudget,
  remainingBudgetMs,
  runWithConcurrency,
  type AcquisitionRunBudget
} from "@/lib/acquisition/runtime-controls";
import { logger } from "@/lib/logger";
import { acquisitionRepository } from "@/lib/repositories/acquisition";

export interface MerchantSourceScanOptions {
  assertMayContinue?: () => Promise<unknown>;
  limit?: number;
  sourceLimit?: number;
  importVerified?: boolean;
  persistCandidates?: boolean;
  requestedBy: string;
  runTimeoutMs?: number;
  sourceTimeoutMs?: number;
  pageTimeoutMs?: number;
  detailTimeoutMs?: number;
  enrichmentTimeoutMs?: number;
  concurrency?: number;
  maxPages?: number;
  useShards?: boolean;
  sourceIds?: string[] | undefined;
  dryRun?: boolean;
}

const DEFAULT_SOURCE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const DEGRADED_SOURCE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RUN_TIMEOUT_MS = 55_000;
const DEFAULT_SOURCE_TIMEOUT_MS = 45_000;
const DEFAULT_PAGE_TIMEOUT_MS = 10_000;
const DEFAULT_DETAIL_TIMEOUT_MS = 8_000;
const DEFAULT_ENRICHMENT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_SOURCE_PAGES = 10;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_SHARD_SIZE = 10;
const DEFAULT_MAX_SHARDS = 25;
const DEFAULT_EMPTY_SHARD_STOP = 2;
const DEFAULT_LOCK_TTL_MS = 10 * 60 * 1000;

export async function scanMerchantAcquisitionSources(options: MerchantSourceScanOptions) {
  const sourceLimit = options.sourceLimit ?? 10;
  const runBudget = createRunBudget(options.runTimeoutMs ?? boundedNumber(process.env.MERCHANT_ACQUISITION_RUN_TIMEOUT_MS, DEFAULT_RUN_TIMEOUT_MS, 15_000, 55_000));
  const sourceConcurrency = Math.min(
    sourceLimit,
    boundedNumber(process.env.MERCHANT_ACQUISITION_SOURCE_CONCURRENCY, 1, 1, 3)
  );
  const requestedSourceIds = new Set(options.sourceIds ?? []);
  const sources = (await acquisitionRepository.listMerchantSources({ activeOnly: true, limit: Math.max(sourceLimit * 4, 50) }))
    .filter((source) => source.approval_status === "approved" && isSourceEligibleForScan(source))
    .filter((source) => requestedSourceIds.size === 0 || requestedSourceIds.has(source.id))
    .sort(compareSourceScanPriority)
    .slice(0, sourceLimit);
  if (options.dryRun) {
    return dryRunMerchantAcquisitionSources(sources, options);
  }
  const results = await runWithConcurrency(sources, sourceConcurrency, async (source) => {
    if (remainingBudgetMs(runBudget) <= 0) {
      return skippedSourceResult(source, "overall run timeout reached before this source started");
    }
    return scanMerchantSource(source, options, runBudget);
  });

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

export async function scanMerchantAcquisitionSourceById(sourceId: string, options: MerchantSourceScanOptions) {
  const source = (await acquisitionRepository.listMerchantSources({ limit: 1000 })).find((candidate) => candidate.id === sourceId);
  if (!source) throw new Error(`Merchant source not found: ${sourceId}`);
  if (options.dryRun) return dryRunMerchantAcquisitionSources([source], options);
  return scanMerchantSource(source, { ...options, importVerified: false });
}

async function dryRunMerchantAcquisitionSources(sources: MerchantAcquisitionSource[], options: MerchantSourceScanOptions) {
  const planned = [];
  for (const source of sources) {
    const shards = shouldUseShardQueue(source, options)
      ? await acquisitionRepository.listMerchantSourceShards(source.id, DEFAULT_MAX_SHARDS + 5)
      : [];
    const nextShard = shards.find((candidate) => candidate.status === "queued" || candidate.status === "partial" || candidate.status === "failed")
      ?? (shards.length === 0 && shouldUseShardQueue(source, options) ? buildOffsetShard(source, 0) : null);
    planned.push({
      source_id: source.id,
      source_name: source.source_name,
      source_url: source.source_url,
      health_status: source.health_status,
      priority_score: sourcePriorityScore(source),
      shard: nextShard ? {
        shard_key: nextShard.shard_key,
        shard_url: nextShard.shard_url,
        status: "status" in nextShard ? nextShard.status : "queued",
        offset_value: nextShard.offset_value ?? null,
        page_number: nextShard.page_number ?? null
      } : null,
      expected_limit: options.limit ?? 25,
      import_verified: false,
      outreach: false
    });
  }
  return {
    dry_run: true,
    scanned: 0,
    extracted: 0,
    verified: 0,
    rejected: 0,
    duplicates: 0,
    imported: 0,
    selected_sources: planned.length,
    planned_work: planned,
    results: []
  };
}

function compareSourceScanPriority(left: MerchantAcquisitionSource, right: MerchantAcquisitionSource) {
  const rightScore = sourcePriorityScore(right);
  const leftScore = sourcePriorityScore(left);
  if (rightScore !== leftScore) return rightScore - leftScore;
  return scanAge(left.last_scanned_at) - scanAge(right.last_scanned_at);
}

function sourcePriorityScore(source: MerchantAcquisitionSource) {
  return (
    Number(source.acquisition_yield_score ?? 0) * 4 +
    Number(source.verified_rate ?? 0) * 3 +
    Number(source.test_businesses_validated ?? 0) * 3 +
    Number(source.source_quality_score ?? 0) * 2 +
    Number(source.extraction_compatibility_score ?? 0) +
    Number(source.success_rate ?? 0) -
    Number(source.duplicate_rate ?? 0) * 2 -
    Number(source.consecutive_zero_yield ?? 0) * 10
  );
}

function scanAge(value: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function scanMerchantSource(source: MerchantAcquisitionSource, options: MerchantSourceScanOptions, runBudget?: AcquisitionRunBudget) {
  await options.assertMayContinue?.();
  const sourceStartedAt = Date.now();
  const sourceLockToken = randomUUID();
  const sourceLock = await acquisitionRepository.claimMerchantSourceLock(
    source.id,
    sourceLockToken,
    new Date(Date.now() + DEFAULT_LOCK_TTL_MS).toISOString()
  );
  if (!sourceLock.claimed) return skippedSourceResult(source, "source already locked by another scheduler run");
  const sourceTimeoutMs = Math.min(
    options.sourceTimeoutMs ?? boundedNumber(process.env.MERCHANT_ACQUISITION_SOURCE_TIMEOUT_MS, DEFAULT_SOURCE_TIMEOUT_MS, 10_000, 55_000),
    Math.max(1, remainingBudgetMs(runBudget))
  );
  const sourceBudget = createRunBudget(sourceTimeoutMs);
  const pageTimeoutMs = options.pageTimeoutMs ?? boundedNumber(process.env.MERCHANT_ACQUISITION_PAGE_TIMEOUT_MS, DEFAULT_PAGE_TIMEOUT_MS, 3_000, 20_000);
  const detailTimeoutMs = options.detailTimeoutMs ?? boundedNumber(process.env.MERCHANT_ACQUISITION_DETAIL_TIMEOUT_MS, DEFAULT_DETAIL_TIMEOUT_MS, 2_000, 15_000);
  const enrichmentTimeoutMs = options.enrichmentTimeoutMs ?? boundedNumber(process.env.MERCHANT_ACQUISITION_ENRICHMENT_TIMEOUT_MS, DEFAULT_ENRICHMENT_TIMEOUT_MS, 5_000, 30_000);
  const concurrency = options.concurrency ?? boundedNumber(process.env.MERCHANT_ACQUISITION_CONCURRENCY, DEFAULT_CONCURRENCY, 1, 5);
  const maxPages = options.maxPages ?? boundedNumber(process.env.MAX_SOURCE_PAGES, DEFAULT_MAX_SOURCE_PAGES, 1, 10);
  const shard = await prepareSourceShard(source, options);
  const shardLockToken = shard ? randomUUID() : null;
  if (shard && shardLockToken) {
    const shardLock = await acquisitionRepository.claimMerchantSourceShardLock(
      shard.id,
      shardLockToken,
      new Date(Date.now() + DEFAULT_LOCK_TTL_MS).toISOString()
    );
    if (!shardLock.claimed) {
      await acquisitionRepository.releaseMerchantSourceLock(source.id, sourceLockToken);
      return skippedSourceResult(source, `source shard ${shard.shard_key} already locked by another scheduler run`);
    }
  }
  const sourceUrl = shard?.shard_url ?? source.source_url;
  if (shard) {
    await acquisitionRepository.updateMerchantSourceShard(shard.id, {
      status: "running",
      last_error: null,
      started_at: new Date().toISOString(),
      completed_at: null,
      metadata: {
        ...(isPlainObject(shard.metadata) ? shard.metadata : {}),
        started_at: new Date().toISOString(),
        requested_by: options.requestedBy
      } as Json
    });
  }
  const scan = await acquisitionRepository.createMerchantSourceScan({
    source_id: source.id,
    status: "running",
    metadata: {
      source_url: source.source_url,
      source_name: source.source_name,
      source_timeout_ms: sourceTimeoutMs,
      source_shard_id: shard?.id ?? null,
      shard_key: shard?.shard_key ?? null,
      shard_url: sourceUrl,
      page_timeout_ms: pageTimeoutMs,
      detail_timeout_ms: detailTimeoutMs,
      enrichment_timeout_ms: enrichmentTimeoutMs,
      concurrency,
      max_pages: maxPages
    } as Json
  });

  try {
    assertBudgetAvailable(sourceBudget, "source scan");
    const adapterKey = sourceToAdapterKey(source);
    const discovery = await getAcquisitionAdapter(adapterKey).discover({
      urls: [sourceUrl],
      category: source.industry,
      location: source.state ?? undefined,
      limit: options.limit ?? 25,
      sourceTimeoutMs: Math.max(1, sourceTimeoutMs - enrichmentTimeoutMs - 5_000),
      pageTimeoutMs,
      detailTimeoutMs,
      maxPages
    });
    const deduped = deduplicateAcquisitionRecords(discovery.records);
    let databaseDuplicates = 0;
    let timedOut = false;
    const processed = await runWithConcurrency(deduped.unique, concurrency, async (record) => {
      if (remainingBudgetMs(sourceBudget) <= 0) {
        timedOut = true;
        return { type: "timeout" as const, record, error: "source timeout before candidate processing" };
      }
      return processDiscoveredRecord(record, source, options, sourceBudget, enrichmentTimeoutMs, shard);
    });
    const previews = [];
    const persisted = [];
    const processingErrors: string[] = [];
    for (const item of processed) {
      if (item.type === "duplicate") {
        databaseDuplicates += 1;
      } else if (item.type === "preview") {
        previews.push(item.preview);
        if (item.preview.candidate) persisted.push(item.preview.candidate);
      } else {
        processingErrors.push(item.error);
        timedOut = timedOut || item.type === "timeout";
      }
    }

    const importable = previews.filter((preview) => preview.validation?.status === "verified" && preview.quality.score >= 80);
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
    const timedOutByAdapter = readAdapterTimedOut(discovery.metadata);
    const runtimeMs = Date.now() - sourceStartedAt;
    const scanError = [...discovery.errors, ...processingErrors].join("; ") || (discovery.records.length === 0 ? "No business records extracted" : null);
    const extractionStatus = timedOut || timedOutByAdapter
      ? (previews.length > 0 ? "partial" : "timeout")
      : discovery.errors.length > 0 && discovery.records.length === 0 ? "failed" : "completed";
    const status = extractionStatus === "failed" || extractionStatus === "timeout" ? "failed" : "completed";
    const duplicateRate = percentage(duplicateCount, Math.max(discovery.records.length + duplicateCount, 1));
    const verifiedRate = percentage(verified, Math.max(discovery.records.length, 1));
    const falsePositiveRate = percentage(rejected, Math.max(previews.length, 1));
    const shardStatus = shard ? shardStatusFromResult({
      extractionStatus,
      discovered: discovery.records.length,
      processed: previews.length,
      errors: processingErrors.length + discovery.errors.length,
      timedOut: timedOut || timedOutByAdapter
    }) : null;
    const sourceTotals = calculateSourceTotals(source, {
      success: status === "completed",
      robotsBlocked,
      extracted: discovery.records.length
    });
    const healthStatus = nextHealthStatus({
      previous: source.health_status,
      status,
      robotsBlocked,
      extracted: discovery.records.length,
      errors: discovery.errors.length,
      failureStreak: sourceTotals.failureStreak
    });

    await acquisitionRepository.updateMerchantSourceScan(scan.id, {
      status,
      completed_at: new Date().toISOString(),
      extracted_businesses: discovery.records.length,
      verified_businesses: verified,
      rejected_businesses: rejected,
      duplicate_businesses: duplicateCount,
      robots_blocked: robotsBlocked,
      error_message: scanError,
      metadata: {
        adapter_key: adapterKey,
        source_errors: discovery.errors,
        source_shard_id: shard?.id ?? null,
        shard_key: shard?.shard_key ?? null,
        shard_url: sourceUrl,
        processing_errors: processingErrors,
        candidates_persisted: persisted.length,
        persisted_candidate_ids: persisted.map((candidate) => candidate.id),
        imported,
        extraction_status: extractionStatus,
        runtime_ms: runtimeMs,
        source_timeout_ms: sourceTimeoutMs,
        timed_out: timedOut || timedOutByAdapter,
        resumable: extractionStatus === "partial",
        last_processed_candidate: readLastProcessedCandidate(previews),
        adapter_metadata: discovery.metadata
      } as Json
    });
    if (shard) {
      await acquisitionRepository.updateMerchantSourceShard(shard.id, {
        status: shardStatus ?? "completed",
        discovered_count: discovery.records.length,
        processed_count: previews.length,
        verified_count: verified,
        duplicate_count: duplicateCount,
        rejected_count: rejected,
        failure_count: processingErrors.length,
        last_processed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        last_error: scanError,
        metadata: {
          ...(isPlainObject(shard.metadata) ? shard.metadata : {}),
          scan_id: scan.id,
          source_errors: discovery.errors,
          processing_errors: processingErrors,
          timed_out: timedOut || timedOutByAdapter,
          runtime_ms: runtimeMs
        } as Json
      });
      await maybeQueueNextShard(source, shard, discovery.records.length);
      if (shardLockToken) await acquisitionRepository.releaseMerchantSourceShardLock(shard.id, shardLockToken);
    }
    await acquisitionRepository.updateMerchantSource(source.id, {
      health_status: healthStatus,
      last_scanned_at: new Date().toISOString(),
      success_rate: sourceTotals.successRate,
      scan_success_count: sourceTotals.successCount,
      scan_failure_count: sourceTotals.failureCount,
      robots_blocked_count: sourceTotals.robotsBlockedCount,
      extracted_business_count: sourceTotals.extractedBusinessCount,
      last_error: scanError,
      failure_streak: sourceTotals.failureStreak,
      active: source.approval_status === "approved" && healthStatus !== "disabled",
      disabled_reason: healthStatus === "disabled" ? sourceTotals.disabledReason : null
    });
    const freshnessMetrics: {
      last_success_at?: string | null;
      last_new_lead_at?: string | null;
      consecutive_zero_yield: number;
      duplicate_rate: number;
      verified_rate: number;
      false_positive_rate: number;
    } = {
      consecutive_zero_yield: verified > 0 ? 0 : Number(source.consecutive_zero_yield ?? 0) + 1,
      duplicate_rate: duplicateRate,
      verified_rate: verifiedRate,
      false_positive_rate: falsePositiveRate
    };
    if (status === "completed") freshnessMetrics.last_success_at = new Date().toISOString();
    if (persisted.some((candidate) => candidate.enrichment_status === "completed")) freshnessMetrics.last_new_lead_at = new Date().toISOString();
    await acquisitionRepository.updateMerchantSourceFreshnessMetrics(source.id, freshnessMetrics);

    await acquisitionRepository.releaseMerchantSourceLock(source.id, sourceLockToken);
    return {
      source_id: source.id,
      source_name: source.source_name,
      status: extractionStatus,
      health_status: healthStatus,
      extracted_businesses: discovery.records.length,
      verified_businesses: verified,
      rejected_businesses: rejected,
      duplicate_businesses: duplicateCount,
      imported,
      persisted_candidates: persisted.length,
      runtime_ms: runtimeMs,
      timed_out: timedOut || timedOutByAdapter,
      errors: discovery.errors
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Unknown source scan error");
    const sourceTotals = calculateSourceTotals(source, { success: false, robotsBlocked: false, extracted: 0 });
    await acquisitionRepository.updateMerchantSourceScan(scan.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: message
    });
    if (shard) {
      await acquisitionRepository.updateMerchantSourceShard(shard.id, {
        status: error instanceof AcquisitionTimeoutError || /timed out|aborted/i.test(message) ? "partial" : "failed",
        last_processed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        last_error: classifyCandidateFailure(message),
        metadata: {
          ...(isPlainObject(shard.metadata) ? shard.metadata : {}),
          error_message: message
        } as Json
      });
      if (shardLockToken) await acquisitionRepository.releaseMerchantSourceShardLock(shard.id, shardLockToken);
    }
    await acquisitionRepository.updateMerchantSource(source.id, {
      health_status: nextHealthStatus({
        previous: source.health_status,
        status: "failed",
        robotsBlocked: false,
        extracted: 0,
        errors: 1,
        failureStreak: sourceTotals.failureStreak
      }),
      last_scanned_at: new Date().toISOString(),
      success_rate: sourceTotals.successRate,
      scan_failure_count: sourceTotals.failureCount,
      failure_streak: sourceTotals.failureStreak,
      disabled_reason: sourceTotals.failureStreak >= 3 ? "Auto-disabled after 3 consecutive scan failures" : null,
      active: source.approval_status === "approved" && sourceTotals.failureStreak < 3,
      last_error: message
    });
    logger.warn("merchant_source_scan_failed", { source_id: source.id, source_url: source.source_url, error: message });
    await acquisitionRepository.releaseMerchantSourceLock(source.id, sourceLockToken);
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
      persisted_candidates: 0,
      errors: [message]
    };
  }
}

async function processDiscoveredRecord(
  record: ReturnType<typeof deduplicateAcquisitionRecords>["unique"][number],
  source: MerchantAcquisitionSource,
  options: MerchantSourceScanOptions,
  sourceBudget: AcquisitionRunBudget,
  enrichmentTimeoutMs: number,
  shard?: MerchantAcquisitionSourceShard | null
) {
  try {
    assertBudgetAvailable(sourceBudget, "candidate processing");
    const normalized = normalizeBusinessLead(record);
    if (!normalized.website_url || !normalized.domain) {
      const reason = "NO_INDEPENDENT_WEBSITE";
      return {
        type: "preview" as const,
        preview: {
          record,
          validation: null,
          quality: { score: 0, tier: "D" as const, reasons: [reason] },
          candidate: null
        }
      };
    }

    const [candidateDuplicates, existing] = await Promise.all([
      acquisitionRepository.findMerchantCandidateDuplicates({
        businessName: normalized.business_name,
        email: normalized.email,
        phone: normalized.phone,
        domain: normalized.domain
      }),
      acquisitionRepository.findLeadByEmailOrName({
        businessName: normalized.business_name,
        email: normalized.email,
        phone: normalized.phone,
        domain: normalized.domain
      })
    ]);
    if (candidateDuplicates.length > 0 || existing.length > 0) {
      return { type: "duplicate" as const, record, error: classifyDuplicateReason({ candidateDuplicates, existing, normalized }) };
    }

    assertBudgetAvailable(sourceBudget, "candidate validation");
    const preliminaryValidation = await validateAcquisitionLead({
      businessName: normalized.business_name,
      websiteUrl: normalized.website_url,
      email: normalized.email,
      phone: normalized.phone,
      businessCategory: normalized.industry ?? source.industry,
      source: record.source,
      sourcePageUrl: readSourcePageUrl(record)
    });
    const preliminaryQuality = applyValidationToQuality(scoreLeadQuality(normalized, source.industry, { uniqueDomain: true }), preliminaryValidation);
    let candidate = null;
    if (options.persistCandidates !== false) {
      await options.assertMayContinue?.();
      assertBudgetAvailable(sourceBudget, "candidate persistence");
      candidate = await acquisitionRepository.upsertMerchantCandidate({
        source_id: source.id,
        business_name: normalized.business_name,
        website_url: normalized.website_url,
        domain: normalized.domain,
        industry: normalized.industry ?? source.industry,
        state: normalized.state ?? source.state,
        source_phone: normalized.phone,
        business_phone: normalized.phone,
        business_email: normalized.email,
        email_found: Boolean(normalized.email),
        enrichment_status: "queued",
        quality_score: preliminaryQuality.score,
        source_shard_id: shard?.id ?? null,
        attempt_count: 0,
        failure_reason_code: null,
        last_error: null,
        next_retry_at: null,
        raw_payload: {
          ...(normalized.raw_payload && typeof normalized.raw_payload === "object" && !Array.isArray(normalized.raw_payload)
            ? normalized.raw_payload
            : {}),
          source_url: source.source_url,
          source_shard_id: shard?.id ?? null,
          source_shard_key: shard?.shard_key ?? null,
          discovered_from: source.source_name,
          lead_machine_state: "discovered",
          preliminary_validation: preliminaryValidation,
          preliminary_quality: preliminaryQuality
        } as unknown as Json
      });
      candidate = await enrichMerchantAcquisitionCandidate(candidate, {
        timeoutMs: Math.min(enrichmentTimeoutMs, Math.max(1, remainingBudgetMs(sourceBudget))),
        sourcePhone: normalized.phone,
        sourceDomain: source.source_url
      });
    }
    const validation = candidate
      ? {
          status: candidate.enrichment_status === "completed" ? "verified" : "invalid",
          website_verified: candidate.website_verified,
          phone_verified: candidate.phone_verified,
          email_verified: candidate.email_found,
          business_verified: candidate.identity_match,
          validation_score: candidate.quality_score,
          validation_reason: candidate.rejection_reason ?? "Website enrichment completed",
          validation_timestamp: candidate.last_enriched_at ?? new Date().toISOString(),
          flags: preliminaryValidation.flags
        } as const
      : preliminaryValidation;
    const quality = candidate
      ? { score: candidate.quality_score, tier: scoreToTier(candidate.quality_score), reasons: [candidate.rejection_reason ?? "website enrichment completed"] }
      : preliminaryQuality;
    return { type: "preview" as const, preview: { record, validation, quality, candidate } };
  } catch (error) {
    const message = errorMessage(error);
    const code = classifyCandidateFailure(message);
    return {
      type: error instanceof AcquisitionTimeoutError || /timed out|aborted/i.test(message) ? "timeout" as const : "error" as const,
      record,
      error: `${code}: ${message}`
    };
  }
}

function isSourceEligibleForScan(source: MerchantAcquisitionSource) {
  if (!source.active || source.health_status === "disabled" || source.health_status === "blocked") return false;
  if (source.lock_token && !lockExpired(source.lock_expires_at)) return false;
  if (source.health_status === "degraded" && !scanCooldownElapsed(source.last_scanned_at, DEGRADED_SOURCE_COOLDOWN_MS)) return false;
  if (source.failure_streak > 0 && !scanCooldownElapsed(source.last_scanned_at, DEGRADED_SOURCE_COOLDOWN_MS)) return false;
  return scanCooldownElapsed(source.last_scanned_at, DEFAULT_SOURCE_COOLDOWN_MS);
}

function lockExpired(value: string | null) {
  if (!value) return true;
  const parsed = Date.parse(value);
  return !Number.isFinite(parsed) || parsed <= Date.now();
}

function sourceToAdapterKey(source: MerchantAcquisitionSource): FreeFirstSourceKey {
  if (source.source_type === "chamber") return "chamber_directories";
  if (source.source_type === "association") return "industry_associations";
  if (source.source_type === "contractor_listing" || source.source_type === "directory") return "public_business_directories";
  return "company_websites";
}

async function prepareSourceShard(source: MerchantAcquisitionSource, options: MerchantSourceScanOptions) {
  if (!shouldUseShardQueue(source, options)) return null;
  const shards = await acquisitionRepository.listMerchantSourceShards(source.id, DEFAULT_MAX_SHARDS + 5);
  const queued = shards.find((candidate) => candidate.status === "queued" || candidate.status === "partial" || candidate.status === "failed");
  if (queued) return queued;
  if (shards.length === 0) {
    return acquisitionRepository.upsertMerchantSourceShard(buildOffsetShard(source, 0));
  }
  return null;
}

async function maybeQueueNextShard(source: MerchantAcquisitionSource, shard: MerchantAcquisitionSourceShard, discoveredCount: number) {
  if (!isOffsetShard(shard)) return;
  const shards = await acquisitionRepository.listMerchantSourceShards(source.id, DEFAULT_MAX_SHARDS + 5);
  if (shards.length >= DEFAULT_MAX_SHARDS) return;
  const ordered = shards
    .filter(isOffsetShard)
    .sort((left, right) => Number(left.offset_value ?? 0) - Number(right.offset_value ?? 0));
  const trailingEmpty = ordered.slice(-DEFAULT_EMPTY_SHARD_STOP).every((candidate) =>
    candidate.status === "empty" || Number(candidate.discovered_count ?? 0) === 0
  );
  if (discoveredCount === 0 && trailingEmpty) return;
  const nextOffset = Number(shard.offset_value ?? 0) + DEFAULT_SHARD_SIZE;
  if (ordered.some((candidate) => Number(candidate.offset_value ?? 0) === nextOffset)) return;
  await acquisitionRepository.upsertMerchantSourceShard(buildOffsetShard(source, nextOffset));
}

function buildOffsetShard(source: MerchantAcquisitionSource, offset: number) {
  const shardUrl = new URL(source.source_url);
  shardUrl.searchParams.set("operion_offset", String(offset));
  return {
    source_id: source.id,
    shard_key: `offset:${offset}`,
    shard_url: shardUrl.toString(),
    offset_value: offset,
    page_number: Math.floor(offset / DEFAULT_SHARD_SIZE) + 1,
    status: "queued" as const,
    metadata: {
      shard_strategy: "operion_offset",
      shard_size: DEFAULT_SHARD_SIZE,
      parent_source_url: source.source_url
    } as Json
  };
}

function shouldUseShardQueue(source: MerchantAcquisitionSource, options: MerchantSourceScanOptions) {
  if (options.useShards === false) return false;
  if (options.useShards === true) return true;
  const metadata = isPlainObject(source.metadata) ? source.metadata : {};
  const pattern = String(metadata.source_pattern ?? metadata.directory_pattern ?? "");
  return /\bcommunity_builder_member_rows\b/i.test(pattern)
    || /\bwordpress_business_directory_listing\b/i.test(pattern)
    || /\bphccia\.org\b/i.test(source.source_url);
}

function isOffsetShard(shard: MerchantAcquisitionSourceShard) {
  return typeof shard.offset_value === "number" && shard.shard_key.startsWith("offset:");
}

function shardStatusFromResult(input: {
  extractionStatus: "completed" | "partial" | "timeout" | "failed";
  discovered: number;
  processed: number;
  errors: number;
  timedOut: boolean;
}) {
  if (input.discovered === 0 && !input.timedOut) return "empty" as const;
  if (input.timedOut || input.extractionStatus === "partial") return "partial" as const;
  if (input.extractionStatus === "failed") return "failed" as const;
  if (input.errors > 0 && input.processed < input.discovered) return "partial" as const;
  return "completed" as const;
}

function nextHealthStatus(input: {
  previous: MerchantSourceHealthStatus;
  status: "completed" | "failed";
  robotsBlocked: boolean;
  extracted: number;
  errors: number;
  failureStreak: number;
}): MerchantSourceHealthStatus {
  if (input.previous === "disabled") return "disabled";
  if (input.failureStreak >= 3) return "disabled";
  if (input.robotsBlocked) return "blocked";
  if (input.status === "failed" || (input.errors > 0 && input.extracted === 0)) return "degraded";
  if (input.extracted === 0) return "degraded";
  return "active";
}

function classifyCandidateFailure(message: string) {
  const value = message.toLowerCase();
  if (/duplicate.*domain|domain.*duplicate/.test(value)) return "DUPLICATE_DOMAIN";
  if (/duplicate.*phone|phone.*duplicate/.test(value)) return "DUPLICATE_PHONE";
  if (/duplicate.*email|email.*duplicate/.test(value)) return "DUPLICATE_EMAIL";
  if (/timed out|timeout|aborted/.test(value)) return "WEBSITE_TIMEOUT";
  if (/http\s?\d{3}|not reachable|fetch failed/.test(value)) return "WEBSITE_HTTP_ERROR";
  if (/identity/.test(value)) return "IDENTITY_MISMATCH";
  if (/invalid phone/.test(value)) return "PHONE_INVALID";
  if (/phone.*not found|no phone|business phone not found/.test(value)) return "NO_PHONE";
  if (/independent website|website missing/.test(value)) return "NO_INDEPENDENT_WEBSITE";
  if (/false positive|non-merchant|directory\/platform|generic/.test(value)) return "FALSE_POSITIVE";
  if (/source data/.test(value)) return "SOURCE_DATA_INVALID";
  if (/parse|parser/.test(value)) return "PARSER_ERROR";
  return "SOURCE_DATA_INVALID";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  try {
    const serialized = JSON.stringify(error);
    return serialized && serialized !== "{}" ? serialized : "unknown candidate processing error";
  } catch {
    return "unknown candidate processing error";
  }
}

function classifyDuplicateReason(input: {
  candidateDuplicates: Array<{ domain: string; business_email: string | null; business_phone: string | null; source_phone: string | null }>;
  existing: Array<{ business_name: string; email?: string | null; phone?: string | null }>;
  normalized: { domain?: string | null; email?: string | null; phone?: string | null };
}) {
  if (input.normalized.domain && input.candidateDuplicates.some((candidate) => candidate.domain === input.normalized.domain)) return "DUPLICATE_DOMAIN";
  if (input.normalized.email && input.candidateDuplicates.some((candidate) => candidate.business_email === input.normalized.email)) return "DUPLICATE_EMAIL";
  if (input.normalized.phone && input.candidateDuplicates.some((candidate) => candidate.business_phone === input.normalized.phone || candidate.source_phone === input.normalized.phone)) return "DUPLICATE_PHONE";
  if (input.existing.length > 0) return "DUPLICATE_DOMAIN";
  return "DUPLICATE_DOMAIN";
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
    failureStreak: result.success ? 0 : source.failure_streak + 1,
    disabledReason: result.success ? null : "Auto-disabled after 3 consecutive scan failures",
    successRate: totalScans === 0 ? 0 : Math.round((successCount / totalScans) * 10000) / 100
  };
}

function scoreToTier(score: number) {
  if (score >= 80) return "A" as const;
  if (score >= 65) return "B" as const;
  if (score >= 45) return "C" as const;
  return "D" as const;
}

function scanCooldownElapsed(value: string | null, cooldownMs: number) {
  if (!value) return true;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return true;
  return Date.now() - parsed >= cooldownMs;
}

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readSourcePageUrl(record: { raw_payload?: unknown }) {
  if (!record.raw_payload || typeof record.raw_payload !== "object" || Array.isArray(record.raw_payload)) return null;
  const value = (record.raw_payload as Record<string, unknown>).source_url;
  return typeof value === "string" ? value : null;
}

function readAdapterTimedOut(metadata: Json) {
  return Boolean(metadata && typeof metadata === "object" && !Array.isArray(metadata) && (metadata as Record<string, unknown>).timed_out === true);
}

function readLastProcessedCandidate(previews: Array<{ record: { business_name?: string; website_url?: string | null | undefined } }>) {
  const last = previews.at(-1)?.record;
  if (!last) return null;
  return {
    business_name: last.business_name ?? null,
    website_url: last.website_url ?? null
  };
}

function skippedSourceResult(source: MerchantAcquisitionSource, reason: string) {
  return {
    source_id: source.id,
    source_name: source.source_name,
    status: "timeout" as const,
    health_status: source.health_status,
    extracted_businesses: 0,
    verified_businesses: 0,
    rejected_businesses: 0,
    duplicate_businesses: 0,
    imported: 0,
    persisted_candidates: 0,
    runtime_ms: 0,
    timed_out: true,
    errors: [reason]
  };
}
