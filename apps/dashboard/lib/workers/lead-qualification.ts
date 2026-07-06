import type { Json } from "@operion/shared";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { productionRepository } from "@/lib/repositories/production";
import { writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { recordWorkerHeartbeat } from "@/lib/operations/worker-observability";

export interface LeadQualificationResult {
  processed: number;
  skipped: number;
  failed: number;
  items: Array<{
    task_id: string;
    application_id: string | null;
    score: number;
    tier: string;
    status: "completed" | "failed" | "skipped";
    reason?: string;
  }>;
}

// Scoring weights — rule-based, no AI dependency
const SCORE_WEIGHTS = {
  monthly_deposits: 35,
  credit_score: 25,
  requested_amount_coverage: 20,
  industry: 10,
  state_presence: 10
} as const;

const STRONG_INDUSTRIES = new Set(["retail", "restaurant", "healthcare", "logistics", "construction", "automotive", "food_service"]);
const ACTIVE_STATES = new Set(["CA", "TX", "FL", "NY", "IL", "PA", "OH", "GA", "NC", "MI"]);

function scoreApplication(app: {
  monthly_deposits: number | null;
  requested_amount: number | null;
  credit_score_range: string | null;
  industry: string | null;
  state: string | null;
}): { score: number; tier: "A" | "B" | "C" | "D"; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};

  // 1. Monthly deposits (0–35 pts)
  const deposits = app.monthly_deposits ?? 0;
  let depositScore = 0;
  if (deposits >= 100_000) depositScore = 35;
  else if (deposits >= 50_000) depositScore = 28;
  else if (deposits >= 25_000) depositScore = 20;
  else if (deposits >= 10_000) depositScore = 12;
  else if (deposits >= 5_000) depositScore = 6;
  breakdown.monthly_deposits = depositScore;

  // 2. Credit score range (0–25 pts)
  const creditRaw = (app.credit_score_range ?? "").toLowerCase();
  let creditScore = 0;
  if (creditRaw.includes("700") || creditRaw === "700_plus") creditScore = 25;
  else if (creditRaw.includes("650") || creditRaw.includes("680")) creditScore = 18;
  else if (creditRaw.includes("600")) creditScore = 11;
  else if (creditRaw.includes("550")) creditScore = 5;
  breakdown.credit_score = creditScore;

  // 3. Requested amount vs deposits ratio (0–20 pts)
  const requested = app.requested_amount ?? 0;
  let coverageScore = 0;
  if (deposits > 0 && requested > 0) {
    const ratio = requested / deposits;
    if (ratio <= 1.5) coverageScore = 20;
    else if (ratio <= 3) coverageScore = 15;
    else if (ratio <= 6) coverageScore = 8;
    else coverageScore = 3;
  }
  breakdown.requested_amount_coverage = coverageScore;

  // 4. Industry (0–10 pts)
  const industryScore = STRONG_INDUSTRIES.has((app.industry ?? "").toLowerCase()) ? 10 : 5;
  breakdown.industry = industryScore;

  // 5. State market presence (0–10 pts)
  const stateScore = ACTIVE_STATES.has((app.state ?? "").toUpperCase()) ? 10 : 6;
  breakdown.state_presence = stateScore;

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const tier: "A" | "B" | "C" | "D" =
    total >= 75 ? "A" : total >= 55 ? "B" : total >= 35 ? "C" : "D";

  return { score: total, tier, breakdown };
}

export async function runLeadQualificationWorker(limit = 10): Promise<LeadQualificationResult> {
  const workerStartedAt = Date.now();
  const result: LeadQualificationResult = { processed: 0, skipped: 0, failed: 0, items: [] };

  // Fetch queued lead_qualification tasks
  const { data: tasks, error } = await getSupabaseAdmin()
    .from("ai_tasks")
    .select("*")
    .eq("task_type", "lead_qualification")
    .eq("status", "queued")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    logger.error("lead_qualification_worker_fetch_failed", { error: error.message });
    await recordWorkerHeartbeat({
      workerName: "lead_qualification_worker",
      department: "underwriting",
      status: "failed",
      queueName: "ai_tasks:lead_qualification",
      queueSize: 0,
      lastStartedAt: new Date(workerStartedAt).toISOString(),
      lastDurationMs: Date.now() - workerStartedAt,
      errorMessage: error.message
    });
    throw new Error(`Failed to fetch tasks: ${error.message}`);
  }

  const candidates = tasks ?? [];
  logger.info("lead_qualification_worker_started", { candidates: candidates.length });
  await recordWorkerHeartbeat({
    workerName: "lead_qualification_worker",
    department: "underwriting",
    status: candidates.length > 0 ? "running" : "idle",
    queueName: "ai_tasks:lead_qualification",
    queueSize: candidates.length,
    currentTask: candidates[0]?.id ?? null,
    lastStartedAt: new Date(workerStartedAt).toISOString()
  });

  for (const task of candidates) {
    const appId = task.business_application_id;
    if (!appId) {
      result.skipped++;
      result.items.push({ task_id: task.id, application_id: null, score: 0, tier: "D", status: "skipped", reason: "No business_application_id" });
      continue;
    }

    try {
      // Claim task
      const claimed = await productionRepository.claimAiTask(task.id, {
        status: "running",
        started_at: new Date().toISOString()
      });
      if (!claimed) {
        result.skipped++;
        result.items.push({ task_id: task.id, application_id: appId, score: 0, tier: "D", status: "skipped", reason: "Already claimed" });
        continue;
      }

      // Load application
      const app = await productionRepository.getBusinessApplication(appId);
      const { score, tier, breakdown } = scoreApplication(app);

      // Create lead score record
      await productionRepository.createLeadScore({
        lead_id: (task.lead_id ?? app.lead_id) as string,
        score,
        tier,
        decision: tier === "A" || tier === "B" ? "qualified" : tier === "C" ? "review" : "declined",
        provider: "operion_rule_engine",
        model: "v1",
        input_payload: { deposits: app.monthly_deposits, credit: app.credit_score_range, requested: app.requested_amount } as Json,
        output_payload: { score, tier, breakdown } as Json,
        internal_notes: `Rule-based qualification: deposits=${app.monthly_deposits}, credit=${app.credit_score_range}, requested=${app.requested_amount}`
      });

      // Mark task complete
      await productionRepository.updateAiTask(task.id, {
        status: "completed",
        completed_at: new Date().toISOString(),
        result_payload: {
          score,
          tier,
          breakdown,
          application_id: appId,
          scored_at: new Date().toISOString()
        } as Json,
        error_message: null
      });

      // Task log
      await productionRepository.createAiTaskLog({
        ai_task_id: task.id,
        status: "completed",
        message: `Lead qualification complete: score=${score} tier=${tier}`,
        provider: "operion_rule_engine",
        model: "v1",
        metadata: { score, tier, breakdown } as Json
      });

      // CRM activity
      await productionRepository.createCrmActivity({
        application_id: null,
        business_application_id: appId,
        lead_id: task.lead_id ?? app.lead_id,
        actor_id: "lead_qualification_worker",
        actor_type: "system",
        activity_type: "note",
        subject: `Lead qualification complete — Tier ${tier} (${score}/100)`,
        body: `Rule-based qualification assigned score ${score}/100, tier ${tier}. Breakdown: deposits=${breakdown.monthly_deposits}pts, credit=${breakdown.credit_score}pts, amount_fit=${breakdown.requested_amount_coverage}pts, industry=${breakdown.industry}pts, state=${breakdown.state_presence}pts.`,
        metadata: { score, tier, breakdown } as Json
      });

      // Audit log
      await writeAuditLog({
        eventType: "lead_qualified",
        actorType: "system",
        actorId: "lead_qualification_worker",
        entityType: "business_application",
        entityId: appId,
        metadata: { score, tier, task_id: task.id } as Json
      });

      result.processed++;
      result.items.push({ task_id: task.id, application_id: appId, score, tier, status: "completed" });

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logger.error("lead_qualification_task_failed", { task_id: task.id, appId, error: msg });

      try {
        await productionRepository.updateAiTask(task.id, {
          status: "failed",
          error_message: msg,
          completed_at: new Date().toISOString()
        });
        await productionRepository.createAiTaskLog({
          ai_task_id: task.id,
          status: "failed",
          message: `Lead qualification failed: ${msg}`,
          provider: null,
          model: null,
          metadata: {} as Json
        });
      } catch { /* best effort */ }

      result.failed++;
      result.items.push({ task_id: task.id, application_id: appId, score: 0, tier: "D", status: "failed", reason: msg });
    }
  }

  logger.info("lead_qualification_worker_done", { processed: result.processed, skipped: result.skipped, failed: result.failed });
  const durationMs = Date.now() - workerStartedAt;
  await recordWorkerHeartbeat({
    workerName: "lead_qualification_worker",
    department: "underwriting",
    status: result.failed > 0 ? "failed" : "idle",
    queueName: "ai_tasks:lead_qualification",
    queueSize: Math.max(0, candidates.length - result.processed - result.skipped - result.failed),
    lastCompletedTask: result.items.find((item) => item.status === "completed")?.task_id ?? null,
    lastCompletedAt: new Date().toISOString(),
    averageExecutionMs: result.processed > 0 ? Math.round(durationMs / result.processed) : durationMs,
    lastDurationMs: durationMs,
    errorMessage: result.failed > 0 ? `${result.failed} lead qualification task(s) failed.` : null,
    metadata: {
      processed: result.processed,
      skipped: result.skipped,
      failed: result.failed
    } as Json
  });
  return result;
}
