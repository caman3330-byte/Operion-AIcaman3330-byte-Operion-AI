import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { sendTestEmail } from "@/lib/email/sendgrid";

export const dynamic = "force-dynamic";

const testEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(240).optional().default("Operion AI test message"),
  text: z.string().min(1).max(8000),
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
    .optional()
});

export async function POST(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const payload = testEmailSchema.parse(await request.json());
    const emailPayload: Parameters<typeof sendTestEmail>[0] = {
      to: payload.to,
      subject: payload.subject,
      text: payload.text
    };
    if (payload.purpose !== undefined) {
      emailPayload.purpose = payload.purpose;
    }
    const result = await sendTestEmail(emailPayload);

    if (!result.ok) {
      return NextResponse.json(
        { error: "SendGrid sending failed. Verify SENDGRID_API_KEY and SENDGRID_FROM_EMAIL.", status: result.status },
        { status: 502 }
      );
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
