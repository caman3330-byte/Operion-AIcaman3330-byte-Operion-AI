import { z } from "zod";

export const bankPeriodSchema = z.object({
  period: z.string().min(1),
  deposits: z.number().nonnegative(),
  withdrawals: z.number().nonnegative().optional(),
  nsfCount: z.number().int().nonnegative().optional(),
  averageDailyBalance: z.number().optional(),
  transferInCount: z.number().int().nonnegative().optional(),
  transferOutCount: z.number().int().nonnegative().optional()
});

export const merchantIntakeSchema = z.object({
  businessName: z.string().min(1),
  industry: z.string().min(1),
  state: z.string().min(2).max(2).optional(),
  websiteUrl: z.string().url().optional(),
  annualRevenue: z.number().nonnegative().optional(),
  monthlyRevenue: z.number().nonnegative().optional(),
  monthlyDeposits: z.number().positive(),
  requestedAmount: z.number().positive(),
  productType: z.enum(["mca", "business_loan", "line_of_credit", "equipment_financing", "unknown"]).optional(),
  creditScoreRange: z.enum(["under_550", "550_599", "600_649", "650_699", "700_plus", "unknown"]),
  ownerName: z.string().min(1),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(7),
  ownershipPercentage: z.number().min(0).max(100).optional(),
  bankName: z.string().optional(),
  averageDailyBalance: z.number().optional(),
  fundingPurpose: z.string().optional(),
  consentToContact: z.boolean(),
  requiredDocuments: z.array(z.object({
    documentType: z.string().min(1),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    fileSizeMB: z.number().positive()
  })).optional(),
  metadata: z.record(z.unknown()).optional()
});

export const underwritingExecutionSchema = z.object({
  businessApplicationId: z.string().uuid(),
  bankPeriods: z.array(bankPeriodSchema).optional(),
  lenderContext: z.record(z.unknown()).optional(),
  fraudContext: z.record(z.unknown()).optional()
});

export const crmActivityFeedSchema = z.object({
  applicationId: z.string().uuid(),
  limit: z.coerce.number().int().positive().max(200).default(50)
});

export const lenderDistributionSchema = z.object({
  businessApplicationId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  state: z.string().min(2),
  industry: z.string().min(1),
  requestedAmount: z.number().positive(),
  creditScore: z.number().int().min(300).max(850).optional(),
  riskScore: z.number().min(0).max(100).optional(),
  maxDistributions: z.number().int().positive().max(20).optional(),
  minimumScore: z.number().min(0).max(100).optional(),
  persist: z.boolean().default(false)
});

export const analyticsSnapshotSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  persist: z.boolean().default(false)
});

export const workflowExecutionSchema = z.object({
  action: z.enum(["create", "fetch", "update", "retry", "dead_letter"]),
  jobId: z.string().uuid().optional(),
  workflowKey: z.string().min(1).optional(),
  jobType: z.string().min(1).optional(),
  payload: z.record(z.unknown()).optional(),
  priority: z.number().optional(),
  status: z.enum(["queued", "running", "completed", "failed", "dead_letter"]).optional(),
  result: z.record(z.unknown()).optional(),
  errorMessage: z.string().optional()
});

export const lifecycleTransitionSchema = z.object({
  applicationId: z.string().uuid(),
  toStatus: z.enum([
    "raw",
    "new_lead",
    "onboarding",
    "draft",
    "submitted",
    "documents_pending",
    "ai_review",
    "qualified",
    "needs_review",
    "underwriting_review",
    "reviewing",
    "reviewed",
    "submitted_to_lender",
    "routed",
    "approved",
    "funded",
    "rejected",
    "inactive",
    "withdrawn"
  ]),
  reason: z.string().max(1000).optional()
});

export const aiExecutionTestSchema = z.object({
  provider: z.enum(["openai", "claude", "both"]).default("both"),
  persistLog: z.boolean().default(true),
  mode: z.enum(["provider_health", "prompt_suite"]).default("provider_health"),
  fallback: z.boolean().default(true)
});

export const operatorQueueSchema = z.object({
  staleThresholdHours: z.coerce.number().positive().max(720).default(72),
  limit: z.coerce.number().int().positive().max(200).default(100),
  offset: z.coerce.number().int().nonnegative().default(0),
  status: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
});

export const smokeTestSchema = z.object({
  executeWrites: z.boolean().default(false),
  merchant: merchantIntakeSchema.optional()
});

export const prelaunchValidationSchema = z.object({
  includeAiValidation: z.boolean().default(false),
  includeWriteSmokeTest: z.boolean().default(false),
  provider: z.enum(["openai", "claude", "both"]).default("both"),
  merchant: merchantIntakeSchema.optional()
});
