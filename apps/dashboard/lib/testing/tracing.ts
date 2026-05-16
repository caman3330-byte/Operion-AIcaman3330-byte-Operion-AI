import type { Json, WorkflowTraceStatus } from "@operion/shared";
import { simulationRepository } from "@/lib/repositories/simulation";

export interface TraceStepInput {
  simulationRunId?: string | null;
  workflowKey: string;
  stepKey: string;
  entityType?: string | null;
  entityId?: string | null;
  input?: Json;
  attempt?: number;
}

export async function traceStep<T>(input: TraceStepInput, operation: () => Promise<T>, outputMapper?: (value: T) => Json): Promise<T> {
  const startedAt = Date.now();
  await writeTrace({
    ...input,
    status: "started",
    startedAt: new Date().toISOString()
  }).catch(() => null);

  try {
    const result = await operation();
    await writeTrace({
      ...input,
      status: "completed",
      latencyMs: Date.now() - startedAt,
      output: outputMapper ? outputMapper(result) : ({ ok: true } as Json),
      completedAt: new Date().toISOString()
    }).catch(() => null);
    return result;
  } catch (error) {
    await writeTrace({
      ...input,
      status: "failed",
      latencyMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : "Unknown trace operation error",
      completedAt: new Date().toISOString()
    }).catch(() => null);
    throw error;
  }
}

export async function writeTrace(input: TraceStepInput & {
  status: WorkflowTraceStatus;
  latencyMs?: number | null;
  output?: Json;
  errorMessage?: string | null;
  startedAt?: string;
  completedAt?: string | null;
}) {
  return simulationRepository.createTrace({
    simulation_run_id: input.simulationRunId ?? null,
    workflow_key: input.workflowKey,
    step_key: input.stepKey,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    status: input.status,
    attempt: input.attempt ?? 1,
    latency_ms: input.latencyMs ?? null,
    input: input.input ?? {},
    output: input.output ?? {},
    error_message: input.errorMessage ?? null,
    started_at: input.startedAt ?? new Date().toISOString(),
    completed_at: input.completedAt ?? null
  });
}
