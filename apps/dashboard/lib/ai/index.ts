// OpenAI Client
export { getOpenAIClient, OpenAIProductionClient } from './openai-client';
export type { AIExecutionMetrics } from './openai-client';

// Types and Config
export {
  UnderwritingSummarySchema,
  RiskAnalysisSchema,
  LeadQualificationSchema,
  LenderMatchSchema,
  OperationalInsightSchema,
  BankingPatternsSchema,
  AIModelConfig,
} from './types';

export type {
  UnderwritingSummary,
  RiskAnalysis,
  LeadQualification,
  LenderMatch,
  OperationalInsight,
  BankingPatterns,
  AIActionLog,
  AiProvider,
  AiWorkflowName,
  AiUsage,
  AiWorkflowResult,
  StructuredOutputRequest,
  AiTaskDispatchInput,
} from './types';

// Services
export { generateUnderwritingSummary, analyzeRevenueStability, estimateApprovalProbability } from './underwriting-service';

export { analyzeMerchantRisk, detectFraudSignals, classifyNSFRisk } from './risk-service';

export { classifyLeadQuality, calculateTierFromScore, calculateUrgencyFromFactors } from './lead-service';

export { generateLenderMatches, calculateLenderCompatibility } from './lender-service';

export { generateOperationalInsights, summarizeBankingPatterns } from './insights-service';
