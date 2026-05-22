import { z } from "zod";

export const AiUnderwritingOutputSchema = z.object({
  qualificationScore: z.number().int().min(0).max(100),
  riskTier: z.enum(["low", "medium", "high", "critical"]),
  approvalProbability: z.number().min(0).max(1),
  recommendedFundingAmount: z.number().nonnegative(),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
  missingDocuments: z.array(z.string()),
  manualReviewRequired: z.boolean(),
  summary: z.string(),
  confidence: z.number().min(0).max(1)
});

export const AiLenderRoutingOutputSchema = z.object({
  matches: z.array(z.object({
    lenderId: z.string().nullable(),
    lenderName: z.string(),
    compatibilityScore: z.number().int().min(0).max(100),
    rationale: z.string(),
    restrictions: z.array(z.string())
  })),
  routingConfidence: z.number().min(0).max(1),
  requiresApproval: z.boolean()
});

export const AiFraudDetectionOutputSchema = z.object({
  fraudRisk: z.enum(["low", "medium", "high", "critical"]),
  indicators: z.array(z.string()),
  recommendedActions: z.array(z.string()),
  confidence: z.number().min(0).max(1)
});

export const AiOperationalInsightOutputSchema = z.object({
  priority: z.enum(["low", "medium", "high", "critical"]),
  insight: z.string(),
  affectedWorkflow: z.string(),
  recommendedAction: z.string(),
  confidence: z.number().min(0).max(1)
});

export type AiUnderwritingOutput = z.infer<typeof AiUnderwritingOutputSchema>;
export type AiLenderRoutingOutput = z.infer<typeof AiLenderRoutingOutputSchema>;
export type AiFraudDetectionOutput = z.infer<typeof AiFraudDetectionOutputSchema>;
export type AiOperationalInsightOutput = z.infer<typeof AiOperationalInsightOutputSchema>;
