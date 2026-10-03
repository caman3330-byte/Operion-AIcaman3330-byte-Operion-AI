import type { AiGatewayPolicyDecision, AiGatewayRequest, AiToolPermission } from "./types";

const blockedBusinessActionTools: AiToolPermission[] = [
  "send_email",
  "crm_mutation",
  "lender_submission",
  "underwriting_decision"
];

export function evaluateAiGatewayPolicy(request: AiGatewayRequest): AiGatewayPolicyDecision {
  return {
    permissionLevel: "REQUIRES_APPROVAL",
    allowed: true,
    approvalRequired: true,
    blockedTools: blockedBusinessActionTools,
    reason: `AI gateway ${request.operation} is read-only in Phase 1. Business actions require founder approval.`
  };
}

export function createToolCallingFoundation() {
  return {
    enabled: false,
    policyEngine: "operion_ai_policy_engine",
    defaultPermissionLevel: "REQUIRES_APPROVAL" as const,
    blockedTools: blockedBusinessActionTools,
    note: "Tool calling is modeled but no email, CRM, lender, or underwriting execution tools are exposed in Phase 1."
  };
}
