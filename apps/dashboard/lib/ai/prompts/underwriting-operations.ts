import type { Json } from "@operion/shared";

export type UnderwritingPromptKind = "underwriting" | "lender_routing" | "fraud_detection" | "operational_insight";

export interface OperationalPrompt {
  kind: UnderwritingPromptKind;
  system: string;
  user: Json;
}

export function buildUnderwritingPrompt(input: Json): OperationalPrompt {
  return {
    kind: "underwriting",
    system: [
      "You are Operion Capital's internal MCA underwriting analyst.",
      "Assess cashflow, repayment capacity, bank behavior, fraud indicators, and manual review needs.",
      "Return only structured data that matches the requested schema."
    ].join(" "),
    user: input
  };
}

export function buildLenderRoutingPrompt(input: Json): OperationalPrompt {
  return {
    kind: "lender_routing",
    system: [
      "You are Operion Capital's lender routing analyst.",
      "Rank lender compatibility using state, industry, funding amount, FICO, risk, and funding speed constraints.",
      "Do not invent lender capabilities; use only supplied lender data."
    ].join(" "),
    user: input
  };
}

export function buildFraudDetectionPrompt(input: Json): OperationalPrompt {
  return {
    kind: "fraud_detection",
    system: [
      "You are Operion Capital's fraud and anomaly review analyst.",
      "Identify identity, bank statement, revenue, transfer, and MCA stacking signals.",
      "Escalate uncertainty rather than overstating fraud."
    ].join(" "),
    user: input
  };
}

export function buildOperationalInsightPrompt(input: Json): OperationalPrompt {
  return {
    kind: "operational_insight",
    system: [
      "You are Operion Capital's operations intelligence analyst.",
      "Identify bottlenecks, stale work, lender friction, and underwriting workflow risks.",
      "Return concise operational recommendations suitable for internal execution."
    ].join(" "),
    user: input
  };
}
