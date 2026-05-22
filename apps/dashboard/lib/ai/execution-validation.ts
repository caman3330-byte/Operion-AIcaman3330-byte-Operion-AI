import { z } from "zod";
import type { Json } from "@operion/shared";
import { logAIAction } from "./action-logger";
import { runClaudeJson } from "./claude";
import { runOpenAiStructuredOutput } from "./openai";
import {
  buildFraudDetectionPrompt,
  buildLenderRoutingPrompt,
  buildOperationalInsightPrompt,
  buildUnderwritingPrompt,
  type OperationalPrompt,
  type UnderwritingPromptKind
} from "./prompts/underwriting-operations";

const providerHealthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  message: z.string(),
  confidence: z.number().min(0).max(1)
});

const providerHealthJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["ok", "degraded"] },
    message: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  },
  required: ["status", "message", "confidence"]
};

export type AiProviderTestTarget = "openai" | "claude" | "both";

export interface AiProviderTestResult {
  provider: "openai" | "claude";
  success: boolean;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number;
  model?: string;
  error?: string;
}

export async function validateAiProviders(input: {
  provider: AiProviderTestTarget;
  persistLog: boolean;
  mode?: "provider_health" | "prompt_suite";
  fallback?: boolean;
}): Promise<{ success: boolean; results: AiProviderTestResult[] }> {
  if (input.mode === "prompt_suite") {
    return validateAiPromptSuite(input);
  }

  const providers = input.provider === "both" ? ["openai", "claude"] as const : [input.provider];
  const results: AiProviderTestResult[] = [];

  for (const provider of providers) {
    const result = provider === "openai" ? await validateOpenAiProvider() : await validateClaudeProvider();
    results.push(result);
    if (input.persistLog) {
      await logProviderValidation(result);
    }
  }

  return {
    success: results.every((result) => result.success),
    results
  };
}

export async function validateAiPromptSuite(input: {
  provider: AiProviderTestTarget;
  persistLog: boolean;
  fallback?: boolean;
}) {
  const prompts = buildValidationPrompts();
  const preferredProviders = input.provider === "both" ? ["openai", "claude"] as const : [input.provider];
  const results: AiProviderTestResult[] = [];

  for (const prompt of prompts) {
    let promptResult: AiProviderTestResult | null = null;
    for (const provider of preferredProviders) {
      promptResult = provider === "openai"
        ? await validateOpenAiPrompt(prompt)
        : await validateClaudePrompt(prompt);
      results.push({
        ...promptResult,
        ...(promptResult.error ? { error: `${prompt.kind}: ${promptResult.error}` } : {})
      });
      if (promptResult.success || input.fallback === false) break;
    }
  }

  if (input.persistLog) {
    for (const result of results) {
      await logProviderValidation(result);
    }
  }

  return {
    success: results.some((result) => result.success) && !results.some((result) => !result.success && input.fallback === false),
    results
  };
}

async function validateOpenAiProvider(): Promise<AiProviderTestResult> {
  const startedAt = Date.now();
  try {
    const response = await runOpenAiStructuredOutput({
      operation: "provider_validation",
      schemaName: "provider_health",
      system: "Return a concise JSON health check for Operion internal AI execution.",
      user: { check: "structured_output_validation" } as Json,
      jsonSchema: providerHealthJsonSchema,
      zodSchema: providerHealthSchema
    });
    return {
      provider: "openai",
      success: response.data.status === "ok",
      latencyMs: response.usage.latencyMs,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      estimatedCostUsd: response.usage.estimatedCostUsd,
      model: response.usage.model
    };
  } catch (error) {
    return {
      provider: "openai",
      success: false,
      latencyMs: Date.now() - startedAt,
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function validateClaudeProvider(): Promise<AiProviderTestResult> {
  const startedAt = Date.now();
  try {
    const response = await runClaudeJson({
      operation: "provider_validation",
      system: "Return a concise JSON health check for Operion internal AI execution.",
      user: { check: "structured_output_validation" } as Json,
      zodSchema: providerHealthSchema
    });
    return {
      provider: "claude",
      success: response.data.status === "ok",
      latencyMs: response.usage.latencyMs,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      estimatedCostUsd: response.usage.estimatedCostUsd,
      model: response.usage.model
    };
  } catch (error) {
    return {
      provider: "claude",
      success: false,
      latencyMs: Date.now() - startedAt,
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function validateOpenAiPrompt(prompt: OperationalPrompt): Promise<AiProviderTestResult> {
  const startedAt = Date.now();
  try {
    const response = await runOpenAiStructuredOutput({
      operation: `prompt_validation_${prompt.kind}`,
      schemaName: "provider_health",
      system: `${prompt.system} Validate that this prompt can execute safely and return a health JSON.`,
      user: prompt.user,
      jsonSchema: providerHealthJsonSchema,
      zodSchema: providerHealthSchema
    });
    return {
      provider: "openai",
      success: response.data.status === "ok",
      latencyMs: response.usage.latencyMs,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      estimatedCostUsd: response.usage.estimatedCostUsd,
      model: response.usage.model
    };
  } catch (error) {
    return {
      provider: "openai",
      success: false,
      latencyMs: Date.now() - startedAt,
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function validateClaudePrompt(prompt: OperationalPrompt): Promise<AiProviderTestResult> {
  const startedAt = Date.now();
  try {
    const response = await runClaudeJson({
      operation: `prompt_validation_${prompt.kind}`,
      system: `${prompt.system} Validate that this prompt can execute safely and return a health JSON.`,
      user: prompt.user,
      zodSchema: providerHealthSchema
    });
    return {
      provider: "claude",
      success: response.data.status === "ok",
      latencyMs: response.usage.latencyMs,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      estimatedCostUsd: response.usage.estimatedCostUsd,
      model: response.usage.model
    };
  } catch (error) {
    return {
      provider: "claude",
      success: false,
      latencyMs: Date.now() - startedAt,
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function logProviderValidation(result: AiProviderTestResult) {
  await logAIAction({
    modelUsed: result.model ?? result.provider,
    executionLatencyMs: result.latencyMs,
    inputTokens: result.inputTokens ?? 0,
    outputTokens: result.outputTokens ?? 0,
    estimatedCostUsd: result.estimatedCostUsd,
    retryCount: 0,
    confidenceScore: result.success ? 1 : 0,
    promptType: "operational_insights",
    workflowSource: "ai_provider_validation",
    metadata: {
      provider: result.provider,
      success: result.success,
      error: result.error ?? null
    }
  });
}

function buildValidationPrompts(): OperationalPrompt[] {
  const merchant = {
    businessName: "Validation Merchant",
    industry: "restaurant",
    state: "NY",
    requestedAmount: 75000,
    monthlyDeposits: 95000,
    creditScoreRange: "650_699",
    bankSignals: {
      nsfCount: 1,
      depositTrend: "stable",
      transferIntensity: "moderate"
    }
  } as Json;

  const promptBuilders: Array<[UnderwritingPromptKind, (input: Json) => OperationalPrompt]> = [
    ["underwriting", buildUnderwritingPrompt],
    ["lender_routing", buildLenderRoutingPrompt],
    ["fraud_detection", buildFraudDetectionPrompt],
    ["operational_insight", buildOperationalInsightPrompt]
  ];

  return promptBuilders.map(([, builder]) => builder(merchant));
}
