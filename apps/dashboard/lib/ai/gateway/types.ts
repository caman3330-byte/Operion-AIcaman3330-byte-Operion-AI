import type { Json } from "@operion/shared";
import type { z } from "zod";

export const operionAiProviders = ["nvidia", "groq", "google", "openrouter", "openai", "anthropic"] as const;
export type OperionAiProvider = typeof operionAiProviders[number];

export type AiGatewayTaskType = "FAST_CLASSIFICATION" | "REASONING" | "GENERAL" | "RESEARCH" | "EXTRACTION" | "PLANNING";
export type AiGatewayCapability = "generate" | "classify" | "extract" | "reason" | "plan" | "structured_json";
export type AiProviderConfigurationStatus = "configured" | "not_configured";
export type AiProviderHealthStatus = "not_configured" | "healthy" | "unhealthy" | "rate_limited" | "error";
export type AiPermissionLevel = "OBSERVE" | "ASSIST" | "AUTOMATE" | "REQUIRES_APPROVAL";
export type AiToolPermission = "send_email" | "crm_mutation" | "lender_submission" | "underwriting_decision";

export interface AiProviderStatus {
  provider: OperionAiProvider;
  configured: AiProviderConfigurationStatus;
  health: AiProviderHealthStatus;
  lastChecked: string | null;
  model: string | null;
  errorCategory: string | null;
}

export interface AiGatewayUsage {
  provider: OperionAiProvider;
  model: string;
  taskType: AiGatewayTaskType;
  timestamp: string;
  success: boolean;
  failure: boolean;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  primaryProvider?: OperionAiProvider | null;
  fallbackProvider?: OperionAiProvider | null;
  fallbackReason?: string | null;
}

export interface AiGatewayRequest<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  operation: string;
  taskType: AiGatewayTaskType;
  capability: AiGatewayCapability;
  system: string;
  user: Json;
  zodSchema?: TSchema;
  jsonSchema?: Record<string, unknown>;
  schemaName?: string;
  preferredProviders?: OperionAiProvider[];
  sensitive?: boolean;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  metadata?: Json;
}

export interface AiGatewayResult<TData = unknown> {
  data: TData;
  provider: OperionAiProvider;
  model: string;
  usage: AiGatewayUsage;
  raw: Json;
  fallback: {
    primaryProvider: OperionAiProvider;
    fallbackProvider: OperionAiProvider | null;
    reason: string | null;
  };
}

export interface AiProviderAdapter {
  provider: OperionAiProvider;
  getStatus(): AiProviderStatus;
  healthCheck?(): Promise<AiProviderStatus>;
  generateStructured<TSchema extends z.ZodTypeAny>(request: AiGatewayRequest<TSchema>): Promise<AiGatewayResult<z.infer<TSchema>>>;
}

export interface AiGatewayPolicyDecision {
  permissionLevel: AiPermissionLevel;
  allowed: boolean;
  approvalRequired: boolean;
  blockedTools: AiToolPermission[];
  reason: string;
}
