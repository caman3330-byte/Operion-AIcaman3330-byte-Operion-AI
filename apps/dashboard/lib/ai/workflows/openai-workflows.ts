import type { Json } from "@operion/shared";
import { runOpenAiStructuredOutput } from "@/lib/ai/openai";
import { openAiStructuredSystemPrompt } from "@/lib/ai/prompts/operion-prompts";
import type { AiWorkflowResult } from "@/lib/ai/types";
import {
  crmActivityJsonSchema,
  crmActivitySchema,
  leadExtractionJsonSchema,
  leadExtractionSchema,
  lenderRecommendationsJsonSchema,
  lenderRecommendationsSchema,
  outreachGenerationJsonSchema,
  outreachGenerationSchema,
  underwritingSummaryJsonSchema,
  underwritingSummarySchema
} from "./structured-schemas";

export async function extractLeadFromText(input: Json): Promise<AiWorkflowResult<unknown>> {
  const result = await runOpenAiStructuredOutput({
    operation: "lead_extraction",
    schemaName: "operion_lead_extraction",
    system: `${openAiStructuredSystemPrompt} Extract MCA/business funding lead fields from unstructured intake text.`,
    user: input,
    jsonSchema: leadExtractionJsonSchema,
    zodSchema: leadExtractionSchema
  });

  return wrap("lead_extraction", result);
}

export async function generateUnderwritingSummary(input: Json): Promise<AiWorkflowResult<unknown>> {
  const result = await runOpenAiStructuredOutput({
    operation: "underwriting_summary",
    schemaName: "operion_underwriting_summary",
    system: `${openAiStructuredSystemPrompt} Create an internal underwriting summary for MCA/business funding review.`,
    user: input,
    jsonSchema: underwritingSummaryJsonSchema,
    zodSchema: underwritingSummarySchema
  });

  return wrap("underwriting_summary", result);
}

export async function generateLenderRecommendations(input: Json): Promise<AiWorkflowResult<unknown>> {
  const result = await runOpenAiStructuredOutput({
    operation: "lender_recommendation",
    schemaName: "operion_lender_recommendations",
    system: `${openAiStructuredSystemPrompt} Recommend lender routing options based only on provided lender criteria and lead data.`,
    user: input,
    jsonSchema: lenderRecommendationsJsonSchema,
    zodSchema: lenderRecommendationsSchema
  });

  return wrap("lender_recommendation", result);
}

export async function generateOutreachDraft(input: Json): Promise<AiWorkflowResult<unknown>> {
  const result = await runOpenAiStructuredOutput({
    operation: "outreach_generation",
    schemaName: "operion_outreach_generation",
    system: `${openAiStructuredSystemPrompt} Draft compliant, professional customer outreach for business funding operations.`,
    user: input,
    jsonSchema: outreachGenerationJsonSchema,
    zodSchema: outreachGenerationSchema
  });

  return wrap("outreach_generation", result);
}

export async function generateCrmActivity(input: Json): Promise<AiWorkflowResult<unknown>> {
  const result = await runOpenAiStructuredOutput({
    operation: "crm_activity_generation",
    schemaName: "operion_crm_activity",
    system: `${openAiStructuredSystemPrompt} Convert the provided event or communication into a CRM activity record.`,
    user: input,
    jsonSchema: crmActivityJsonSchema,
    zodSchema: crmActivitySchema
  });

  return wrap("crm_activity_generation", result);
}

function wrap(workflow: AiWorkflowResult<unknown>["workflow"], result: Awaited<ReturnType<typeof runOpenAiStructuredOutput>>) {
  return {
    workflow,
    provider: "openai" as const,
    data: result.data,
    usage: result.usage,
    raw: result.raw as Json
  };
}
