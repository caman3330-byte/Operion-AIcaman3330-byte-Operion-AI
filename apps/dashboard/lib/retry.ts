import { logger } from "@/lib/logger";

interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  operation: string;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  { retries = 3, baseDelayMs = 1000, operation, shouldRetry }: RetryOptions
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      logger.warn("retry_attempt_failed", { operation, attempt, error });

      const canRetry = attempt < retries && (shouldRetry ? shouldRetry(error, attempt) : true);
      if (!canRetry) {
        throw lastError;
      }

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
      }
    }
  }

  throw lastError;
}
