import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { enqueueFundingEmail } from "@/lib/integrations/email-automation";

export const dynamic = "force-dynamic";

const emailQueueSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(240),
  text: z.string().min(1).max(8000),
  lead_id: z.string().uuid().optional().nullable(),
  purpose: z
    .enum([
      "merchant_outreach",
      "merchant_support",
      "document_upload_request",
      "application_received",
      "application_status_update",
      "lender_outreach",
      "lender_onboarding",
      "lender_submission_package",
      "internal_ai_alert",
      "operational_summary"
    ])
    .optional(),
  email_number: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional()
});

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = emailQueueSchema.parse(await request.json());
    const emailPayload: Parameters<typeof enqueueFundingEmail>[0] = {
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      lead_id: payload.lead_id ?? null
    };
    if (payload.purpose !== undefined) {
      emailPayload.purpose = payload.purpose;
    }
    if (payload.email_number !== undefined) {
      emailPayload.email_number = payload.email_number;
    }

    const data = await enqueueFundingEmail(emailPayload);

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
