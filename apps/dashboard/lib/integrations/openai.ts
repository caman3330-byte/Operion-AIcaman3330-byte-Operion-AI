import { z } from "zod";
import { ConfigurationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { safeIntegrationCall } from "@/lib/runtime/integration-guards";
import { calculateFallbackQualification, FallbackQualificationInput } from "@/lib/underwriting/fallback";

export interface OpenAiQualificationInput {
  businessName: string;
  industry: string;
  requestedAmount: number;
  monthlyDeposits: number;
  creditScoreRange: string;
  annualRevenue?: number | null;
  monthlyRevenue?: number | null;
  fundingPurpose?: string | null;
  state?: string | null;
  businessApplicationId?: string | null;
  leadId?: string | null;
}

export interface OpenAiQualificationResult {
  score: number;
  tier: "A" | "B" | "C" | "D";
  decision: "qualified" | "needs_review" | "declined";
  reason: string;
  industry_risk: "low" | "medium" | "high";
  funding_fit: "strong" | "moderate" | "weak";
  underwriting_summary: string;
  internal_notes: string;
  lender_recommendations: string[];
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  model: string;
  estimatedCostUsd: number;
}

const qualificationResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  tier: z.enum(["A", "B", "C", "D"]),
  decision: z.enum(["qualified", "needs_review", "declined"]),
  reason: z.string().min(1),
  industry_risk: z.enum(["low", "medium", "high"]),
  funding_fit: z.enum(["strong", "moderate", "weak"]),
  underwriting_summary: z.string().min(1),
  internal_notes: z.string().min(1),
  lender_recommendations: z.array(z.string()).max(8)
});

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      refusal?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

export async function qualifyApplicationWithOpenAi(input: OpenAiQualificationInput): Promise<OpenAiQualificationResult> {
  const fallback = createOpenAiFallback(input);
  const result = await safeIntegrationCall<OpenAiQualificationResult>(
    "openai",
    async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new ConfigurationError("OPENAI_API_KEY is required before live AI qualification is enabled");
      }

      const primaryModel = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
      const fallbackModel = process.env.OPENAI_FALLBACK_MODEL ?? null;

      async function callModel(modelToUse: string) {
        const startedAt = Date.now();
        const response = await withRetry(() =>
          fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              authorization: `Bearer ${apiKey}`,
              "content-type": "application/json"
            },
            body: JSON.stringify({
              model: modelToUse,
              temperature: 0.15,
              messages: [
                {
                  role: "system",
                  content:
                    "You are Operion Capital's MCA funding qualification analyst. Return only JSON that matches the schema. Evaluate business funding fit conservatively, highlight risk, and do not fabricate unavailable data."
                },
                {
                  role: "user",
                  content: JSON.stringify({
                    business_name: input.businessName,
                    industry: input.industry,
                    state: input.state,
                    requested_amount: input.requestedAmount,
                    monthly_deposits: input.monthlyDeposits,
                    monthly_revenue: input.monthlyRevenue,
                    annual_revenue: input.annualRevenue,
                    credit_score_range: input.creditScoreRange,
                    funding_purpose: input.fundingPurpose,
                    lead_id: input.leadId,
                    business_application_id: input.businessApplicationId
                  })
                }
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "operion_lead_qualification",
                  strict: true,
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      score: { type: "integer", minimum: 0, maximum: 100 },
                      tier: { type: "string", enum: ["A", "B", "C", "D"] },
                      decision: { type: "string", enum: ["qualified", "needs_review", "declined"] },
                      reason: { type: "string" },
                      industry_risk: { type: "string", enum: ["low", "medium", "high"] },
                      funding_fit: { type: "string", enum: ["strong", "moderate", "weak"] },
                      underwriting_summary: { type: "string" },
                      internal_notes: { type: "string" },
                      lender_recommendations: {
                        type: "array",
                        items: { type: "string" }
                      }
                    },
                    required: [
                      "score",
                      "tier",
                      "decision",
                      "reason",
                      "industry_risk",
                      "funding_fit",
                      "underwriting_summary",
                      "internal_notes",
                      "lender_recommendations"
                    ]
                  }
                }
              }
            })
          })
        );
        const latencyMs = Date.now() - startedAt;
        const body = (await response.json()) as OpenAiChatResponse & { error?: { message?: string } };
        return { response, body, latencyMs, model: modelToUse } as const;
      }

      let callResult;
      try {
        callResult = await callModel(primaryModel);
      } catch (err) {
        logger.warn("openai_primary_model_failed", { error: err instanceof Error ? err.message : String(err), model: primaryModel });
        if (fallbackModel && fallbackModel !== primaryModel) {
          try {
            callResult = await callModel(fallbackModel);
            logger.info("openai_fallback_model_used", { model: fallbackModel });
          } catch (err2) {
            throw new ConfigurationError(`OpenAI qualification failed for models ${primaryModel} and ${fallbackModel}`);
          }
        } else {
          throw new ConfigurationError(`OpenAI qualification failed for model ${primaryModel}`);
        }
      }

      const latencyMs = callResult.latencyMs;
      const body = callResult.body;
      const response = callResult.response;
      const model = callResult.model;
      if (!response.ok) {
        throw new ConfigurationError(body.error?.message ?? "OpenAI qualification request failed");
      }

      const message = body.choices?.[0]?.message;
      if (message?.refusal) {
        throw new ConfigurationError(`OpenAI refused qualification request: ${message.refusal}`);
      }

      const content = message?.content;
      if (!content) {
        throw new ConfigurationError("OpenAI qualification returned an empty response");
      }

      const parsed = qualificationResultSchema.parse(JSON.parse(content));
      const inputTokens = body.usage?.prompt_tokens ?? null;
      const outputTokens = body.usage?.completion_tokens ?? null;

      return {
        ...parsed,
        inputTokens,
        outputTokens,
        latencyMs,
        model,
        estimatedCostUsd: estimateOpenAiCost(inputTokens, outputTokens)
      };
    },
    {
      ...fallback,
      inputTokens: null,
      outputTokens: null,
      latencyMs: 0,
      model: "fallback",
      estimatedCostUsd: 0
    }
  );

  return result ?? fallback;
}

function createOpenAiFallback(input: OpenAiQualificationInput) {
  const fallbackData = calculateFallbackQualification({
    businessName: input.businessName,
    industry: input.industry,
    requestedAmount: input.requestedAmount,
    monthlyDeposits: input.monthlyDeposits,
    creditScoreRange: input.creditScoreRange,
    annualRevenue: input.annualRevenue,
    monthlyRevenue: input.monthlyRevenue,
    fundingPurpose: input.fundingPurpose,
    businessApplicationId: input.businessApplicationId,
    leadId: input.leadId
  });

  return {
    ...fallbackData,
    inputTokens: null,
    outputTokens: null,
    latencyMs: 0,
    model: "fallback",
    estimatedCostUsd: 0
  };
}

async function withRetry(operation: () => Promise<Response>, attempts = 3) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await operation();
      if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === attempts) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
    }

    await wait(350 * attempt);
  }

  logger.error("openai_qualification_retry_exhausted", { error: lastError });
  throw lastError instanceof Error ? lastError : new ConfigurationError("OpenAI qualification retry failed");
}

function estimateOpenAiCost(inputTokens: number | null, outputTokens: number | null) {
  if (inputTokens === null && outputTokens === null) {
    return 0;
  }

  const inputCostPer1K = Number(process.env.OPENAI_COST_PER_1K_INPUT_TOKENS ?? 0);
  const outputCostPer1K = Number(process.env.OPENAI_COST_PER_1K_OUTPUT_TOKENS ?? 0);
  return ((inputTokens ?? 0) / 1000) * inputCostPer1K + ((outputTokens ?? 0) / 1000) * outputCostPer1K;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
