import { z } from "zod";
import { ConfigurationError, ValidationError } from "@/lib/errors";
import { readServerEnv } from "@/lib/env";
import { withRetry } from "@/lib/retry";
import { logger } from "@/lib/logger";
import type { StructuredOutputRequest } from "./types";

type OpenAiChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      refusal?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

export async function runOpenAiStructuredOutput<TSchema extends z.ZodTypeAny>(request: StructuredOutputRequest<TSchema>) {
  const env = readServerEnv();
  if (!env.OPENAI_API_KEY) {
    throw new ConfigurationError("OPENAI_API_KEY is required for OpenAI structured output workflows");
  }
  const primaryModel = request.model ?? env.OPENAI_MODEL;
  const fallbackModel = env.OPENAI_FALLBACK_MODEL ?? null;

  async function callModel(modelToUse: string) {
    const startedAt = Date.now();
    const response = await withRetry(
      async () =>
        fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            authorization: `Bearer ${env.OPENAI_API_KEY}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: modelToUse,
            temperature: request.temperature ?? 0.1,
            messages: [
              {
                role: "system",
                content: request.system
              },
              {
                role: "user",
                content: JSON.stringify(request.user)
              }
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: request.schemaName,
                strict: true,
                schema: request.jsonSchema
              }
            }
          })
        }),
      {
        operation: `openai.${request.operation}`,
        shouldRetry: (error) => !(error instanceof ConfigurationError || error instanceof ValidationError)
      }
    );

    const latencyMs = Date.now() - startedAt;
    const payload = (await response.json()) as OpenAiChatCompletionResponse & { error?: { message?: string } };
    return { response, payload, latencyMs, model: modelToUse } as const;
  }

  // Try primary model first, then fallback model if configured and appropriate
  let callResult;
  try {
    callResult = await callModel(primaryModel);
  } catch (err) {
    logger.warn("openai_primary_model_failed", { error: err instanceof Error ? err.message : err, model: primaryModel });
    if (fallbackModel && fallbackModel !== primaryModel) {
      try {
        callResult = await callModel(fallbackModel);
        logger.info("openai_fallback_model_used", { model: fallbackModel });
      } catch (err2) {
        throw new ConfigurationError(`OpenAI structured output failed for models ${primaryModel} and ${fallbackModel}`, {
          operation: request.operation
        });
      }
    } else {
      throw new ConfigurationError(`OpenAI structured output failed for model ${primaryModel}`, { operation: request.operation });
    }
  }

  const { response, payload, latencyMs, model } = callResult;
  if (!response.ok) {
    throw new ConfigurationError(payload.error?.message ?? "OpenAI structured output request failed", {
      operation: request.operation,
      model
    });
  }

  const message = payload.choices?.[0]?.message;
  if (message?.refusal) {
    throw new ValidationError("OpenAI refused the structured output request", {
      operation: request.operation,
      refusal: message.refusal
    });
  }

  if (!message?.content) {
    throw new ValidationError("OpenAI structured output response was empty", {
      operation: request.operation
    });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(message.content);
  } catch {
    throw new ValidationError("OpenAI structured output response was not valid JSON", {
      operation: request.operation,
      preview: message.content.slice(0, 500)
    });
  }

  const data = request.zodSchema.parse(parsedJson) as z.infer<TSchema>;
  const inputTokens = payload.usage?.prompt_tokens ?? null;
  const outputTokens = payload.usage?.completion_tokens ?? null;

  return {
    data,
    usage: {
      provider: "openai" as const,
      model,
      inputTokens,
      outputTokens,
      latencyMs,
      estimatedCostUsd: estimateOpenAiCost(inputTokens, outputTokens)
    },
    raw: parsedJson
  };
}

export async function checkOpenAiHealth() {
  const env = readServerEnv();
  if (!env.OPENAI_API_KEY) return { healthy: false, message: "missing_key" };
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }
    });
    if (!res.ok) return { healthy: false, message: `status_${res.status}` };
    return { healthy: true };
  } catch (err) {
    return { healthy: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export function estimateOpenAiCost(inputTokens: number | null, outputTokens: number | null) {
  const inputRate = Number(process.env.OPENAI_COST_PER_1K_INPUT_TOKENS ?? 0);
  const outputRate = Number(process.env.OPENAI_COST_PER_1K_OUTPUT_TOKENS ?? 0);
  return ((inputTokens ?? 0) / 1000) * inputRate + ((outputTokens ?? 0) / 1000) * outputRate;
}
