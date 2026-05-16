import type { ApiService } from "@operion/shared";
import { apiUsageRepository } from "@/lib/repositories/api-usage";

interface RecordApiUsageInput {
  service: ApiService;
  operation: string;
  leadId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostUsd?: number | null;
  success: boolean;
  latencyMs?: number | null;
}

export async function recordApiUsage(input: RecordApiUsageInput) {
  return apiUsageRepository.create({
    service: input.service,
    operation: input.operation,
    lead_id: input.leadId ?? null,
    input_tokens: input.inputTokens ?? null,
    output_tokens: input.outputTokens ?? null,
    estimated_cost_usd: input.estimatedCostUsd ?? null,
    success: input.success,
    latency_ms: input.latencyMs ?? null
  });
}

export function estimateAnthropicCost(inputTokens: number, outputTokens: number) {
  const inputRate = Number(process.env.ANTHROPIC_COST_PER_1K_INPUT_TOKENS ?? 0.003);
  const outputRate = Number(process.env.ANTHROPIC_COST_PER_1K_OUTPUT_TOKENS ?? 0.015);
  return (inputTokens / 1000) * inputRate + (outputTokens / 1000) * outputRate;
}
