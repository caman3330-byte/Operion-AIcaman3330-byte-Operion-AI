import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { leadsRepository } from "@/lib/repositories/leads";
import { lendersRepository } from "@/lib/repositories/lenders";
import { sendLenderPackageNotificationEmail } from "@/lib/email/sendgrid";

export const dynamic = "force-dynamic";

const lenderPackageSchema = z.object({
  lead_id: z.string().uuid(),
  lender_id: z.string().uuid().optional(),
  to: z.string().email().optional()
});

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = lenderPackageSchema.parse(await request.json());
    const lead = await leadsRepository.getById(payload.lead_id);

    let toAddress: string | null = payload.to ?? null;
    let lenderName = "Lender Partner";

    if (payload.lender_id) {
      const lender = await lendersRepository.getById(payload.lender_id);
      lenderName = lender.company_name;
      if (!toAddress) {
        toAddress = lender.contact_email;
      }
    }

    if (!toAddress) {
      return NextResponse.json({ error: "No lender email provided or configured." }, { status: 400 });
    }

    const result = await sendLenderPackageNotificationEmail({
      leadId: lead.id,
      to: toAddress,
      lenderName,
      businessName: lead.business_name,
      contactName: lead.contact_name ?? null,
      contactEmail: lead.email ?? null,
      requestedAmount: lead.requested_amount ?? null,
      industry: lead.industry ?? null,
      state: lead.state ?? null,
      status: "pending"
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
