import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { getDataProspect } from "@/lib/data-prospects/repository";
import { ConfigurationError, ValidationError, handleRouteError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Explicit founder action only. DATA imports and enrichment never call this
 * route, so promotion cannot silently start outreach.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireFounder(request);
    const { id } = await params;
    const prospect = await getDataProspect(id);

    if (prospect.lead_id) {
      return NextResponse.json({ promoted: true, lead_id: prospect.lead_id, replayed: true });
    }
    if (prospect.enrichment_status !== "enriched" && prospect.enrichment_status !== "no_match") {
      throw new ValidationError("Review or enrich this DATA prospect before promoting it to Leads.");
    }
    if (!prospect.normalized_email && !prospect.normalized_phone) {
      throw new ValidationError("A phone number or email is required before promotion.");
    }

    const supabase = await getSupabaseAdmin();
    const { data: lead, error: leadError } = await (supabase.from("leads" as any).insert({
      business_name: prospect.business_name,
      contact_name: prospect.owner_name,
      email: prospect.normalized_email,
      phone: prospect.normalized_phone,
      industry: prospect.industry,
      state: prospect.state,
      status: "raw",
      acquisition_prospect_id: prospect.id
    }).select("id").single() as any);

    if (leadError) {
      if (["42P01", "42703", "PGRST204", "PGRST205"].includes(leadError.code ?? "")) {
        throw new ConfigurationError("Lead promotion is not enabled in this staging schema yet.", { required_table: "public.leads" });
      }
      // A unique acquisition_prospect_id conflict means a prior request won.
      if (leadError.code === "23505") {
        const { data: existing, error: existingError } = await (supabase.from("leads" as any)
          .select("id").eq("acquisition_prospect_id", prospect.id).maybeSingle() as any);
        if (existingError) throw existingError;
        if (existing?.id) return NextResponse.json({ promoted: true, lead_id: existing.id, replayed: true });
      }
      throw leadError;
    }

    const { data: updated, error: updateError } = await (supabase.from("acquisition_prospects" as any)
      .update({ lead_id: lead.id, state_key: "outreach_ready", updated_at: new Date().toISOString() })
      .eq("id", prospect.id).is("lead_id", null).select("id").maybeSingle() as any);
    if (updateError) throw updateError;
    if (!updated) {
      // Another request linked the prospect between the insert and update.
      await supabase.from("leads" as any).delete().eq("id", lead.id).eq("acquisition_prospect_id", prospect.id);
      const { data: existing } = await (supabase.from("acquisition_prospects" as any).select("lead_id").eq("id", prospect.id).single() as any);
      if (existing?.lead_id) return NextResponse.json({ promoted: true, lead_id: existing.lead_id, replayed: true });
      throw new ValidationError("The prospect changed during promotion. Refresh and try again.");
    }

    return NextResponse.json({ promoted: true, lead_id: lead.id, replayed: false, actor: actor.email });
  } catch (error) {
    return handleRouteError(error);
  }
}
