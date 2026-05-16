import { z } from "zod";
import type { Json } from "@operion/shared";
import { estimateAnthropicCost } from "@/lib/api-usage";
import { readServerEnv } from "@/lib/env";
import { ConfigurationError, ValidationError } from "@/lib/errors";
import { withRetry } from "@/lib/retry";

type ClaudeMessagesResponse = {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

export interface ClaudeJsonRequest<TSchema extends z.ZodTypeAny> {
  operation: string;
  system: string;
  user: Json;
  zodSchema: TSchema;
  model?: string;
  maxTokens?: number;
}

export async function runClaudeJson<TSchema extends z.ZodTypeAny>(request: ClaudeJsonRequest<TSchema>) {
  const env = readServerEnv();
  if (!env.ANTHROPIC_API_KEY) {
    throw new ConfigurationError("ANTHROPIC_API_KEY is required for Claude AI workflows");
  }

  const model = request.model ?? env.ANTHROPIC_MODEL;
  const startedAt = Date.now();
  const response = await withRetry(
    async () => {
      const providerResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY as string,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model,
          max_tokens: request.maxTokens ?? 2200,
          temperature: 0,
          system: `${request.system}\nReturn strict JSON only. Do not wrap JSON in markdown fences.`,
          messages: [
            {
              role: "user",
              content: JSON.stringify(request.user)
            }
          ]
        })
      });

      if (!providerResponse.ok) {
        const providerError = await providerResponse.text();
        throw new ConfigurationError("Claude workflow request failed", {
          operation: request.operation,
          model,
          status: providerResponse.status,
          providerError: providerError.slice(0, 500)
        });
      }

      return (await providerResponse.json()) as ClaudeMessagesResponse;
    },
    {
      operation: `claude.${request.operation}`,
      shouldRetry: (error) => !(error instanceof ConfigurationError || error instanceof ValidationError)
    }
  );

  const latencyMs = Date.now() - startedAt;
  const text = response.content?.find((item) => item.type === "text")?.text;
  if (!text) {
    throw new ValidationError("Claude response did not include text content", {
      operation: request.operation
    });
  }

  const parsed = parseClaudeJson(text, request.operation);
  const data = request.zodSchema.parse(parsed) as z.infer<TSchema>;
  const inputTokens = response.usage?.input_tokens ?? null;
  const outputTokens = response.usage?.output_tokens ?? null;

  return {
    data,
    usage: {
      provider: "claude" as const,
      model,
      inputTokens,
      outputTokens,
      latencyMs,
      estimatedCostUsd: estimateAnthropicCost(inputTokens ?? 0, outputTokens ?? 0)
    },
    raw: parsed
  };
}

function parseClaudeJson(text: string, operation: string) {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // Fall through to the validation error below.
      }
    }
  }

  throw new ValidationError("Claude workflow response was not valid JSON", {
    operation,
    preview: trimmed.slice(0, 500)
  });
}
