import { z } from "zod";
import { OperionAiGateway } from "./index";
import { AiProviderAuthError, AiProviderRateLimitError, categorizeAiProviderError } from "./errors";
import { evaluateAiGatewayPolicy } from "./policy";
import type { AiGatewayRequest, AiGatewayResult, AiProviderAdapter, AiProviderStatus, OperionAiProvider } from "./types";

const schema = z.object({
  decision: z.enum(["qualified", "review_required"]),
  confidence: z.number().min(0).max(1),
  reason: z.string()
});

const baseRequest: AiGatewayRequest<typeof schema> = {
  operation: "gateway_mock_test",
  taskType: "FAST_CLASSIFICATION",
  capability: "classify",
  system: "Classify the provided merchant candidate.",
  user: { business_name: "Operion Test Merchant" },
  zodSchema: schema,
  preferredProviders: ["groq", "openai"]
};

function status(provider: OperionAiProvider, configured: boolean): AiProviderStatus {
  return {
    provider,
    configured: configured ? "configured" : "not_configured",
    health: configured ? "healthy" : "not_configured",
    lastChecked: configured ? new Date(0).toISOString() : null,
    model: configured ? `${provider}-mock-model` : null,
    errorCategory: null
  };
}

function adapter(provider: OperionAiProvider, configured: boolean, execute: () => Promise<z.infer<typeof schema>>): AiProviderAdapter {
  return {
    provider,
    getStatus: () => status(provider, configured),
    async generateStructured<TSchema extends z.ZodTypeAny>(request: AiGatewayRequest<TSchema>) {
      const data = await execute();
      const parsed = request.zodSchema ? request.zodSchema.parse(data) as z.infer<TSchema> : data as z.infer<TSchema>;
      return {
        data: parsed,
        provider,
        model: `${provider}-mock-model`,
        usage: {
          provider,
          model: `${provider}-mock-model`,
          taskType: request.taskType,
          timestamp: new Date(0).toISOString(),
          success: true,
          failure: false,
          latencyMs: 1,
          inputTokens: 1,
          outputTokens: 1,
          estimatedCostUsd: null
        },
        raw: parsed,
        fallback: {
          primaryProvider: provider,
          fallbackProvider: null,
          reason: null
        }
      } satisfies AiGatewayResult<z.infer<TSchema>>;
    }
  };
}

const unused = adapter("nvidia", false, async () => ({ decision: "review_required", confidence: 0.5, reason: "unused" }));

export const aiGatewayMockTests = {
  providerNotConfigured() {
    const gateway = new OperionAiGateway({
      nvidia: unused,
      groq: adapter("groq", false, async () => ({ decision: "qualified", confidence: 1, reason: "not used" })),
      google: unused,
      openrouter: unused,
      openai: adapter("openai", true, async () => ({ decision: "qualified", confidence: 0.91, reason: "fallback used" })),
      anthropic: unused
    });
    return gateway.generateStructured(baseRequest);
  },

  providerConfigured() {
    const gateway = new OperionAiGateway({
      nvidia: unused,
      groq: adapter("groq", true, async () => ({ decision: "qualified", confidence: 0.93, reason: "primary used" })),
      google: unused,
      openrouter: unused,
      openai: unused,
      anthropic: unused
    });
    return gateway.getProviderStatuses();
  },

  successfulRequest() {
    const gateway = new OperionAiGateway({
      nvidia: unused,
      groq: adapter("groq", true, async () => ({ decision: "qualified", confidence: 0.9, reason: "ok" })),
      google: unused,
      openrouter: unused,
      openai: unused,
      anthropic: unused
    });
    return gateway.generateStructured(baseRequest);
  },

  fallback() {
    const gateway = new OperionAiGateway({
      nvidia: unused,
      groq: adapter("groq", true, async () => {
        throw new Error("temporary network failure");
      }),
      google: unused,
      openrouter: unused,
      openai: adapter("openai", true, async () => ({ decision: "review_required", confidence: 0.72, reason: "fallback" })),
      anthropic: unused
    });
    return gateway.generateStructured(baseRequest);
  },

  structuredOutputValidation() {
    const gateway = new OperionAiGateway({
      nvidia: unused,
      groq: adapter("groq", true, async () => ({ decision: "not_valid", confidence: 2, reason: "" } as unknown as z.infer<typeof schema>)),
      google: unused,
      openrouter: unused,
      openai: unused,
      anthropic: unused
    });
    return gateway.generateStructured(baseRequest);
  },

  providerHealth() {
    const gateway = new OperionAiGateway({
      nvidia: unused,
      groq: adapter("groq", true, async () => ({ decision: "qualified", confidence: 0.9, reason: "ok" })),
      google: unused,
      openrouter: unused,
      openai: unused,
      anthropic: unused
    });
    return gateway.getProviderStatuses();
  },

  timeoutCategorization() {
    return categorizeAiProviderError(new Error("provider request timeout"));
  },

  rateLimitCategorization() {
    return categorizeAiProviderError(new AiProviderRateLimitError("429 rate limit"));
  },

  invalidCredentialCategorization() {
    return categorizeAiProviderError(new AiProviderAuthError("401 invalid API key"));
  },

  policyDefaultsRequireApproval() {
    return evaluateAiGatewayPolicy(baseRequest);
  }
};
