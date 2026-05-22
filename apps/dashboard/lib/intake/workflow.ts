import type { BusinessApplication } from "@operion/shared";
import type { AiIntakePreparation, IntakeValidationResult } from "./types";

export function buildAiIntakePreparation(
  application: BusinessApplication,
  validation: IntakeValidationResult
): AiIntakePreparation {
  const missingFields = [
    application.state ? undefined : "state",
    application.website_url ? undefined : "website_url",
    application.annual_revenue ? undefined : "annual_revenue",
    application.bank_name ? undefined : "bank_name"
  ].filter((field): field is string => Boolean(field));

  const riskFlags = [
    application.requested_amount > application.monthly_deposits * 2 ? "high_requested_amount_to_deposits" : undefined,
    application.credit_score_range === "under_550" ? "low_credit_score_range" : undefined,
    validation.warnings.length > 0 ? "validation_warnings_present" : undefined
  ].filter((flag): flag is string => Boolean(flag));

  return {
    applicationId: application.id,
    workflowKey: "merchant_intake",
    preparedAt: new Date().toISOString(),
    missingFields,
    riskFlags,
    promptContext: {
      businessName: application.business_name,
      industry: application.industry,
      state: application.state,
      monthlyDeposits: application.monthly_deposits,
      requestedAmount: application.requested_amount,
      creditScoreRange: application.credit_score_range,
      fundingPurpose: application.funding_purpose,
      validationWarnings: validation.warnings.map((warning) => ({
        field: warning.field,
        code: warning.code,
        message: warning.message
      }))
    }
  };
}
