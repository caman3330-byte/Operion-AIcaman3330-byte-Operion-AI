export class AcquisitionTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcquisitionTimeoutError";
  }
}

export interface AcquisitionRunBudget {
  startedAt: number;
  timeoutMs: number;
}

export function createRunBudget(timeoutMs: number): AcquisitionRunBudget {
  return { startedAt: Date.now(), timeoutMs };
}

export function remainingBudgetMs(budget?: AcquisitionRunBudget | null) {
  if (!budget) return Number.POSITIVE_INFINITY;
  return Math.max(0, budget.timeoutMs - (Date.now() - budget.startedAt));
}

export function assertBudgetAvailable(budget: AcquisitionRunBudget | undefined | null, label: string) {
  if (remainingBudgetMs(budget) <= 0) throw new AcquisitionTimeoutError(`${label} timed out`);
}

export function boundedTimeoutMs(requestedMs: number, budget?: AcquisitionRunBudget | null) {
  const remaining = remainingBudgetMs(budget);
  if (!Number.isFinite(remaining)) return requestedMs;
  return Math.max(1, Math.min(requestedMs, remaining));
}

export function boundedNumber(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results: R[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), Math.max(1, items.length));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index] as T, index);
    }
  }));

  return results;
}
