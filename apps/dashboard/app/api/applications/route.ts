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
import { hashProspectApplicationToken, isProspectApplicationToken } from "@/lib/acquisition/application-token";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit({
      key: rateLimitKey(request, "application_submit"),
      limit: 12,
      windowMs: 60_000
    });
    const payload = fundingApplicationSchema.parse(await readJsonBody(request));
    const session = await resolveAcquisitionSession(request.headers.get("x-operion-application-token"));
    const attribution = {
      source: payload.attribution?.source ?? "direct",
      raw_source: payload.attribution?.raw_source ?? null,
      utm_source: payload.attribution?.utm_source ?? null,
      utm_medium: payload.attribution?.utm_medium ?? null,
      utm_campaign: payload.attribution?.utm_campaign ?? null,
      landing_path: request.nextUrl.pathname,
      captured_at: new Date().toISOString()
    };
    await productionRepository.ensureProductionSchema();
    const actor = await getOptionalActor(request);
    if (actor) {
      await productionRepository.upsertProfile({
        id: actor.id,
        email: actor.email
      });
    }
    // Acquisition submissions have one and only one persistence path: the locked
    // PostgreSQL transaction in migration 0040. Do not fall through to the legacy
    // application/lead inserts below.
    if (session) {
      return submitAcquisitionApplication(session, payload);
    }

    // The application is durable before a CRM lead exists. Acquisition sessions make a
    // retry resolve this same application instead of creating a second record.
    const application = await productionRepository.createBusinessApplication({
      user_id: actor?.id ?? null, profile_id: actor?.id ?? null, lead_id: null,
      ...(session ? { acquisition_prospect_id: session.acquisition_prospect_id } : {}),
      status: "awaiting_documents" as any, business_name: payload.business_name, industry: payload.industry,
      state: payload.state ?? null, website_url: payload.website_url ?? null, annual_revenue: payload.annual_revenue ?? null,
      monthly_revenue: payload.monthly_revenue ?? null, monthly_deposits: payload.monthly_deposits,
      requested_amount: payload.requested_amount, product_type: payload.product_type, credit_score_range: payload.credit_score_range,
      owner_name: payload.owner_name, contact_email: payload.contact_email, contact_phone: payload.contact_phone,
      ownership_percentage: payload.ownership_percentage ?? null, bank_name: payload.bank_name ?? null,
      average_daily_balance: payload.average_daily_balance ?? null, funding_purpose: payload.funding_purpose ?? null,
      consent_to_contact: payload.consent_to_contact, progress_step: 4,
      metadata: { source: attribution.source, attribution, acquisition_session: Boolean(session) } as Json
    } as any);

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
      status: "raw",
      internal_notes: JSON.stringify({
        acquisition_attribution: attribution,
        ...(session ? { acquisition_prospect_id: session.acquisition_prospect_id } : {})
      })
    });

    const linkedLead = await leadsRepository.update(lead.id, {
      business_application_id: application.id,
      ...(session ? { acquisition_prospect_id: session.acquisition_prospect_id } : {})
    });
    const linkedApplication = await productionRepository.updateBusinessApplication(application.id, { lead_id: lead.id } as any);
    if (session) await markAcquisitionSessionSubmitted(session, application.id, lead.id);

    await productionRepository.createDocument({
      user_id: actor?.id ?? null,
      business_application_id: application.id,
      lead_id: lead.id,
      document_type: "bank_statements",
      status: "requested",
      notes: "Recent business bank statements are required before human review."
    });

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
          delivery: "application_confirmation_email",
          attribution
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
      attribution,
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
        business_application_id: application.id,
        attribution
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
        requested_amount: payload.requested_amount,
        attribution
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
        requested_amount: payload.requested_amount,
        attribution
      } as Json
    });

    return NextResponse.json(
      {
        data: {
          application: linkedApplication,
          lead: linkedLead,
          ai_task: aiTask,
          secure_upload_url: secureUploadLink?.created ? secureUploadLink.url : null,
          secure_upload_expires_at: secureUploadLink?.created ? secureUploadLink.expiresAt : null
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

async function resolveAcquisitionSession(token: string | null) {
  if (!token) return null;
  if (!isProspectApplicationToken(token)) throw new ValidationError("Invalid application link.");
  const { data, error } = await getSupabaseAdmin().from("acquisition_application_sessions" as never)
    .select("id,acquisition_prospect_id,application_id,lead_id,expires_at" as never)
    .eq("token_hash" as never, hashProspectApplicationToken(token) as never).maybeSingle();
  if (error || !data || new Date((data as any).expires_at).getTime() <= Date.now()) throw new ValidationError("This application link is invalid or expired.");
  return { ...(data as object), tokenHash: hashProspectApplicationToken(token) } as any;
}

async function markAcquisitionSessionSubmitted(session: any, applicationId: string, leadId: string) {
  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("acquisition_application_sessions" as never).update({ application_id: applicationId, lead_id: leadId, submitted_at: now } as never).eq("id" as never, session.id as never).is("application_id" as never, null as never);
  if (error) throw error;
  await supabase.from("acquisition_prospects" as never).update({ state_key: "application_submitted" } as never).eq("id" as never, session.acquisition_prospect_id as never);
}

async function submitAcquisitionApplication(session: { token_hash?: never; [key: string]: any }, payload: ReturnType<typeof fundingApplicationSchema.parse>) {
  const applicationPayload = {
    business_name: payload.business_name, industry: payload.industry, state: payload.state ?? null,
    website_url: payload.website_url ?? null, annual_revenue: payload.annual_revenue ?? null,
    monthly_revenue: payload.monthly_revenue ?? null, monthly_deposits: payload.monthly_deposits,
    requested_amount: payload.requested_amount, product_type: payload.product_type,
    credit_score_range: payload.credit_score_range, owner_name: payload.owner_name,
    contact_email: payload.contact_email, contact_phone: payload.contact_phone
  };
  const leadPayload = {
    business_name: payload.business_name, contact_name: payload.owner_name,
    email: payload.contact_email, phone: payload.contact_phone, industry: payload.industry, state: payload.state ?? null
  };
  const { data, error } = await getSupabaseAdmin().rpc("submit_acquisition_application" as never, {
    p_token_hash: session.tokenHash,
    p_application: applicationPayload,
    p_lead: leadPayload
  } as never);
  const rows = data as unknown as Array<{ application_id: string; lead_id: string; replayed: boolean }> | null;
  if (error || !rows?.[0]?.application_id || !rows[0]?.lead_id) {
    throw new ValidationError("The application could not be submitted. Please retry your secure link.");
  }
  const result = rows[0];
  const [application, lead] = await Promise.all([
    productionRepository.getBusinessApplication(result.application_id),
    leadsRepository.getById(result.lead_id)
  ]);
  return NextResponse.json({ data: { application, lead, idempotent_replay: result.replayed } }, { status: result.replayed ? 200 : 201 });
}
