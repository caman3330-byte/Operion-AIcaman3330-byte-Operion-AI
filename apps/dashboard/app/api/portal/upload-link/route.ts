import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { enqueueFundingEmail } from "@/lib/integrations/email-automation";
import { createMerchantUploadMagicLink } from "@/lib/portal/merchant-upload-auth";
import { productionRepository } from "@/lib/repositories/production";
import { handleRouteError } from "@/lib/errors";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const uploadLinkSchema = z.object({
  business_application_id: z.string().uuid(),
  email: z.string().email()
});

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit({ key: rateLimitKey(request, "portal_upload_link"), limit: 5, windowMs: 60_000 });
    const payload = uploadLinkSchema.parse(await request.json());
    const origin = request.nextUrl.origin;
    const link = await createMerchantUploadMagicLink({
      businessApplicationId: payload.business_application_id,
      email: payload.email,
      origin,
      requestedBy: "merchant"
    });

    if (link.created) {
      await enqueueFundingEmail({
        to: payload.email,
        subject: "Secure Operion Capital document upload link",
        text: `Use this secure link to upload funding documents for ${link.application.business_name}: ${link.url}\n\nThis link expires on ${new Date(link.expiresAt).toLocaleString("en-US")}.`,
        lead_id: link.application.lead_id ?? null,
        email_number: 1,
        purpose: "document_upload_request"
      });

      await productionRepository.createAuditLog({
        event_type: "merchant_upload_magic_link_created",
        actor_id: `merchant:${payload.email.toLowerCase()}`,
        actor_role: "merchant",
        entity_type: "business_application",
        entity_id: payload.business_application_id,
        metadata: {
          expires_at: link.expiresAt,
          delivery: "email_queue"
        } as Json
      });

      await writeAuditLog({
        eventType: "merchant_upload_magic_link_created",
        actorType: "system",
        actorId: `merchant:${payload.email.toLowerCase()}`,
        entityType: "business_application",
        entityId: payload.business_application_id,
        metadata: {
          expires_at: link.expiresAt
        } as Json
      });
    }

    return NextResponse.json({
      data: {
        accepted: true,
        message: "If the email matches the application, a secure upload link will be sent."
      }
    }, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
