import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { leadsRepository } from "@/lib/repositories/leads";
import { productionRepository } from "@/lib/repositories/production";
import { fundingApplicationSchema } from "@/lib/validation";
import { recordMerchantOnboarding } from "@/lib/services/onboarding";
import { sendMerchantConfirmationEmail } from "@/lib/email/sendgrid";
import { createMerchantUploadMagicLink } from "@/lib/portal/merchant-upload-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit({
      key: rateLimitKey(request, "application_submit"),
      limit: 12,
      windowMs: 60_000
    });
    const payload = fundingApplicationSchema.parse(await readJsonBody(request));
    await productionRepository.ensureProductionSchema();
    const actor = await getOptionalActor(request);
    if (actor) {
      await productionRepository.upsertProfile({
        id: actor.id,
        email: actor.email
      });
    }

    const lead = await leadsRepository.create({
      business_name: payload.business_name,
      contact_name: payload.owner_name,
      email: payload.contact_email,
      phone: payload.contact_phone,
      industry: payload.industry,
      state: payload.state ?? null,
      annual_revenue_est: payload.annual_revenue ?? (payload.monthly_revenue ? payload.monthly_revenue * 12 : null),
      requested_amount: payload.requested_amount,
      monthly_deposits: payload.monthly_deposits,
      funding_purpose: payload.funding_purpose ?? null,
      status: "raw"
    });

    const application = await productionRepository.createBusinessApplication({
      user_id: actor?.id ?? null,
      profile_id: actor?.id ?? null,
      lead_id: lead.id,
      status: "awaiting_documents" as any,
      business_name: payload.business_name,
      industry: payload.industry,
      state: payload.state ?? null,
      website_url: payload.website_url ?? null,
      annual_revenue: payload.annual_revenue ?? null,
      monthly_revenue: payload.monthly_revenue ?? null,
      monthly_deposits: payload.monthly_deposits,
      requested_amount: payload.requested_amount,
      product_type: payload.product_type,
      credit_score_range: payload.credit_score_range,
      owner_name: payload.owner_name,
      contact_email: payload.contact_email,
      contact_phone: payload.contact_phone,
      ownership_percentage: payload.ownership_percentage ?? null,
      bank_name: payload.bank_name ?? null,
      average_daily_balance: payload.average_daily_balance ?? null,
      funding_purpose: payload.funding_purpose ?? null,
      consent_to_contact: payload.consent_to_contact,
      progress_step: 4,
      metadata: {
        source: "public_application",
        ai_qualification_ready: true,
        ai_qualification_requested_at: new Date().toISOString(),
        schema_version: "0008",
        business_address: payload.business_address ?? null,
        time_in_business_months: payload.time_in_business_months ?? null,
        tax_id_last4: payload.tax_id_last4 ?? null
      } as Json
    });

    const linkedLead = await leadsRepository.update(lead.id, {
      business_application_id: application.id
    });

    await Promise.all(
      [
        { documentType: "bank_statements", notes: "Required before lender submission." },
        { documentType: "processing_statements", notes: "Optional if processor volume is part of the funding profile." }
      ].map(({ documentType, notes }) =>
        productionRepository.createDocument({
          user_id: actor?.id ?? null,
          business_application_id: application.id,
          lead_id: lead.id,
          document_type: documentType,
          status: "requested",
          notes
        })
      )
    );

    const secureUploadLink = payload.contact_email
      ? await createMerchantUploadMagicLink({
          businessApplicationId: application.id,
          email: payload.contact_email,
          origin: request.nextUrl.origin,
          requestedBy: "application_submission"
        })
      : null;

    if (secureUploadLink?.created) {
      const currentMetadata = typeof application.metadata === "object" && application.metadata ? application.metadata : {};
      await productionRepository.updateBusinessApplication(application.id, {
        metadata: {
          ...currentMetadata,
          secure_upload_link_created_at: new Date().toISOString(),
          secure_upload_link_expires_at: secureUploadLink.expiresAt,
          secure_upload_link_source: "application_confirmation_email"
        } as Json
      });
      await productionRepository.createCrmActivity({
        application_id: null,
        business_application_id: application.id,
        lead_id: lead.id,
        actor_type: "system",
        activity_type: "document_request",
        subject: "Secure upload link generated",
        body: "A signed document upload link was generated for the merchant confirmation email.",
        metadata: {
          expires_at: secureUploadLink.expiresAt,
          delivery: "application_confirmation_email"
        } as Json
      });
      await productionRepository.createAuditLog({
        event_type: "merchant_upload_magic_link_created",
        actor_id: "application_submission",
        actor_role: "system",
        entity_type: "business_application",
        entity_id: application.id,
        metadata: {
          lead_id: lead.id,
          expires_at: secureUploadLink.expiresAt,
          delivery: "application_confirmation_email"
        } as Json
      });
    }

    await recordMerchantOnboarding({
      applicationId: application.id,
      leadId: lead.id,
      businessName: payload.business_name,
      ownerName: payload.owner_name ?? null,
      contactEmail: payload.contact_email ?? null,
      requestedAmount: payload.requested_amount,
      fundingPurpose: payload.funding_purpose ?? null,
      sendDocumentReminder: false
    });

    if (payload.contact_email) {
      await sendMerchantConfirmationEmail({
        leadId: lead.id,
        to: payload.contact_email,
        businessName: payload.business_name,
        ownerName: payload.owner_name ?? null,
        requestedAmount: payload.requested_amount ?? null,
        fundingPurpose: payload.funding_purpose ?? null,
        portalUrl: secureUploadLink?.created ? secureUploadLink.url : null
      });
    }

    const aiTask = await productionRepository.createAiTask({
      task_type: "lead_qualification",
      status: "queued",
      priority: "high",
      lead_id: lead.id,
      input_payload: {
        business_name: payload.business_name,
        industry: payload.industry,
        requested_amount: payload.requested_amount,
        monthly_deposits: payload.monthly_deposits,
        credit_score_range: payload.credit_score_range,
        funding_purpose: payload.funding_purpose ?? null
      } as Json,
      business_application_id: application.id,
      assigned_agent: "underwriting_agent",
      created_by: actor?.id ?? null
    });

    await productionRepository.createAiTaskLog({
      ai_task_id: aiTask.id,
      status: "queued",
      message: "Funding application submitted and queued for AI qualification",
      provider: null,
      model: null,
      metadata: {
        lead_id: lead.id,
        business_application_id: application.id
      } as Json
    });

    await productionRepository.createAuditLog({
      event_type: "funding_application_submitted",
      actor_id: actor?.id ?? "public_application",
      actor_role: actor ? "customer" : "anonymous",
      entity_type: "business_application",
      entity_id: application.id,
      after_state: application as unknown as Json,
      metadata: {
        lead_id: lead.id,
        ai_task_id: aiTask.id,
        requested_amount: payload.requested_amount
      } as Json
    });

    await writeAuditLog({
      eventType: "funding_application_submitted",
      actorType: "system",
      actorId: actor?.id ?? "public_application",
      entityType: "lead",
      entityId: lead.id,
      metadata: {
        application_id: application.id,
        business_application_id: application.id,
        requested_amount: payload.requested_amount
      } as Json
    });

    return NextResponse.json(
      {
        data: {
          application,
          lead: linkedLead,
          ai_task: aiTask
        }
      },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

async function getOptionalActor(request: NextRequest) {
  try {
    return await getRequestUser(request);
  } catch {
    return null;
  }
}

async function readJsonBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Invalid JSON request body");
  }
}
