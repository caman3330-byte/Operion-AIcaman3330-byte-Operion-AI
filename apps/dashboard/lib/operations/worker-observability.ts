import type { Json } from "@operion/shared";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type SchedulerRunStatus = "completed" | "failed" | "skipped" | "disabled";
export type WorkerHeartbeatStatus = "online" | "offline" | "running" | "idle" | "failed";

export interface SchedulerRunInput {
  schedulerKey: string;
  routePath: string;
  cronSchedule?: string | null;
  workerName?: string | null;
  department?: string | null;
  queueName?: string | null;
  environmentFlag?: string | null;
  environmentFlagEnabled?: boolean | null;
  metadata?: Json;
}

export interface SchedulerRunFinishInput {
  status: SchedulerRunStatus;
  queueAffected?: number;
  success?: boolean;
  errorMessage?: string | null;
  metadata?: Json;
}

export interface WorkerHeartbeatInput {
  workerName: string;
  department: string;
  status: WorkerHeartbeatStatus;
  queueName?: string | null;
  queueSize?: number;
  currentTask?: string | null;
  lastCompletedTask?: string | null;
  lastStartedAt?: string | null;
  lastCompletedAt?: string | null;
  averageExecutionMs?: number | null;
  lastDurationMs?: number | null;
  errorMessage?: string | null;
  metadata?: Json;
}

export async function startSchedulerRun(input: SchedulerRunInput): Promise<string | null> {
  try {
    const { data, error } = await supabase()
      .from("scheduler_execution_runs" as never)
      .insert({
        scheduler_key: input.schedulerKey,
        route_path: input.routePath,
        cron_schedule: input.cronSchedule ?? null,
        status: "started",
        worker_name: input.workerName ?? null,
        queue_name: input.queueName ?? null,
        environment_flag: input.environmentFlag ?? null,
        environment_flag_enabled: input.environmentFlagEnabled ?? null,
        metadata: input.metadata ?? {}
      } as never)
      .select("id")
      .single();

    if (error) {
      logger.warn("scheduler_run_start_log_failed", { schedulerKey: input.schedulerKey, error: error.message });
      return null;
    }

    return String((data as { id: string }).id);
  } catch (error) {
    logger.warn("scheduler_run_start_log_unavailable", { schedulerKey: input.schedulerKey, error: message(error) });
    return null;
  }
}

export async function finishSchedulerRun(runId: string | null, startedAt: number, input: SchedulerRunFinishInput) {
  if (!runId) return;
  try {
    const durationMs = Math.max(0, Date.now() - startedAt);
    const { error } = await supabase()
      .from("scheduler_execution_runs" as never)
      .update({
        status: input.status,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        queue_affected: Math.max(0, input.queueAffected ?? 0),
        success: input.success ?? input.status === "completed",
        error_message: input.errorMessage ?? null,
        metadata: input.metadata ?? {}
      } as never)
      .eq("id" as never, runId as never);

    if (error) {
      logger.warn("scheduler_run_finish_log_failed", { runId, error: error.message });
    }
  } catch (error) {
    logger.warn("scheduler_run_finish_log_unavailable", { runId, error: message(error) });
  }
}

export async function withSchedulerRun<T>(
  input: SchedulerRunInput,
  run: () => Promise<{ value: T; status?: SchedulerRunStatus; queueAffected?: number; success?: boolean; metadata?: Json }>
): Promise<T> {
  const startedAt = Date.now();
  const runId = await startSchedulerRun(input);
  if (input.workerName && input.department) {
    await recordWorkerHeartbeat({
      workerName: input.workerName,
      department: input.department,
      status: "running",
      queueName: input.queueName ?? null,
      currentTask: input.schedulerKey,
      lastStartedAt: new Date(startedAt).toISOString(),
      metadata: { scheduler_key: input.schedulerKey, route_path: input.routePath } as Json
    });
  }
  try {
    const result = await run();
    const finishInput: {
      status: SchedulerRunStatus;
      queueAffected?: number;
      success?: boolean;
      metadata?: Json;
    } = { status: result.status ?? "completed" };
    if (result.queueAffected !== undefined) finishInput.queueAffected = result.queueAffected;
    if (result.success !== undefined) finishInput.success = result.success;
    if (result.metadata !== undefined) finishInput.metadata = result.metadata;
    await finishSchedulerRun(runId, startedAt, compactFinishInput(finishInput));
    if (input.workerName && input.department) {
      const durationMs = Date.now() - startedAt;
      await recordWorkerHeartbeat({
        workerName: input.workerName,
        department: input.department,
        status: result.status === "disabled" || result.status === "skipped" || result.success === false ? "idle" : "idle",
        queueName: input.queueName ?? null,
        queueSize: 0,
        lastCompletedTask: input.schedulerKey,
        lastCompletedAt: new Date().toISOString(),
        averageExecutionMs: durationMs,
        lastDurationMs: durationMs,
        metadata: result.metadata ?? ({ scheduler_key: input.schedulerKey } as Json)
      });
    }
    return result.value;
  } catch (error) {
    await finishSchedulerRun(runId, startedAt, {
      status: "failed",
      success: false,
      errorMessage: message(error)
    });
    if (input.workerName && input.department) {
      await recordWorkerHeartbeat({
        workerName: input.workerName,
        department: input.department,
        status: "failed",
        queueName: input.queueName ?? null,
        queueSize: 0,
        currentTask: input.schedulerKey,
        lastDurationMs: Date.now() - startedAt,
        errorMessage: message(error),
        metadata: { scheduler_key: input.schedulerKey, route_path: input.routePath } as Json
      });
    }
    throw error;
  }
}

export async function recordWorkerHeartbeat(input: WorkerHeartbeatInput) {
  try {
    const now = new Date().toISOString();
    const { error } = await supabase()
      .from("worker_heartbeats" as never)
      .upsert({
        worker_name: input.workerName,
        department: input.department,
        status: input.status,
        queue_name: input.queueName ?? null,
        queue_size: Math.max(0, input.queueSize ?? 0),
        current_task: input.currentTask ?? null,
        last_completed_task: input.lastCompletedTask ?? null,
        last_heartbeat_at: now,
        last_started_at: input.lastStartedAt ?? null,
        last_completed_at: input.lastCompletedAt ?? null,
        average_execution_ms: input.averageExecutionMs ?? null,
        last_duration_ms: input.lastDurationMs ?? null,
        error_message: input.errorMessage ?? null,
        metadata: input.metadata ?? {},
        updated_at: now
      } as never, { onConflict: "worker_name" });

    if (error) {
      logger.warn("worker_heartbeat_log_failed", { workerName: input.workerName, error: error.message });
    }
  } catch (error) {
    logger.warn("worker_heartbeat_log_unavailable", { workerName: input.workerName, error: message(error) });
  }
}

function supabase() {
  return getSupabaseAdmin() as any;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function compactFinishInput(input: {
  status: SchedulerRunStatus;
  queueAffected?: number;
  success?: boolean;
  metadata?: Json;
}): SchedulerRunFinishInput {
  return {
    status: input.status,
    ...(input.queueAffected !== undefined ? { queueAffected: input.queueAffected } : {}),
    ...(input.success !== undefined ? { success: input.success } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {})
  };
}
