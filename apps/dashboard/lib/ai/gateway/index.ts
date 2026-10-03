import { z } from "zod";
import { logger } from "@/lib/logger";
import { canFailoverAiProvider, categorizeAiProviderError } from "./errors";
import { evaluateAiGatewayPolicy, createToolCallingFoundation } from "./policy";
import { createProviderAdapters } from "./adapters";
import { getAiGatewayRoutingPlan, routeProvidersForTask } from "./routing";
import type { AiGatewayRequest, AiGatewayResult, AiProviderAdapter, AiProviderStatus, OperionAiProvider } from "./types";

export class OperionAiGateway {
  constructor(private readonly adapters: Record<OperionAiProvider, AiProviderAdapter> = createProviderAdapters()) {}

  async generateStructured<TSchema extends z.ZodTypeAny>(request: AiGatewayRequest<TSchema>): Promise<AiGatewayResult<z.infer<TSchema>>> {
    const policy = evaluateAiGatewayPolicy(request);
    if (!policy.allowed) {
      throw new Error(policy.reason);
    }

    const providers = routeProvidersForTask(request.taskType, request.preferredProviders);
    const configuredProviders = providers.filter((provider) => this.adapters[provider].getStatus().configured === "configured");
    if (configuredProviders.length === 0) {
      const first = providers[0] ?? "openai";
      throw new Error(`No configured AI provider is available for ${request.taskType}. First planned provider: ${first}`);
    }

    const primaryProvider = configuredProviders[0];
    if (!primaryProvider) {
      throw new Error(`No configured AI provider is available for ${request.taskType}`);
    }
    let lastError: unknown = null;
    for (const provider of configuredProviders) {
      if (provider !== primaryProvider && request.sensitive && materiallyDifferentProvider(primaryProvider, provider)) {
        logger.warn("ai_gateway_sensitive_failover_blocked", { operation: request.operation, primaryProvider, provider });
        break;
      }

      try {
        const result = await this.adapters[provider].generateStructured(request);
        if (provider !== primaryProvider) {
          result.fallback.primaryProvider = primaryProvider;
          result.fallback.fallbackProvider = provider;
          result.fallback.reason = categorizeAiProviderError(lastError);
          result.usage.primaryProvider = primaryProvider;
          result.usage.fallbackProvider = provider;
          result.usage.fallbackReason = result.fallback.reason;
        }
        return result;
      } catch (error) {
        lastError = error;
        logger.warn("ai_gateway_provider_failed", {
          operation: request.operation,
          provider,
          errorCategory: categorizeAiProviderError(error)
        });
        if (!canFailoverAiProvider(error)) break;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("AI gateway request failed");
  }

  generate<TSchema extends z.ZodTypeAny>(request: Omit<AiGatewayRequest<TSchema>, "capability">) {
    return this.generateStructured({ ...request, capability: "generate" });
  }

  classify<TSchema extends z.ZodTypeAny>(request: Omit<AiGatewayRequest<TSchema>, "capability" | "taskType">) {
    return this.generateStructured({ ...request, capability: "classify", taskType: "FAST_CLASSIFICATION" });
  }

  extract<TSchema extends z.ZodTypeAny>(request: Omit<AiGatewayRequest<TSchema>, "capability" | "taskType">) {
    return this.generateStructured({ ...request, capability: "extract", taskType: "EXTRACTION" });
  }

  reason<TSchema extends z.ZodTypeAny>(request: Omit<AiGatewayRequest<TSchema>, "capability" | "taskType">) {
    return this.generateStructured({ ...request, capability: "reason", taskType: "REASONING" });
  }

  plan<TSchema extends z.ZodTypeAny>(request: Omit<AiGatewayRequest<TSchema>, "capability" | "taskType">) {
    return this.generateStructured({ ...request, capability: "plan", taskType: "PLANNING" });
  }

  getProviderStatuses(): AiProviderStatus[] {
    return Object.values(this.adapters).map((adapter) => adapter.getStatus());
  }

  async checkProviderHealth(): Promise<AiProviderStatus[]> {
    return Promise.all(Object.values(this.adapters).map((adapter) => adapter.healthCheck ? adapter.healthCheck() : Promise.resolve(adapter.getStatus())));
  }

  getRoutingPlan() {
    return getAiGatewayRoutingPlan();
  }

  getPolicyFoundation() {
    return {
      defaultDecision: evaluateAiGatewayPolicy({
        operation: "policy_foundation",
        taskType: "GENERAL",
        capability: "generate",
        system: "",
        user: {}
      }),
      toolCalling: createToolCallingFoundation()
    };
  }
}

function materiallyDifferentProvider(primary: OperionAiProvider, fallback: OperionAiProvider) {
  if (primary === fallback) return false;
  const reasoningProviders: OperionAiProvider[] = ["anthropic", "openai", "nvidia"];
  return !(reasoningProviders.includes(primary) && reasoningProviders.includes(fallback));
}

export const operionAi = new OperionAiGateway();
export { getAiGatewayRoutingPlan } from "./routing";
export { evaluateAiGatewayPolicy, createToolCallingFoundation } from "./policy";
export type {
  AiGatewayCapability,
  AiGatewayRequest,
  AiGatewayResult,
  AiGatewayTaskType,
  AiPermissionLevel,
  AiProviderAdapter,
  AiProviderHealthStatus,
  AiProviderStatus,
  OperionAiProvider
} from "./types";
