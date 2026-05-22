import type { Json } from "@operion/shared";
import type { z } from "zod";
import type { MerchantSubmissionInput } from "../intake/types";
import type { merchantIntakeSchema } from "./schemas";

type MerchantIntakePayload = z.infer<typeof merchantIntakeSchema>;

export function normalizeMerchantSubmissionPayload(
  payload: MerchantIntakePayload,
  options: {
    submittedBy?: string;
    submittedByEmail?: string;
  } = {}
): MerchantSubmissionInput {
  return {
    businessName: payload.businessName,
    industry: payload.industry,
    monthlyDeposits: payload.monthlyDeposits,
    requestedAmount: payload.requestedAmount,
    creditScoreRange: payload.creditScoreRange,
    ownerName: payload.ownerName,
    contactEmail: payload.contactEmail,
    contactPhone: payload.contactPhone,
    consentToContact: payload.consentToContact,
    metadata: {
      internalApi: true,
      submittedByEmail: options.submittedByEmail ?? null,
      requestMetadata: toJson(payload.metadata ?? {})
    },
    ...(options.submittedBy ? { submittedBy: options.submittedBy } : {}),
    ...(payload.state ? { state: payload.state } : {}),
    ...(payload.websiteUrl ? { websiteUrl: payload.websiteUrl } : {}),
    ...(payload.annualRevenue !== undefined ? { annualRevenue: payload.annualRevenue } : {}),
    ...(payload.monthlyRevenue !== undefined ? { monthlyRevenue: payload.monthlyRevenue } : {}),
    ...(payload.productType ? { productType: payload.productType } : {}),
    ...(payload.ownershipPercentage !== undefined ? { ownershipPercentage: payload.ownershipPercentage } : {}),
    ...(payload.bankName ? { bankName: payload.bankName } : {}),
    ...(payload.averageDailyBalance !== undefined ? { averageDailyBalance: payload.averageDailyBalance } : {}),
    ...(payload.fundingPurpose ? { fundingPurpose: payload.fundingPurpose } : {}),
    ...(payload.requiredDocuments ? { requiredDocuments: payload.requiredDocuments } : {})
  };
}

export function toJson(value: unknown): Json {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return value as Json;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJson(item));
  }

  if (typeof value === "object" && value) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toJson(entry)])
    ) as Json;
  }

  return null;
}
