import type { Json } from "@operion/shared";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";

export interface LenderDiscoveryResult {
  processed: number;
  skipped: number;
  failed: number;
  items: Array<{
    id: string;
    company_name: string;
    status: "enriched" | "skipped" | "failed";
    reason?: string;
  }>;
}

interface DiscoveryCandidate {
  id: string;
  company_name: string;
  website_url: string | null;
  contact_email: string | null;
  states_served: string[] | null;
  funding_range_min: number | null;
  funding_range_max: number | null;
  discovery_source: string;
  status: string;
  intelligence_summary: string | null;
  confidence_score: number | null;
}

const ACTIVE_STATES = new Set(["CA", "TX", "FL", "NY", "IL", "PA", "OH", "GA", "NC", "MI"]);

function buildIntelligenceSummary(candidate: DiscoveryCandidate): { summary: string; confidence: number } {
  const signals: string[] = [];
  let confidence = 50;

  const rangeMin = candidate.funding_range_min;
  const rangeMax = candidate.funding_range_max;
  if (rangeMin !== null && rangeMax !== null) {
    const minK = rangeMin >= 1000 ? `$${(rangeMin / 1000).toFixed(0)}K` : `$${rangeMin}`;
    const maxK = rangeMax >= 1000 ? `$${(rangeMax / 1000).toFixed(0)}K` : `$${rangeMax}`;
    signals.push(`Funding range: ${minK}–${maxK}`);
    confidence += 10;
  } else if (rangeMin !== null) {
    const minK = rangeMin >= 1000 ? `$${(rangeMin / 1000).toFixed(0)}K` : `$${rangeMin}`;
    signals.push(`Minimum funding: ${minK}`);
    confidence += 5;
  }

  const states = candidate.states_served ?? [];
  if (states.length > 0) {
    const activeOverlap = states.filter((s) => ACTIVE_STATES.has(s.toUpperCase()));
    if (activeOverlap.length >= 5) {
      signals.push(`Broad national coverage (${states.length} states incl. major markets)`);
      confidence += 15;
    } else if (activeOverlap.length > 0) {
      signals.push(`Serves ${states.length} state(s) with ${activeOverlap.length} priority market(s): ${activeOverlap.join(", ")}`);
      confidence += 8;
    } else {
      signals.push(`Serves ${states.length} state(s) — no overlap with priority markets`);
    }
  } else {
    signals.push("State coverage not specified — assume national");
    confidence += 3;
  }

  if (candidate.website_url) {
    signals.push("Web presence confirmed");
    confidence += 5;
  }
  if (candidate.contact_email) {
    signals.push("Direct contact email available");
    confidence += 10;
  }

  const source = candidate.discovery_source ?? "unknown";
  signals.push(`Discovered via: ${source}`);

  confidence = Math.min(confidence, 95);

  const summary = [
    `Lender candidate: ${candidate.company_name}.`,
    signals.join(". ") + ".",
    `Confidence score: ${confidence}/100.`,
    "Pending founder review before any outreach."
  ].join(" ");

  return { summary, confidence };
}

export async function runLenderDiscoveryWorker(limit = 20): Promise<LenderDiscoveryResult> {
  const result: LenderDiscoveryResult = { processed: 0, skipped: 0, failed: 0, items: [] };

  // Fetch pending_review candidates that lack an intelligence summary
  const { data: candidates, error } = await (getSupabaseAdmin() as any)
    .from("lender_discovery_queue")
    .select("*")
    .eq("status", "pending_review")
    .is("intelligence_summary", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    logger.error("lender_discovery_worker_fetch_failed", { error: (error as { message: string }).message });
    throw new Error(`Failed to fetch lender discovery candidates: ${(error as { message: string }).message}`);
  }

  const rows: DiscoveryCandidate[] = candidates ?? [];
  logger.info("lender_discovery_worker_started", { candidates: rows.length });

  for (const candidate of rows) {
    try {
      const { summary, confidence } = buildIntelligenceSummary(candidate);

      const { error: updateError } = await (getSupabaseAdmin() as any)
        .from("lender_discovery_queue")
        .update({
          intelligence_summary: summary,
          confidence_score: confidence,
          metadata: {
            enriched_at: new Date().toISOString(),
            enriched_by: "lender_discovery_worker",
            enrichment_method: "rule_based_v1"
          } as Json
        })
        .eq("id", candidate.id);

      if (updateError) {
        throw new Error((updateError as { message: string }).message);
      }

      await writeAuditLog({
        eventType: "lender_candidate_enriched",
        actorType: "system",
        actorId: "lender_discovery_worker",
        entityType: "lender" as any,
        entityId: candidate.id,
        metadata: {
          company_name: candidate.company_name,
          confidence_score: confidence,
          enrichment_method: "rule_based_v1"
        } as Json
      });

      result.processed++;
      result.items.push({ id: candidate.id, company_name: candidate.company_name, status: "enriched" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logger.error("lender_discovery_enrichment_failed", { id: candidate.id, company_name: candidate.company_name, error: msg });
      result.failed++;
      result.items.push({ id: candidate.id, company_name: candidate.company_name, status: "failed", reason: msg });
    }
  }

  logger.info("lender_discovery_worker_done", {
    processed: result.processed,
    skipped: result.skipped,
    failed: result.failed
  });
  return result;
}
