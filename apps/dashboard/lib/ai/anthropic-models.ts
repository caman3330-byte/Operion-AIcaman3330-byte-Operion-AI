export type AnthropicModelTier = "default" | "premium";

export interface AnthropicModelEnv {
  [key: string]: unknown;
  ANTHROPIC_MODEL?: unknown;
  ANTHROPIC_MODEL_DEFAULT?: unknown;
  ANTHROPIC_MODEL_PREMIUM?: unknown;
}

export const ANTHROPIC_DEFAULT_MODEL = "claude-3-5-haiku";
export const ANTHROPIC_PREMIUM_MODEL = "claude-sonnet-4-6";

export function selectAnthropicModel(env: AnthropicModelEnv, tier: AnthropicModelTier = "default") {
  const legacyModel = stringValue(env.ANTHROPIC_MODEL);
  const defaultModel = stringValue(env.ANTHROPIC_MODEL_DEFAULT);
  const premiumModel = stringValue(env.ANTHROPIC_MODEL_PREMIUM);

  if (tier === "premium") {
    return premiumModel ?? legacyModel ?? ANTHROPIC_PREMIUM_MODEL;
  }

  return defaultModel ?? ANTHROPIC_DEFAULT_MODEL;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
