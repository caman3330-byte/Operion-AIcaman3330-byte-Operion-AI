import { z } from "zod";
import type { Json } from "@operion/shared";
import { recordApiUsage, estimateAnthropicCost } from "@/lib/api-usage";
import { estimateOpenAiCost } from "@/lib/ai/openai";
import { selectAnthropicModel } from "@/lib/ai/anthropic-models";
import { readServerEnv } from "@/lib/env";
import { ConfigurationError, ValidationError } from "@/lib/errors";
import { withRetry } from "@/lib/retry";
import { categorizeAiProviderError, isRetryableAiProviderError, throwForProviderHttpStatus } from "./errors";
import { parseProviderJson } from "./json";
import type { AiGatewayRequest, AiGatewayResult, AiProviderAdapter, AiProviderStatus, OperionAiProvider } from "./types";

type OpenAiCompatibleResponse = {
  choices?: Array<{ message?: { content?: string | null; refusal?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

type AnthropicResponse = {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
};

interface OpenAiCompatibleConfig {
  provider: OperionAiProvider;
  apiKey: string | undefined;
  model: string | undefined;
  baseUrl: string;
  serviceName: string;
  estimatedCost?: (inputTokens: number | null, outputTokens: number | null) => number | null;
}

export function createProviderAdapters(): Record<OperionAiProvider, AiProviderAdapter> {
  const env = readServerEnv();
  return {
    nvidia: createOpenAiCompatibleAdapter({
      provider: "nvidia",
      apiKey: env.NVIDIA_API_KEY,
      model: env.NVIDIA_MODEL,
      baseUrl: env.NVIDIA_API_BASE_URL,
      serviceName: "nvidia",
      estimatedCost: () => 0
    }),
    groq: createOpenAiCompatibleAdapter({
      provider: "groq",
      apiKey: env.GROQ_API_KEY,
      model: env.GROQ_MODEL,
      baseUrl: env.GROQ_API_BASE_URL,
      serviceName: "groq"
    }),
    google: createOpenAiCompatibleAdapter({
      provider: "google",
      apiKey: env.GOOGLE_AI_API_KEY,
      model: env.GOOGLE_AI_MODEL,
      baseUrl: env.GOOGLE_AI_API_BASE_URL,
      serviceName: "google"
    }),
    openrouter: createOpenAiCompatibleAdapter({
      provider: "openrouter",
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL,
      baseUrl: env.OPENROUTER_API_BASE_URL,
      serviceName: "openrouter"
    }),
    openai: createOpenAiCompatibleAdapter({
      provider: "openai",
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      baseUrl: env.OPENAI_API_BASE_URL,
      serviceName: "openai",
      estimatedCost: estimateOpenAiCost
    }),
    anthropic: createAnthropicAdapter()
  };
}

function createOpenAiCompatibleAdapter(config: OpenAiCompatibleConfig): AiProviderAdapter {
  return {
    provider: config.provider,
    getStatus() {
      return statusFor(config.provider, Boolean(config.apiKey && config.model), config.model ?? null);
    },
    async healthCheck() {
      if (!config.apiKey || !config.model) return statusFor(config.provider, false, config.model ?? null);
      const startedAt = Date.now();
      try {
        const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/models`, {
          headers: { authorization: `Bearer ${config.apiKey}` },
          signal: AbortSignal.timeout(8_000)
        });
        return checkedStatus(config.provider, response.ok ? "healthy" : statusToHealth(response.status), config.model, Date.now() - startedAt, response.ok ? null : `status_${response.status}`);
      } catch (error) {
        return checkedStatus(config.provider, "error", config.model, Date.now() - startedAt, categorizeAiProviderError(error));
      }
    },
    async generateStructured<TSchema extends z.ZodTypeAny>(request: AiGatewayRequest<TSchema>) {
      if (!config.apiKey) throw new ConfigurationError(`${config.provider} is not configured`, { provider: config.provider });
      const model = request.model ?? config.model;
      if (!model) throw new ConfigurationError(`${config.provider} model is not configured`, { provider: config.provider });

      const startedAt = Date.now();
      const response = await withRetry(
        async () => fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model,
            temperature: request.temperature ?? 0,
            max_tokens: request.maxTokens ?? 1200,
            messages: [
              { role: "system", content: `${request.system}\nReturn strict JSON only. Do not wrap JSON in markdown fences.` },
              { role: "user", content: JSON.stringify(request.user) }
            ],
            ...(request.jsonSchema && request.schemaName && config.provider === "openai"
              ? {
                  response_format: {
                    type: "json_schema",
                    json_schema: {
                      name: request.schemaName,
                      strict: true,
                      schema: request.jsonSchema
                    }
                  }
                }
              : {})
          }),
          signal: AbortSignal.timeout(30_000)
        }),
        {
          operation: `${config.provider}.${request.operation}`,
          retries: 2,
          shouldRetry: isRetryableAiProviderError
        }
      );

      const latencyMs = Date.now() - startedAt;
      const payload = await response.json().catch(() => ({})) as OpenAiCompatibleResponse;
      if (!response.ok) {
        await recordGatewayApiUsage(config.serviceName, request.operation, false, latencyMs);
        throwForProviderHttpStatus(config.provider, response.status, payload.error?.message ?? `${config.provider} request failed with HTTP ${response.status}`, {
          provider: config.provider,
          model,
          status: response.status
        });
      }

      const message = payload.choices?.[0]?.message;
      if (message?.refusal) throw new ValidationError(`${config.provider} refused the request`, { provider: config.provider, operation: request.operation });
      if (!message?.content) throw new ValidationError(`${config.provider} response was empty`, { provider: config.provider, operation: request.operation });

      const parsed = parseProviderJson(message.content, request.operation);
      const data = request.zodSchema ? request.zodSchema.parse(parsed) as z.infer<TSchema> : parsed as z.infer<TSchema>;
      const inputTokens = payload.usage?.prompt_tokens ?? null;
      const outputTokens = payload.usage?.completion_tokens ?? null;
      const estimatedCostUsd = config.estimatedCost ? config.estimatedCost(inputTokens, outputTokens) : null;
      await recordGatewayApiUsage(config.serviceName, request.operation, true, latencyMs, inputTokens, outputTokens, estimatedCostUsd);

      return gatewayResult(request, config.provider, model, data, parsed as Json, latencyMs, inputTokens, outputTokens, estimatedCostUsd);
    }
  };
}

function createAnthropicAdapter(): AiProviderAdapter {
  return {
    provider: "anthropic",
    getStatus() {
      const env = readServerEnv();
      const model = selectAnthropicModel(env, "default");
      return statusFor("anthropic", Boolean(env.ANTHROPIC_API_KEY && model), model);
    },
    async healthCheck() {
      const env = readServerEnv();
      const model = selectAnthropicModel(env, "default");
      if (!env.ANTHROPIC_API_KEY) return statusFor("anthropic", false, model);
      const startedAt = Date.now();
      try {
        const response = await fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01"
          },
          signal: AbortSignal.timeout(8_000)
        });
        return checkedStatus("anthropic", response.ok ? "healthy" : statusToHealth(response.status), model, Date.now() - startedAt, response.ok ? null : `status_${response.status}`);
      } catch (error) {
        return checkedStatus("anthropic", "error", model, Date.now() - startedAt, categorizeAiProviderError(error));
      }
    },
    async generateStructured<TSchema extends z.ZodTypeAny>(request: AiGatewayRequest<TSchema>) {
      const env = readServerEnv();
      if (!env.ANTHROPIC_API_KEY) throw new ConfigurationError("anthropic is not configured", { provider: "anthropic" });
      const model = request.model ?? selectAnthropicModel(env, "default");
      const startedAt = Date.now();
      const response = await withRetry(
        async () => fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY as string,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model,
            max_tokens: request.maxTokens ?? 1200,
            temperature: request.temperature ?? 0,
            system: `${request.system}\nReturn strict JSON only. Do not wrap JSON in markdown fences.`,
            messages: [{ role: "user", content: JSON.stringify(request.user) }]
          }),
          signal: AbortSignal.timeout(30_000)
        }),
        {
          operation: `anthropic.${request.operation}`,
          retries: 2,
          shouldRetry: isRetryableAiProviderError
        }
      );
      const latencyMs = Date.now() - startedAt;
      const payload = await response.json().catch(() => ({})) as AnthropicResponse;
      if (!response.ok) {
        await recordGatewayApiUsage("anthropic", request.operation, false, latencyMs);
        throwForProviderHttpStatus("anthropic", response.status, payload.error?.message ?? `Anthropic request failed with HTTP ${response.status}`, {
          provider: "anthropic",
          model,
          status: response.status
        });
      }

      const text = payload.content?.find((item) => item.type === "text")?.text;
      if (!text) throw new ValidationError("Anthropic response was empty", { provider: "anthropic", operation: request.operation });
      const parsed = parseProviderJson(text, request.operation);
      const data = request.zodSchema ? request.zodSchema.parse(parsed) as z.infer<TSchema> : parsed as z.infer<TSchema>;
      const inputTokens = payload.usage?.input_tokens ?? null;
      const outputTokens = payload.usage?.output_tokens ?? null;
      const estimatedCostUsd = estimateAnthropicCost(inputTokens ?? 0, outputTokens ?? 0);
      await recordGatewayApiUsage("anthropic", request.operation, true, latencyMs, inputTokens, outputTokens, estimatedCostUsd);

      return gatewayResult(request, "anthropic", model, data, parsed as Json, latencyMs, inputTokens, outputTokens, estimatedCostUsd);
    }
  };
}

function statusFor(provider: OperionAiProvider, configured: boolean, model: string | null): AiProviderStatus {
  return {
    provider,
    configured: configured ? "configured" : "not_configured",
    health: configured ? "unhealthy" : "not_configured",
    lastChecked: null,
    model,
    errorCategory: configured ? null : "missing_credentials_or_model"
  };
}

function checkedStatus(provider: OperionAiProvider, health: AiProviderStatus["health"], model: string | null, latencyMs: number, errorCategory: string | null): AiProviderStatus {
  return {
    provider,
    configured: "configured",
    health,
    lastChecked: new Date().toISOString(),
    model,
    errorCategory: errorCategory ? `${errorCategory}; latency_ms=${latencyMs}` : null
  };
}

function statusToHealth(status: number): AiProviderStatus["health"] {
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unhealthy";
  return "error";
}

function gatewayResult<TData>(
  request: AiGatewayRequest,
  provider: OperionAiProvider,
  model: string,
  data: TData,
  raw: Json,
  latencyMs: number,
  inputTokens: number | null,
  outputTokens: number | null,
  estimatedCostUsd: number | null
): AiGatewayResult<TData> {
  return {
    data,
    provider,
    model,
    usage: {
      provider,
      model,
      taskType: request.taskType,
      timestamp: new Date().toISOString(),
      success: true,
      failure: false,
      latencyMs,
      inputTokens,
      outputTokens,
      estimatedCostUsd
    },
    raw,
    fallback: {
      primaryProvider: provider,
      fallbackProvider: null,
      reason: null
    }
  };
}

async function recordGatewayApiUsage(
  service: string,
  operation: string,
  success: boolean,
  latencyMs: number,
  inputTokens: number | null = null,
  outputTokens: number | null = null,
  estimatedCostUsd: number | null = null
) {
  try {
    await recordApiUsage({
      service: service as Parameters<typeof recordApiUsage>[0]["service"],
      operation,
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      success,
      latencyMs
    });
  } catch {
    // Usage logging must not make provider failover or read-only AI calls unsafe.
  }
}
