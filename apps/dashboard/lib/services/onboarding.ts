import type { Json } from "@operion/shared";
import { productionRepository } from "@/lib/repositories/production";
import { enqueueFundingEmail } from "@/lib/integrations/email-automation";

export async function recordMerchantOnboarding(input: {
  applicationId: string;
  leadId: string;
  businessName: string;
  ownerName?: string | null;
  contactEmail?: string | null;
  requestedAmount: number;
  fundingPurpose?: string | null;
}) {
  await productionRepository.createCrmActivity({
    application_id: input.applicationId,
    lead_id: input.leadId,
    actor_type: "system",
    activity_type: "status_change",
    subject: "Merchant onboarding initialized",
    body: `Application for ${input.businessName} has been entered into the Operion onboarding workflow and queued for AI qualification.`,
    metadata: {
      requested_amount: input.requestedAmount,
      owner_name: input.ownerName ?? null,
      funding_purpose: input.fundingPurpose ?? null
    } as Json
  });

  if (input.contactEmail) {
    const reminderText = `Thank you for submitting your funding application. We requested your bank statements, government ID, and business bank account details to complete underwriting. Please upload the documents as soon as possible to accelerate funding and lender matching.`;

    try {
      await enqueueFundingEmail({
        to: input.contactEmail,
        subject: "Next steps: upload your funding documents",
        text: reminderText,
        lead_id: input.leadId,
        email_number: 1
      });
    } catch {
      // Email automation is best-effort when SendGrid is configured
    }
  }
}
