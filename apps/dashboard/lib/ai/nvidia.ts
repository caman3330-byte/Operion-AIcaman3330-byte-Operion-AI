import { z } from "zod";
import type { Json } from "@operion/shared";
import { recordApiUsage } from "@/lib/api-usage";
import { readServerEnv } from "@/lib/env";
import { ConfigurationError, ValidationError } from "@/lib/errors";
import { withRetry } from "@/lib/retry";

type NvidiaChatCompletionResponse = {
  id?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export interface NvidiaWorkerJsonRequest<TSchema extends z.ZodTypeAny> {
  operation: string;
  system: string;
  user: Json;
  zodSchema: TSchema;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function runNvidiaWorkerJson<TSchema extends z.ZodTypeAny>(request: NvidiaWorkerJsonRequest<TSchema>) {
  const env = readServerEnv();
  if (!env.NVIDIA_API_KEY) {
    throw new ConfigurationError("NVIDIA_API_KEY is required for NVIDIA worker tasks");
  }

  const model = request.model ?? env.NVIDIA_MODEL;
  const startedAt = Date.now();

  const response = await withRetry(
    async () => fetch(`${env.NVIDIA_API_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.NVIDIA_API_KEY}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model,
          temperature: request.temperature ?? 0,
          max_tokens: request.maxTokens ?? 700,
          messages: [
            {
              role: "system",
              content: `${request.system}\nReturn strict JSON only. Do not invent missing business facts.`
            },
            {
              role: "user",
              content: JSON.stringify(request.user)
            }
          ]
        }),
      signal: AbortSignal.timeout(env.NVIDIA_WORKER_TIMEOUT_MS)
    }),
    {
      operation: `nvidia.${request.operation}`,
      retries: Math.max(1, env.NVIDIA_WORKER_MAX_RETRIES),
      shouldRetry: (error) => !(error instanceof ConfigurationError || error instanceof ValidationError)
    }
  );
  const latencyMs = Date.now() - startedAt;
  const payload = await response.json().catch(() => ({})) as NvidiaChatCompletionResponse & { error?: { message?: string } };
  if (!response.ok) {
    await recordApiUsage({
      service: "nvidia",
      operation: request.operation,
      success: false,
      latencyMs
    });
    throw new ConfigurationError(payload.error?.message ?? `NVIDIA worker request failed with HTTP ${response.status}`, {
      operation: request.operation,
      model,
      status: response.status
    });
  }

  const text = payload.choices?.[0]?.message?.content;
  if (!text) {
    throw new ValidationError("NVIDIA worker response was empty", { operation: request.operation, model });
  }

    const parsed = parseJson(text, request.operation);
    const data = request.zodSchema.parse(parsed) as z.infer<TSchema>;
    const inputTokens = payload.usage?.prompt_tokens ?? null;
    const outputTokens = payload.usage?.completion_tokens ?? null;
    await recordApiUsage({
      service: "nvidia",
      operation: request.operation,
      inputTokens,
      outputTokens,
      estimatedCostUsd: 0,
      success: true,
      latencyMs
    });

  return {
    data,
    usage: {
      provider: "nvidia" as const,
      model,
      inputTokens,
      outputTokens,
      latencyMs,
      estimatedCostUsd: 0
    },
    raw: parsed
  };
}

export function getNvidiaWorkerStatus() {
  return {
    configured: Boolean(process.env.NVIDIA_API_KEY),
    model: process.env.NVIDIA_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b",
    baseUrl: process.env.NVIDIA_API_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
    role: "secondary_worker",
    active: Boolean(process.env.NVIDIA_API_KEY)
  };
}

function parseJson(text: string, operation: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
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

  throw new ValidationError("NVIDIA worker response was not valid JSON", {
    operation,
    preview: trimmed.slice(0, 500)
  });
}
