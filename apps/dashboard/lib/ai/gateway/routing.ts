import type { AiGatewayTaskType, OperionAiProvider } from "./types";

const routes: Record<AiGatewayTaskType, OperionAiProvider[]> = {
  FAST_CLASSIFICATION: ["groq", "nvidia", "openai", "anthropic"],
  REASONING: ["nvidia", "anthropic", "openai"],
  GENERAL: ["nvidia", "openai", "anthropic"],
  RESEARCH: ["google", "openrouter", "openai"],
  EXTRACTION: ["openai", "nvidia", "anthropic"],
  PLANNING: ["anthropic", "openai", "nvidia"]
};

export function routeProvidersForTask(taskType: AiGatewayTaskType, explicitProviders?: OperionAiProvider[]) {
  return explicitProviders && explicitProviders.length > 0 ? explicitProviders : routes[taskType];
}

export function getAiGatewayRoutingPlan() {
  return routes;
}
