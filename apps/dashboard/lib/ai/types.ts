import type { AiTaskType, Json } from "@operion/shared";
import type { z } from "zod";

export type AiProvider = "openai" | "claude";

export type AiWorkflowName =
  | "lead_extraction"
  | "underwriting_summary"
  | "lender_recommendation"
  | "outreach_generation"
  | "crm_activity_generation"
  | "customer_support"
  | "executive_summary"
  | "funding_fit_analysis";

export interface AiUsage {
  provider: AiProvider;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  estimatedCostUsd: number;
}

export interface AiWorkflowResult<T> {
  workflow: AiWorkflowName;
  provider: AiProvider;
  data: T;
  usage: AiUsage;
  raw?: Json;
}

export interface StructuredOutputRequest<TSchema extends z.ZodTypeAny> {
  operation: string;
  schemaName: string;
  system: string;
  user: Json;
  jsonSchema: Record<string, unknown>;
  zodSchema: TSchema;
  model?: string;
  temperature?: number;
  metadata?: Json;
}

export interface AiTaskDispatchInput {
  workerId: string;
  limit: number;
  taskTypes?: AiTaskType[];
}
