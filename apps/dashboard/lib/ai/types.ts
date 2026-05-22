import type { AiTaskType, Json } from "@operion/shared";
import { z } from "zod";

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

// Production AI Schemas

export const UnderwritingSummarySchema = z.object({
  qualificationScore: z.number().min(0).max(100),
  overallRiskLevel: z.enum(['low', 'medium', 'high', 'very_high']),
  approvalProbability: z.number().min(0).max(1),
  estimatedFundingAmount: z.number().positive(),
  recommendedLenderTypes: z.array(z.string()),
  keyStrengths: z.array(z.string()),
  keyRisks: z.array(z.string()),
  recommendedApproach: z.string(),
  needsManualReview: z.boolean(),
  summary: z.string(),
});

export type UnderwritingSummary = z.infer<typeof UnderwritingSummarySchema>;

export const RiskAnalysisSchema = z.object({
  riskScore: z.number().min(0).max(100),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  fraudIndicators: z.array(z.string()),
  businessHealthIndicators: z.array(z.string()),
  financialStability: z.enum(['stable', 'declining', 'unstable']),
  depositPatterns: z.enum(['normal', 'irregular', 'concerning']),
  nsfFrequency: z.enum(['none', 'occasional', 'frequent']),
  estimatedMonthlyVolume: z.number(),
  riskFactors: z.array(z.string()),
  mitigatingFactors: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export type RiskAnalysis = z.infer<typeof RiskAnalysisSchema>;

export const LeadQualificationSchema = z.object({
  qualityScore: z.number().min(0).max(100),
  tier: z.enum(['A', 'B', 'C', 'D']),
  recommendedAction: z.enum(['immediate', 'follow_up', 'nurture', 'pass']),
  estimatedClosingProbability: z.number().min(0).max(1),
  urgencyLevel: z.enum(['high', 'medium', 'low']),
  nextSteps: z.array(z.string()),
  followUpTiming: z.string().nullable(),
  estimatedDealSize: z.number().positive(),
  industryRisk: z.enum(['low', 'medium', 'high']),
  competitiveThreats: z.array(z.string()),
});

export type LeadQualification = z.infer<typeof LeadQualificationSchema>;

export const LenderMatchSchema = z.object({
  lenderId: z.string().uuid(),
  matchScore: z.number().min(0).max(100),
  stateCompatibility: z.boolean(),
  industryCompatibility: z.boolean(),
  fundingLimitMet: z.boolean(),
  ficoMinimumMet: z.boolean(),
  positionCompatibility: z.boolean(),
  estimatedApprovalProbability: z.number().min(0).max(1),
  keyCompatibilities: z.array(z.string()),
  potentialIssues: z.array(z.string()),
  recommendedTerms: z.object({
    estimatedRate: z.number(),
    estimatedTerm: z.number(),
    estimatedMonthlyPayment: z.number(),
  }).nullable(),
});

export type LenderMatch = z.infer<typeof LenderMatchSchema>;

export const OperationalInsightSchema = z.object({
  insightType: z.enum([
    'underwriting_bottleneck',
    'lender_performance',
    'fraud_pattern',
    'market_opportunity',
    'process_improvement',
    'risk_concentration',
  ]),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  description: z.string(),
  dataPoints: z.array(z.string()),
  recommendedAction: z.string(),
  estimatedImpact: z.string(),
  affectedMetrics: z.array(z.string()),
});

export type OperationalInsight = z.infer<typeof OperationalInsightSchema>;

export const BankingPatternsSchema = z.object({
  averageDailyDeposit: z.number(),
  depositVolatility: z.enum(['low', 'medium', 'high']),
  largestDepositDay: z.number(),
  smallestDepositDay: z.number(),
  frequentTransferSizes: z.array(z.number()),
  unusualActivity: z.array(z.string()),
  businessCyclePattern: z.string(),
  estimatedAnnualVolume: z.number(),
  healthAssessment: z.string(),
  riskFlags: z.array(z.string()),
});

export type BankingPatterns = z.infer<typeof BankingPatternsSchema>;

export interface AIActionLog {
  id?: string;
  modelUsed: string;
  executionLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  failureReason?: string;
  retryCount: number;
  confidenceScore: number;
  promptType: string;
  workflowSource: string;
  merchantId?: string;
  dealId?: string;
  metadata: Record<string, any>;
}

export const AIModelConfig = {
  underwriting: {
    model: 'gpt-4o',
    temperature: 0.3,
    maxTokens: 2000,
  },
  riskAnalysis: {
    model: 'gpt-4o',
    temperature: 0.2,
    maxTokens: 2000,
  },
  leadQualification: {
    model: 'gpt-4o',
    temperature: 0.3,
    maxTokens: 1500,
  },
  lenderMatching: {
    model: 'gpt-4o',
    temperature: 0.2,
    maxTokens: 2000,
  },
  operationalInsights: {
    model: 'gpt-4o',
    temperature: 0.4,
    maxTokens: 2000,
  },
  bankingPatterns: {
    model: 'gpt-4o',
    temperature: 0.2,
    maxTokens: 1500,
  },
};
