import type { BusinessApplicationStatus, CreditScoreRange, FundingProductType, Json } from "@operion/shared";

export type IntakeSubmissionStatus =
  | "received"
  | "validation_failed"
  | "crm_created"
  | "documents_prepared"
  | "ai_prepared"
  | "submitted"
  | "needs_review";

export interface MerchantSubmissionInput {
  businessName: string;
  industry: string;
  state?: string;
  websiteUrl?: string;
  annualRevenue?: number;
  monthlyRevenue?: number;
  monthlyDeposits: number;
  requestedAmount: number;
  productType?: FundingProductType;
  creditScoreRange: CreditScoreRange;
  ownerName: string;
  contactEmail: string;
  contactPhone: string;
  ownershipPercentage?: number;
  bankName?: string;
  averageDailyBalance?: number;
  fundingPurpose?: string;
  consentToContact: boolean;
  submittedBy?: string;
  requiredDocuments?: IntakeDocumentRequest[];
  metadata?: Json;
}

export interface IntakeDocumentRequest {
  documentType: string;
  fileName: string;
  mimeType: string;
  fileSizeMB: number;
}

export interface IntakeValidationError {
  field: keyof MerchantSubmissionInput | "requiredDocuments";
  code: string;
  message: string;
}

export interface IntakeValidationResult {
  valid: boolean;
  errors: IntakeValidationError[];
  warnings: IntakeValidationError[];
}

export interface IntakeProcessingResult {
  success: boolean;
  applicationId?: string;
  status: IntakeSubmissionStatus;
  validation: IntakeValidationResult;
  documentUploads: Array<{
    documentType: string;
    fileName: string;
    fileKey: string;
    uploadUrl: string;
    error?: string;
  }>;
  aiPreparation?: AiIntakePreparation;
  error?: string;
}

export interface AiIntakePreparation {
  applicationId: string;
  workflowKey: "merchant_intake";
  preparedAt: string;
  promptContext: Json;
  missingFields: string[];
  riskFlags: string[];
}

export interface SubmissionStatusSnapshot {
  applicationId: string;
  status: BusinessApplicationStatus;
  progressStep: number;
  submittedAt: string;
  updatedAt: string;
  validationErrors: IntakeValidationError[];
  lifecycleStatus: IntakeSubmissionStatus;
}
