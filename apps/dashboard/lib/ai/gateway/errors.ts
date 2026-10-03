import { ConfigurationError, ValidationError } from "@/lib/errors";

export class AiProviderRateLimitError extends ConfigurationError {
  constructor(message: string, details?: unknown) {
    super(message, details);
    this.name = "AiProviderRateLimitError";
  }
}

export class AiProviderAuthError extends ConfigurationError {
  constructor(message: string, details?: unknown) {
    super(message, details);
    this.name = "AiProviderAuthError";
  }
}

export function categorizeAiProviderError(error: unknown) {
  const text = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (error instanceof AiProviderRateLimitError || text.includes("429") || text.includes("rate limit") || text.includes("quota")) return "rate_limited";
  if (error instanceof AiProviderAuthError || text.includes("401") || text.includes("403") || text.includes("invalid api key") || text.includes("unauthorized")) return "auth";
  if (error instanceof ValidationError || text.includes("schema") || text.includes("json")) return "invalid_response";
  if (error instanceof ConfigurationError || text.includes("not configured") || text.includes("model")) return "configuration";
  if (text.includes("timeout") || text.includes("network") || text.includes("fetch failed")) return "temporary";
  return "provider_error";
}

export function isRetryableAiProviderError(error: unknown) {
  const category = categorizeAiProviderError(error);
  return category === "temporary" || category === "rate_limited" || category === "provider_error";
}

export function canFailoverAiProvider(error: unknown) {
  const category = categorizeAiProviderError(error);
  return category !== "auth" && category !== "invalid_response" && category !== "configuration";
}

export function throwForProviderHttpStatus(provider: string, status: number, message: string, details?: unknown): never {
  if (status === 401 || status === 403) {
    throw new AiProviderAuthError(`${provider} authentication failed`, details);
  }
  if (status === 429) {
    throw new AiProviderRateLimitError(`${provider} rate limited the request`, details);
  }
  throw new ConfigurationError(message, details);
}
