import type { Json, MerchantAcquisitionSource, MerchantSourceRecommendation } from "@operion/shared";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { autonomousRepository } from "@/lib/autonomous-company/repository";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const EVALUATOR = "autonomous_learning_evaluator";

export interface LearningWindowInput {
  windowStart?: string;
  windowEnd?: string;
  sourceIds?: string[];
  taskId?: string | null;
}

export async function runAutonomousLearningCycle(input: LearningWindowInput = {}) {
  const windowEnd = input.windowEnd ?? new Date().toISOString();
  const windowStart = input.windowStart ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [sourceEvaluations, agentEvaluations, aiEvaluations] = await Promise.all([
    evaluateSources({ ...input, windowStart, windowEnd }),
    evaluateAgents(windowStart, windowEnd),
    evaluateAiUsage(windowStart, windowEnd)
  ]);

  const sourceStrategies = await applySourceLearning(sourceEvaluations);
  await autonomousRepository.recordEvent({
    eventType: "LEARNING_CYCLE_COMPLETED",
    actorAgentId: "acquisition_manager_agent",
    department: "merchant_acquisition",
    taskId: input.taskId ?? null,
    payload: {
      window_start: windowStart,
      window_end: windowEnd,
      source_evaluations: sourceEvaluations.length,
      agent_evaluations: agentEvaluations.length,
      ai_evaluations: aiEvaluations.length,
      strategy_updates: sourceStrategies.length
    } satisfies Json
  });

  return {
    window_start: windowStart,
    window_end: windowEnd,
    source_evaluations: sourceEvaluations,
    agent_evaluations: agentEvaluations,
    ai_evaluations: aiEvaluations,
    strategy_updates: sourceStrategies
  };
}

export async function readLearningContext(limit = 10) {
  const [strategy, lessons, evaluations, memory] = await Promise.all([
    autonomousRepository.getActiveSourceStrategy(limit),
    autonomousRepository.listLessons(limit),
    autonomousRepository.listEvaluations(limit),
    import("@/lib/repositories/orchestration").then(({ orchestrationRepository }) => orchestrationRepository.listMemory())
  ]);

  return {
    strategy,
    lessons,
    evaluations,
    memory: memory
      .filter((item) => ["acquisition_manager_agent", "source_scanner_agent", "acquisition_monitor_agent"].includes(item.scope_key))
      .slice(0, limit)
  };
}

async function evaluateSources(input: Required<Pick<LearningWindowInput, "windowStart" | "windowEnd">> & LearningWindowInput) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("merchant_acquisition_sources" as never)
    .select("*" as never)
    .eq("approval_status" as never, "approved" as never);
  if (input.sourceIds?.length) {
    query = query.in("id" as never, input.sourceIds as never);
  }
  const { data, error } = await query;
  if (error) throw error;
  const sources = (data ?? []) as unknown as MerchantAcquisitionSource[];
  const evaluations = [];

  for (const source of sources) {
    const metrics = await sourceMetrics(source.id, input.windowStart, input.windowEnd);
    if (metrics.discovered === 0 && metrics.scan_count === 0 && metrics.failure_count === 0) {
      continue;
    }
    const outcome = classifySourceOutcome(metrics);
    const evidence = {
      source_name: source.source_name,
      source_url: source.source_url,
      prior_priority: Number(source.acquisition_yield_score ?? 0),
      scan_count: metrics.scan_count,
      task_id: input.taskId ?? null
    } satisfies Json;
    const evaluation = await autonomousRepository.upsertEvaluation({
      evaluation_key: `source:${source.id}:${input.windowStart}:${input.windowEnd}`,
      window_start: input.windowStart,
      window_end: input.windowEnd,
      source_id: source.id,
      evaluation_type: metrics.failure_count > 0 ? "failure" : "source_performance",
      metrics: metrics as unknown as Json,
      outcome,
      evidence,
      evaluator: EVALUATOR
    });
    evaluations.push({ source, metrics, evaluation });
  }

  return evaluations;
}

async function sourceMetrics(sourceId: string, windowStart: string, windowEnd: string) {
  const supabase = getSupabaseAdmin();
  const [scans, candidates] = await Promise.all([
    supabase
      .from("merchant_acquisition_source_scans" as never)
      .select("id,status,started_at,completed_at,extracted_businesses,verified_businesses,rejected_businesses,duplicate_businesses,robots_blocked,error_message,runtime_ms" as never)
      .eq("source_id" as never, sourceId as never)
      .gte("started_at" as never, windowStart as never)
      .lte("started_at" as never, windowEnd as never),
    supabase
      .from("merchant_acquisition_candidates" as never)
      .select("id,enrichment_status,website_verified,phone_verified,email_found,identity_match,business_phone,source_phone,business_email,quality_score,created_at,updated_at" as never)
      .eq("source_id" as never, sourceId as never)
      .gte("created_at" as never, windowStart as never)
      .lte("created_at" as never, windowEnd as never)
  ]);
  if (scans.error) throw scans.error;
  if (candidates.error) throw candidates.error;

  const scanRows = (scans.data ?? []) as Array<Record<string, unknown>>;
  const candidateRows = (candidates.data ?? []) as Array<Record<string, unknown>>;
  const discovered = sum(scanRows, "extracted_businesses") || candidateRows.length;
  const verified = sum(scanRows, "verified_businesses") || candidateRows.filter(isVerifiedCandidate).length;
  const rejected = sum(scanRows, "rejected_businesses") || candidateRows.filter((row) => row.enrichment_status === "rejected").length;
  const duplicates = sum(scanRows, "duplicate_businesses");
  const failures = scanRows.filter((row) => row.status === "failed" || row.error_message).length;
  const runtimeValues = scanRows.map((row) => Number(row.runtime_ms ?? 0)).filter((value) => value > 0);

  return {
    discovered,
    validated: candidateRows.filter((row) => row.enrichment_status === "completed").length,
    verified,
    rejected,
    duplicates,
    verification_rate: ratio(verified, discovered),
    false_positive_rate: ratio(rejected, Math.max(candidateRows.length, discovered)),
    phone_rate: ratio(candidateRows.filter((row) => row.business_phone || row.source_phone).length, candidateRows.length),
    email_rate: ratio(candidateRows.filter((row) => row.business_email || row.email_found).length, candidateRows.length),
    runtime_ms: runtimeValues.length ? Math.round(runtimeValues.reduce((sum, value) => sum + value, 0) / runtimeValues.length) : 0,
    failure_rate: ratio(failures, scanRows.length),
    failure_count: failures,
    scan_count: scanRows.length,
    robots_blocked_count: scanRows.filter((row) => row.robots_blocked).length
  };
}

async function evaluateAgents(windowStart: string, windowEnd: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agent_task_queue" as never)
    .select("id,assigned_agent_key,status,started_at,completed_at,created_at,updated_at,error_message,context" as never)
    .gte("created_at" as never, windowStart as never)
    .lte("created_at" as never, windowEnd as never)
    .eq("department_key" as never, "merchant_acquisition" as never);
  if (error) throw error;

  const byAgent = groupBy((data ?? []) as Array<Record<string, unknown>>, "assigned_agent_key");
  const results = [];
  for (const [agentKey, rows] of byAgent) {
    const completed = rows.filter((row) => row.status === "completed").length;
    const failed = rows.filter((row) => row.status === "failed").length;
    const retrying = rows.filter((row) => Number(asRecord(row.context).runtime_attempts ?? 0) > 0).length;
    const metrics = {
      tasks_completed: completed,
      tasks_failed: failed,
      retry_rate: ratio(retrying, rows.length),
      average_runtime_ms: averageRuntime(rows),
      tool_failures: await countToolFailures(agentKey, windowStart, windowEnd),
      successful_outcomes: completed
    };
    const evaluation = await autonomousRepository.upsertEvaluation({
      evaluation_key: `agent:${agentKey}:${windowStart}:${windowEnd}`,
      window_start: windowStart,
      window_end: windowEnd,
      agent_key: agentKey,
      evaluation_type: "agent_performance",
      metrics: metrics as unknown as Json,
      outcome: failed > completed ? "negative" : completed > 0 ? "positive" : "insufficient_evidence",
      evidence: { task_count: rows.length } satisfies Json,
      evaluator: EVALUATOR
    });
    results.push({ agent_key: agentKey, metrics, evaluation });
  }
  return results;
}

async function evaluateAiUsage(windowStart: string, windowEnd: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("api_usage_logs" as never)
    .select("service,operation,input_tokens,output_tokens,estimated_cost_usd,success,latency_ms,metadata,created_at" as never)
    .gte("created_at" as never, windowStart as never)
    .lte("created_at" as never, windowEnd as never);
  if (error) throw error;

  const byProvider = groupBy((data ?? []) as Array<Record<string, unknown>>, "service");
  const results = [];
  for (const [provider, rows] of byProvider) {
    const metrics = {
      provider,
      model: mostCommon(rows.map((row) => asRecord(row.metadata).model).filter(Boolean).map(String)) ?? null,
      task_type: mostCommon(rows.map((row) => row.operation).filter(Boolean).map(String)) ?? null,
      success: rows.filter((row) => row.success === true).length,
      latency: average(rows.map((row) => Number(row.latency_ms ?? 0))),
      tokens: rows.reduce((sum, row) => sum + Number(row.input_tokens ?? 0) + Number(row.output_tokens ?? 0), 0),
      estimated_cost: rows.reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0),
      requests: rows.length
    };
    const evaluation = await autonomousRepository.upsertEvaluation({
      evaluation_key: `ai:${provider}:${windowStart}:${windowEnd}`,
      window_start: windowStart,
      window_end: windowEnd,
      agent_key: "acquisition_manager_agent",
      evaluation_type: "ai_performance",
      metrics: metrics as unknown as Json,
      outcome: rows.some((row) => row.success === false) ? "negative" : rows.length > 0 ? "positive" : "insufficient_evidence",
      evidence: { request_count: rows.length } satisfies Json,
      evaluator: EVALUATOR
    });
    results.push({ provider, metrics, evaluation });
  }
  return results;
}

async function applySourceLearning(items: Awaited<ReturnType<typeof evaluateSources>>) {
  const strategies = [];
  for (const item of items) {
    const previousLearning = asRecord(asRecord(item.source.metadata).autonomous_learning);
    const replay = previousLearning.evaluation_id === item.evaluation.id;
    const priorStrategy = await getSupabaseAdmin().from("agent_strategy_updates" as never).select("id").eq("strategy_key" as never, `source_priority:${item.source.id}:${item.evaluation.id}` as never).maybeSingle();
    if (priorStrategy.error) throw priorStrategy.error;
    if (priorStrategy.data) continue;
    const nextPriority = calculateSourcePriority(item.metrics);
    const recommendation = recommendationForPriority(nextPriority, item.metrics.failure_rate);
    const currentPriority = Number(item.source.acquisition_yield_score ?? 0);
    const evidence = {
      evaluation_id: item.evaluation.id,
      metrics: item.metrics,
      previous_priority: currentPriority,
      next_priority: nextPriority,
      previous_recommendation: item.source.recommendation,
      next_recommendation: recommendation
    } satisfies Json;
    const conclusion = buildSourceConclusion(item.source, item.metrics, nextPriority);
    const lesson = await autonomousRepository.upsertLesson({
      lesson_key: `source_priority:${item.source.id}:${item.evaluation.id}`,
      evaluation_id: item.evaluation.id,
      source_id: item.source.id,
      lesson_type: item.metrics.failure_rate >= 0.5 ? "source_cooldown" : "source_priority",
      conclusion,
      confidence: confidenceFor(item.metrics),
      evidence
    });

    await acquisitionRepository.updateMerchantSource(item.source.id, {
      acquisition_yield_score: nextPriority,
      recommendation,
      verified_rate: item.metrics.verification_rate,
      duplicate_rate: item.metrics.duplicates > 0 ? ratio(item.metrics.duplicates, item.metrics.discovered) : Number(item.source.duplicate_rate ?? 0),
      false_positive_rate: item.metrics.false_positive_rate,
      failure_streak: replay ? Number(item.source.failure_streak ?? 0) : item.metrics.failure_count > 0 && item.metrics.verified === 0 ? Number(item.source.failure_streak ?? 0) + 1 : 0,
      metadata: {
        ...asRecord(item.source.metadata),
        autonomous_learning: {
          lesson_id: lesson.id,
          evaluation_id: item.evaluation.id,
          conclusion,
          updated_at: new Date().toISOString(),
          evidence
        }
      } as Json
    });

    const strategy = await autonomousRepository.upsertStrategyUpdate({
      strategy_key: `source_priority:${item.source.id}:${item.evaluation.id}`,
      lesson_id: lesson.id,
      source_id: item.source.id,
      strategy_type: "source_priority",
      previous_value: { priority: currentPriority, recommendation: item.source.recommendation } satisfies Json,
      new_value: { priority: nextPriority, recommendation } satisfies Json,
      reason: conclusion,
      evidence,
      applied: true,
      applied_at: new Date().toISOString()
    });
    strategies.push(strategy);
  }
  return strategies;
}

export function chooseLearnedSourceIds(
  sources: MerchantAcquisitionSource[],
  strategyUpdates: Array<{ source_id: string | null; new_value: Json; reason: string; created_at?: string }>
) {
  const strategyBySource = new Map<string, (typeof strategyUpdates)[number]>();
  for (const row of strategyUpdates) if (row.source_id && !strategyBySource.has(row.source_id)) strategyBySource.set(row.source_id, row);
  return sources
    .map((source) => {
      const learned = strategyBySource.get(source.id);
      const learnedPriority = Number(asRecord(learned?.new_value).priority ?? source.acquisition_yield_score ?? source.source_quality_score ?? 0);
      const failurePenalty = Number(source.failure_streak ?? 0) * 15;
      const evidence = asRecord(asRecord(asRecord(source.metadata).autonomous_learning).evidence);
      const metrics = asRecord(evidence.metrics);
      const sample = Math.max(0, Number(metrics.discovered ?? 0));
      const ageDays = Math.max(0, (Date.now()-Date.parse(learned?.created_at ?? "1970-01-01"))/86400000);
      const decay = Math.pow(0.5, ageDays/14);
      const confidence = sample/(sample+20)*decay;
      const expectedYield = (Number(metrics.verified ?? 0)*decay+1)/(sample*decay+10);
      return {
        source,
        learned,
        sample,
        confidence,
        expectedYield,
        priority: Math.max(0, learnedPriority*confidence + 25*(1-confidence) + expectedYield*20 - failurePenalty)
      };
    })
    .sort((left, right) => right.priority - left.priority)
    .map((row) => ({
      source_id: row.source.id,
      source_name: row.source.source_name,
      priority: row.priority,
      sample_size: row.sample,
      confidence: row.confidence,
      expected_value: row.expectedYield,
      reason: row.learned?.reason ?? "No learned source strategy was available; ranked by source quality score."
    }));
}

function classifySourceOutcome(metrics: Awaited<ReturnType<typeof sourceMetrics>>) {
  if (metrics.discovered < 1 && metrics.failure_count === 0) return "insufficient_evidence" as const;
  if (metrics.failure_rate >= 0.5 || metrics.verification_rate < 0.05 || metrics.false_positive_rate >= 0.7) return "negative" as const;
  if (metrics.verification_rate >= 0.2 || metrics.verified >= 3) return "positive" as const;
  return "neutral" as const;
}

function calculateSourcePriority(metrics: Awaited<ReturnType<typeof sourceMetrics>>) {
  let score = 25;
  score += Math.round(((metrics.verified+1)/(metrics.discovered+10)) * 100);
  score += Math.min(20, metrics.verified * 3);
  score += Math.round(metrics.phone_rate * 10);
  score += Math.round(metrics.email_rate * 10);
  score -= Math.round(metrics.false_positive_rate * 45);
  score -= Math.round(metrics.failure_rate * 50);
  score -= Math.min(20, metrics.duplicates);
  return Math.min(100, Math.max(0, score));
}

function recommendationForPriority(priority: number, failureRate: number): MerchantSourceRecommendation {
  if (failureRate >= 0.5 || priority < 20) return "retire";
  if (priority < 45) return "degrade";
  if (priority >= 75) return "promote";
  return "monitor";
}

function buildSourceConclusion(source: MerchantAcquisitionSource, metrics: Awaited<ReturnType<typeof sourceMetrics>>, priority: number) {
  if (metrics.failure_rate >= 0.5) {
    return `${source.source_name} should be avoided for now because ${metrics.failure_count}/${Math.max(metrics.scan_count, 1)} scan(s) failed in the evaluation window.`;
  }
  return `${source.source_name} produced ${metrics.verified} verified merchant(s) from ${metrics.discovered} discovered record(s), with ${(metrics.verification_rate * 100).toFixed(1)}% verification yield; learned priority is ${priority}.`;
}

function confidenceFor(metrics: Awaited<ReturnType<typeof sourceMetrics>>) {
  const sample = Math.min(1, Math.max(metrics.discovered, metrics.scan_count) / 30);
  const signal = metrics.verified > 0 || metrics.failure_count > 0 ? 0.35 : 0.15;
  return Math.min(1, Number((sample * 0.65 + signal).toFixed(4)));
}

function isVerifiedCandidate(row: Record<string, unknown>) {
  return row.enrichment_status === "completed" &&
    row.website_verified === true &&
    row.phone_verified === true &&
    row.identity_match === true &&
    Number(row.quality_score ?? 0) >= 80;
}

function sum(rows: Array<Record<string, unknown>>, key: string) {
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}

function ratio(numerator: number, denominator: number) {
  return denominator <= 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

function average(values: number[]) {
  const usable = values.filter((value) => Number.isFinite(value) && value > 0);
  return usable.length === 0 ? 0 : Math.round(usable.reduce((sum, value) => sum + value, 0) / usable.length);
}

function averageRuntime(rows: Array<Record<string, unknown>>) {
  return average(rows.map((row) => {
    if (!row.started_at || !row.completed_at) return 0;
    return Date.parse(String(row.completed_at)) - Date.parse(String(row.started_at));
  }));
}

async function countToolFailures(agentKey: string, windowStart: string, windowEnd: string) {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("agent_tool_runs" as never)
    .select("id", { count: "exact", head: true })
    .eq("agent_key" as never, agentKey as never)
    .in("status" as never, ["failed", "blocked"] as never)
    .gte("started_at" as never, windowStart as never)
    .lte("started_at" as never, windowEnd as never);
  if (error) throw error;
  return count ?? 0;
}

function groupBy(rows: Array<Record<string, unknown>>, key: string) {
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const value = String(row[key] ?? "unknown");
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }
  return grouped;
}

function mostCommon(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
