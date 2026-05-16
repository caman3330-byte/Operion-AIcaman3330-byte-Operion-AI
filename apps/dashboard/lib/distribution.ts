import type { Lead, LeadDistribution, Lender } from "@operion/shared";
import { ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { productionRepository } from "@/lib/repositories/production";
import { lendersRepository } from "@/lib/repositories/lenders";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { withRetry } from "@/lib/retry";
import { writeAuditLog } from "@/lib/audit";

interface DistributeLeadInput {
  lead: Lead;
  lenderIds?: string[] | undefined;
  actorId: string;
}

export async function matchLenders(lead: Lead) {
  const lenders = await lendersRepository.list(true);
  return lenders.filter((lender) => lender.whitelisted || matchesCriteria(lead, lender));
}

export async function distributeLead(input: DistributeLeadInput) {
  if (!input.lead.distribution_approved_at) {
    throw new ValidationError("Lead must be approved before distribution");
  }

  const matched = input.lenderIds?.length
    ? await Promise.all(input.lenderIds.map((id) => lendersRepository.getById(id)))
    : await matchLenders(input.lead);

  if (matched.length === 0) {
    throw new ValidationError("No lenders matched this lead");
  }

  const supabase = getSupabaseAdmin();
  const results: LeadDistribution[] = [];

  for (const lender of matched) {
    await writeAuditLog({
      eventType: "distribution_approved",
      actorType: "founder",
      actorId: input.actorId,
      entityType: "distribution",
      entityId: input.lead.id,
      metadata: { lender_id: lender.id }
    });

    const inserted = await supabase
      .from("lead_distributions")
      .upsert(
        {
          lead_id: input.lead.id,
          lender_id: lender.id,
          delivery_status: "pending",
          price: lender.price_per_lead
        },
        { onConflict: "lead_id,lender_id" }
      )
      .select("*")
      .single();

    if (inserted.error) {
      throw inserted.error;
    }

    const delivery = await deliverToLender(input.lead, lender);
    const { data, error } = await supabase
      .from("lead_distributions")
      .update({
        delivery_status: delivery.ok ? "delivered" : "failed",
        distributed_at: delivery.ok ? new Date().toISOString() : null,
        retry_count: delivery.retryCount,
        last_retry_at: delivery.retryCount > 0 ? new Date().toISOString() : null
      })
      .eq("id", inserted.data.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    await writeAuditLog({
      eventType: delivery.ok ? "distribution_delivered" : "distribution_failed",
      actorType: "system",
      actorId: "distribution_service",
      entityType: "distribution",
      entityId: data.id,
      afterState: data,
      metadata: { lender_id: lender.id }
    });

    if (input.lead.business_application_id) {
      await productionRepository.upsertLenderMatch({
        lead_id: input.lead.id,
        lender_id: lender.id,
        business_application_id: input.lead.business_application_id,
        match_score: input.lead.qualification_score ?? null,
        status: delivery.ok ? "submitted" : "recommended",
        criteria_snapshot: {
          criteria_industries: lender.criteria_industries ?? [],
          criteria_min_revenue: lender.criteria_min_revenue ?? null,
          criteria_max_revenue: lender.criteria_max_revenue ?? null
        },
        submitted_at: delivery.ok ? new Date().toISOString() : null,
        commission_estimate: lender.price_per_lead ?? null,
        notes: delivery.ok ? "Lead submitted through lender distribution route." : "Lender webhook delivery failed or is not configured."
      });
    }

    results.push(data);
  }

  return results;
}

function matchesCriteria(lead: Lead, lender: Lender) {
  if (!lender.active) {
    return false;
  }

  if (lender.criteria_industries?.length && lead.industry && !lender.criteria_industries.includes(lead.industry)) {
    return false;
  }

  if (lender.criteria_min_revenue && (lead.annual_revenue_est ?? 0) < lender.criteria_min_revenue) {
    return false;
  }

  if (lender.criteria_max_revenue && (lead.annual_revenue_est ?? 0) > lender.criteria_max_revenue) {
    return false;
  }

  return true;
}

async function deliverToLender(lead: Lead, lender: Lender) {
  if (!lender.webhook_url) {
    logger.warn("lender_webhook_missing", { lenderId: lender.id, leadId: lead.id });
    return { ok: false, retryCount: 0 };
  }

  let retryCount = 0;
  await withRetry(
    async (attempt) => {
      retryCount = attempt - 1;
      const response = await fetch(lender.webhook_url as string, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          lead_id: lead.id,
          business_name: lead.business_name,
          contact_name: lead.contact_name,
          email: lead.email,
          phone: lead.phone,
          industry: lead.industry,
          state: lead.state,
          annual_revenue_est: lead.annual_revenue_est,
          qualification_score: lead.qualification_score,
          tier: lead.tier
        })
      });

      if (!response.ok) {
        throw new Error(`Lender webhook failed with ${response.status}`);
      }
    },
    { operation: "distribution.deliverToLender", baseDelayMs: 60_000 }
  );

  return { ok: true, retryCount };
}
