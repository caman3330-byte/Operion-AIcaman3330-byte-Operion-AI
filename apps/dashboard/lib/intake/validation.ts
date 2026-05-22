import { validateDocumentUpload } from "../documents/service";
import type { IntakeValidationError, IntakeValidationResult, MerchantSubmissionInput } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_DIGITS_PATTERN = /\d/g;

export function validateMerchantSubmission(input: MerchantSubmissionInput): IntakeValidationResult {
  const errors: IntakeValidationError[] = [];
  const warnings: IntakeValidationError[] = [];

  requireText(input.businessName, "businessName", errors);
  requireText(input.industry, "industry", errors);
  requireText(input.ownerName, "ownerName", errors);
  requireText(input.contactEmail, "contactEmail", errors);
  requireText(input.contactPhone, "contactPhone", errors);

  if (input.contactEmail && !EMAIL_PATTERN.test(input.contactEmail)) {
    errors.push({ field: "contactEmail", code: "invalid_email", message: "Contact email is not valid." });
  }

  const phoneDigits = input.contactPhone.match(PHONE_DIGITS_PATTERN)?.length ?? 0;
  if (input.contactPhone && phoneDigits < 10) {
    errors.push({ field: "contactPhone", code: "invalid_phone", message: "Contact phone must include at least 10 digits." });
  }

  requirePositive(input.monthlyDeposits, "monthlyDeposits", errors);
  requirePositive(input.requestedAmount, "requestedAmount", errors);

  if (input.monthlyRevenue !== undefined && input.monthlyRevenue < 0) {
    errors.push({ field: "monthlyRevenue", code: "negative_value", message: "Monthly revenue cannot be negative." });
  }

  if (input.annualRevenue !== undefined && input.annualRevenue < 0) {
    errors.push({ field: "annualRevenue", code: "negative_value", message: "Annual revenue cannot be negative." });
  }

  if (input.requestedAmount > input.monthlyDeposits * 2) {
    warnings.push({
      field: "requestedAmount",
      code: "high_request_to_deposits",
      message: "Requested amount is more than two months of deposits and should be reviewed."
    });
  }

  if (!input.consentToContact) {
    errors.push({ field: "consentToContact", code: "missing_consent", message: "Consent to contact is required for intake." });
  }

  for (const document of input.requiredDocuments ?? []) {
    const result = validateDocumentUpload(document.fileName, document.mimeType, document.fileSizeMB);
    for (const message of result.errors) {
      errors.push({ field: "requiredDocuments", code: "invalid_document", message });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function requireText(value: string | undefined, field: IntakeValidationError["field"], errors: IntakeValidationError[]) {
  if (!value?.trim()) {
    errors.push({ field, code: "required", message: `${String(field)} is required.` });
  }
}

function requirePositive(value: number, field: IntakeValidationError["field"], errors: IntakeValidationError[]) {
  if (!Number.isFinite(value) || value <= 0) {
    errors.push({ field, code: "positive_number_required", message: `${String(field)} must be greater than zero.` });
  }
}
