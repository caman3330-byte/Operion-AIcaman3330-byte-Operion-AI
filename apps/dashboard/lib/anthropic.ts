import type { Lead, LeadTier, QualificationResult } from "@operion/shared";
import { ConfigurationError, ValidationError } from "@/lib/errors";
import { readServerEnv } from "@/lib/env";
import { estimateAnthropicCost, recordApiUsage } from "@/lib/api-usage";
import { selectAnthropicModel } from "@/lib/ai/anthropic-models";
import { logger } from "@/lib/logger";
import { promptVersionsRepository } from "@/lib/repositories/prompt-versions";
import { withRetry } from "@/lib/retry";

interface QualifyLeadOptions {
  promptVersionId?: string | undefined;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export async function qualifyLead(lead: Lead, options: QualifyLeadOptions = {}): Promise<QualificationResult> {
  const env = readServerEnv();
  if (!env.ANTHROPIC_API_KEY) {
    throw new ConfigurationError("ANTHROPIC_API_KEY is required to qualify leads");
  }

  const promptVersion = options.promptVersionId
    ? (await promptVersionsRepository.list()).find((version) => version.id === options.promptVersionId)
    : await promptVersionsRepository.getActive();

  if (!promptVersion) {
    throw new ValidationError("Prompt version not found");
  }

  const startedAt = Date.now();
  const model = selectAnthropicModel(env, "default");
  const leadJson = JSON.stringify({
    business_name: lead.business_name,
    industry: lead.industry,
    state: lead.state,
    annual_revenue_est: lead.annual_revenue_est,
    time_in_business_years: lead.time_in_business_years,
    contact_completeness: Boolean(lead.contact_name && lead.email && lead.phone)
  });

  try {
    const result = await withRetry(
      async () => {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY as string,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model,
            max_tokens: 500,
            temperature: 0,
            system: promptVersion.system_prompt,
            messages: [
              {
                role: "user",
                content: promptVersion.user_prompt_template.replace("{{lead_json}}", leadJson)
              }
            ]
          })
        });

        if (!response.ok) {
          throw new Error(`Anthropic request failed with ${response.status}`);
        }

        return (await response.json()) as AnthropicResponse;
      },
      { operation: "anthropic.qualifyLead" }
    );

    const text = result.content?.find((content) => content.type === "text")?.text;
    if (!text) {
      throw new ValidationError("Anthropic response did not include text content");
    }

    const parsed = parseQualification(text);
    const inputTokens = result.usage?.input_tokens ?? 0;
    const outputTokens = result.usage?.output_tokens ?? 0;
    const latencyMs = Date.now() - startedAt;

    await recordApiUsage({
      service: "anthropic",
      operation: "qualify_lead",
      leadId: lead.id,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateAnthropicCost(inputTokens, outputTokens),
      success: true,
      latencyMs
    });

    return {
      ...parsed,
      promptVersionId: promptVersion.id,
      latencyMs,
      inputTokens,
      outputTokens
    };
  } catch (error) {
    logger.error("anthropic_qualification_failed", { leadId: lead.id, error });
    await recordApiUsage({
      service: "anthropic",
      operation: "qualify_lead",
      leadId: lead.id,
      success: false,
      latencyMs: Date.now() - startedAt
    });
    throw error;
  }
}

function parseQualification(text: string): Pick<QualificationResult, "score" | "tier" | "reason"> {
  const parsed = JSON.parse(text) as { score?: unknown; tier?: unknown; reason?: unknown };
  const score = Number(parsed.score);

  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new ValidationError("Qualification score must be between 0 and 100", parsed);
  }

  if (!["A", "B", "C", "D"].includes(String(parsed.tier))) {
    throw new ValidationError("Qualification tier must be A, B, C, or D", parsed);
  }

  if (typeof parsed.reason !== "string" || parsed.reason.length === 0) {
    throw new ValidationError("Qualification reason is required", parsed);
  }

  return {
    score: Math.round(score),
    tier: parsed.tier as LeadTier,
    reason: parsed.reason
  };
}
