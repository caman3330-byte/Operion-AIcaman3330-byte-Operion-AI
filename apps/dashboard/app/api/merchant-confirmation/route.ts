import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { leadsRepository } from "@/lib/repositories/leads";
import { sendMerchantConfirmationEmail } from "@/lib/email/sendgrid";

export const dynamic = "force-dynamic";

const merchantConfirmationSchema = z.object({
  lead_id: z.string().uuid()
});

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = merchantConfirmationSchema.parse(await request.json());
    const lead = await leadsRepository.getById(payload.lead_id);

    if (!lead.email) {
      return NextResponse.json({ error: "Lead does not have a valid email address." }, { status: 400 });
    }

    const result = await sendMerchantConfirmationEmail({
      leadId: lead.id,
      to: lead.email,
      businessName: lead.business_name,
      ownerName: lead.contact_name ?? null,
      requestedAmount: lead.requested_amount ?? null,
      fundingPurpose: lead.funding_purpose ?? null,
      portalUrl: null
    });

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
