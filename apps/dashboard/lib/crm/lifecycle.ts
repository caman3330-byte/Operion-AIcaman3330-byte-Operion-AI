import type { BusinessApplicationStatus, CrmActivityType, Json } from "@operion/shared";
import { logger } from "../logger";
import { getSupabaseAdmin } from "../supabase/server";
import { trackCRMActivity } from "./operations";

export interface LifecycleTransitionInput {
  applicationId: string;
  businessId?: string;
  fromStatus?: BusinessApplicationStatus;
  toStatus: BusinessApplicationStatus;
  actorId: string;
  reason?: string;
}

export interface FollowUpInput {
  applicationId: string;
  businessId?: string;
  actorId: string;
  dueAt: string;
  subject: string;
  body?: string;
}

export interface FundingPipelineSnapshot {
  applicationId: string;
  status: BusinessApplicationStatus;
  requestedAmount: number;
  offerCount: number;
  activeOfferAmount: number;
  acceptedOfferAmount: number;
  nextAction: string;
}

export async function transitionMerchantLifecycle(input: LifecycleTransitionInput): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();
    const { data: current, error: readError } = await supabase
      .from("business_applications")
      .select("status,metadata,business_id")
      .eq("id", input.applicationId)
      .maybeSingle();
    if (readError) return { success: false, error: readError.message };
    if (!current) return { success: false, error: "Business application not found" };

    const transitionedAt = new Date().toISOString();
    const previousMetadata = isRecord(current.metadata) ? current.metadata : {};
    const previousLifecycle = isRecord(previousMetadata.lifecycle) ? previousMetadata.lifecycle : {};
    const history = Array.isArray(previousLifecycle.history) ? previousLifecycle.history : [];
    const fromStatus = input.fromStatus ?? current.status;
    const updatePayload = {
      status: input.toStatus,
      metadata: {
        ...previousMetadata,
        lifecycle: {
          ...previousLifecycle,
          previousStatus: fromStatus,
          currentStatus: input.toStatus,
          reason: input.reason ?? null,
          transitionedBy: input.actorId,
          transitionedAt,
          history: [
            ...history.slice(-24),
            {
              fromStatus,
              toStatus: input.toStatus,
              reason: input.reason ?? null,
              actorId: input.actorId,
              transitionedAt
            }
          ]
        }
      } as Json
    };

    const { error } = await supabase.from("business_applications").update(updatePayload).eq("id", input.applicationId);
    if (error) return { success: false, error: error.message };

    await trackCRMActivity({
      applicationId: input.applicationId,
      businessId: input.businessId ?? current.business_id ?? null,
      actorId: input.actorId,
      actorType: "operator",
      activityType: "status_change",
      subject: `Lifecycle moved to ${input.toStatus}`,
      metadata: updatePayload.metadata as Record<string, unknown>,
      ...(input.reason ? { body: input.reason } : {})
    });

    logger.info("Merchant lifecycle transitioned", { applicationId: input.applicationId, toStatus: input.toStatus });
    return { success: true };
  } catch (error) {
    logger.error("Exception transitioning merchant lifecycle", { error: error instanceof Error ? error.message : String(error) });
    return { success: false, error: "Internal error" };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function addOperationalNote(input: {
  applicationId: string;
  businessId?: string;
  actorId: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
}) {
  return trackCRMActivity({
    applicationId: input.applicationId,
    businessId: input.businessId ?? null,
    actorId: input.actorId,
    actorType: "operator",
    activityType: "note",
    subject: input.subject,
    body: input.body,
    ...(input.metadata ? { metadata: input.metadata } : {})
  });
}

export async function scheduleFollowUp(input: FollowUpInput): Promise<{ success: boolean; error?: string }> {
  return trackCRMActivity({
    applicationId: input.applicationId,
    businessId: input.businessId ?? null,
    actorId: input.actorId,
    actorType: "operator",
    activityType: "call",
    subject: input.subject,
    metadata: { dueAt: input.dueAt, scheduled: true },
    ...(input.body ? { body: input.body } : {})
  });
}

export async function listActivityFeed(applicationId: string, limit = 50) {
  try {
    const supabase = await getSupabaseAdmin();
    const { data, error } = await supabase
      .from("crm_activities")
      .select("*")
      .or(`application_id.eq.${applicationId},business_application_id.eq.${applicationId}`)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { activities: [], error: error.message };
    return { activities: data ?? [] };
  } catch (error) {
    return { activities: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function detectStaleMerchantApplications(staleThresholdHours = 72, limit = 100) {
  const supabase = await getSupabaseAdmin();
  const cutoff = new Date(Date.now() - staleThresholdHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("business_applications")
    .select("id,business_name,status,updated_at")
    .lt("updated_at", cutoff)
    .not("status", "in", "(funded,rejected,withdrawn,inactive)")
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) return { stale: [], error: error.message };
  return { stale: data ?? [] };
}

export async function getFundingPipelineSnapshot(applicationId: string): Promise<{ snapshot?: FundingPipelineSnapshot; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();
    const [{ data: application, error: appError }, { data: offers, error: offerError }] = await Promise.all([
      supabase.from("business_applications").select("id,status,requested_amount").eq("id", applicationId).single(),
      supabase.from("funding_offers").select("amount,status").eq("business_application_id", applicationId)
    ]);

    if (appError) return { error: appError.message };
    if (offerError) return { error: offerError.message };

    const activeOffers = (offers ?? []).filter((offer) => ["draft", "presented"].includes(offer.status));
    const acceptedOffers = (offers ?? []).filter((offer) => offer.status === "accepted");
    const activeOfferAmount = activeOffers.reduce((sum, offer) => sum + offer.amount, 0);
    const acceptedOfferAmount = acceptedOffers.reduce((sum, offer) => sum + offer.amount, 0);

    return {
      snapshot: {
        applicationId,
        status: application.status,
        requestedAmount: application.requested_amount,
        offerCount: offers?.length ?? 0,
        activeOfferAmount,
        acceptedOfferAmount,
        nextAction: determineNextAction(application.status, offers?.length ?? 0, acceptedOfferAmount)
      }
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function lifecycleActivityType(status: BusinessApplicationStatus): CrmActivityType {
  return status === "documents_pending" ? "document_request" : status === "submitted_to_lender" ? "lender_update" : "status_change";
}

function determineNextAction(status: BusinessApplicationStatus, offerCount: number, acceptedOfferAmount: number) {
  if (acceptedOfferAmount > 0) return "Prepare funding confirmation";
  if (status === "documents_pending") return "Collect missing documents";
  if (status === "ai_review" || status === "underwriting_review") return "Complete underwriting review";
  if (offerCount === 0 && status === "routed") return "Generate lender offers";
  return "Continue lifecycle monitoring";
}
