import type { Json } from "@operion/shared";
import type { AiProvider, AiWorkflowName, AiWorkflowResult } from "./types";
import {
  generateExecutiveSummary,
  analyzeFundingFit,
  reasonAboutLenderMatching
} from "./workflows/claude-workflows";
import {
  extractLeadFromText,
  generateCrmActivity,
  generateLenderRecommendations,
  generateOutreachDraft,
  generateUnderwritingSummary
} from "./workflows/openai-workflows";

export interface RouteAiWorkflowInput {
  workflow: AiWorkflowName;
  input: Json;
  preferredProvider?: AiProvider;
}

export async function routeAiWorkflow(request: RouteAiWorkflowInput): Promise<AiWorkflowResult<unknown>> {
  if (request.preferredProvider === "claude") {
    return routeClaudeWorkflow(request.workflow, request.input);
  }

  if (request.preferredProvider === "openai") {
    return routeOpenAiWorkflow(request.workflow, request.input);
  }

  if (["funding_fit_analysis", "executive_summary"].includes(request.workflow)) {
    return routeClaudeWorkflow(request.workflow, request.input);
  }

  return routeOpenAiWorkflow(request.workflow, request.input);
}

function routeOpenAiWorkflow(workflow: AiWorkflowName, input: Json) {
  switch (workflow) {
    case "lead_extraction":
      return extractLeadFromText(input);
    case "underwriting_summary":
      return generateUnderwritingSummary(input);
    case "lender_recommendation":
      return generateLenderRecommendations(input);
    case "outreach_generation":
      return generateOutreachDraft(input);
    case "crm_activity_generation":
    case "customer_support":
      return generateCrmActivity(input);
    default:
      return generateUnderwritingSummary(input);
  }
}

function routeClaudeWorkflow(workflow: AiWorkflowName, input: Json) {
  switch (workflow) {
    case "lender_recommendation":
      return reasonAboutLenderMatching(input);
    case "executive_summary":
      return generateExecutiveSummary(input);
    case "funding_fit_analysis":
    case "underwriting_summary":
    default:
      return analyzeFundingFit(input);
  }
}

export function workflowForTaskType(taskType: string): AiWorkflowName {
  switch (taskType) {
    case "lead_extraction":
      return "lead_extraction";
    case "lead_qualification":
      return "funding_fit_analysis";
    case "underwriting_summary":
      return "underwriting_summary";
    case "lender_recommendation":
      return "lender_recommendation";
    case "outreach_preparation":
      return "outreach_generation";
    case "crm_activity":
      return "crm_activity_generation";
    case "customer_support":
      return "customer_support";
    case "executive_summary":
    case "reporting":
      return "executive_summary";
    default:
      return "underwriting_summary";
  }
}
