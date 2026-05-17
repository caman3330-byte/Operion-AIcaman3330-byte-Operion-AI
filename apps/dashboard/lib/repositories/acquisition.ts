import type {
  AcquisitionJobStatus,
  AcquisitionSummary,
  Lead,
  LeadStatus,
  OutreachEmailStatus,
  ReplyClassification
} from "@operion/shared";
import { ConfigurationError, NotFoundError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type {
  AcquisitionJobInsert,
  AcquisitionJobUpdate,
  BusinessContactInsert,
  LeadEnrichmentInsert,
  LeadEnrichmentUpdate,
  LeadSourceInsert,
  OutreachCampaignInsert,
  OutreachCampaignUpdate,
  OutreachEmailQueueInsert,
  OutreachEmailQueueUpdate,
  OutreachReplyInsert,
  OutreachReplyUpdate,
  OutreachSequenceInsert
} from "@/lib/supabase/types";

const ACQUISITION_MIGRATION = "packages/database/migrations/0004_lead_acquisition_outreach.sql";

export const acquisitionRepository = {
  async listSources() {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("lead_sources").select("*").order("name", { ascending: true });
    if (error) throwAcquisitionDatabaseError(error);
    return data ?? [];
  },

  async upsertSource(payload: LeadSourceInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("lead_sources")
      .upsert(payload, { onConflict: "source_key" })
      .select("*")
      .single();
    if (error) throwAcquisitionDatabaseError(error);
    return data;
  },

  async getSourceByKey(sourceKey: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("lead_sources").select("*").eq("source_key", sourceKey).maybeSingle();
    if (error) throwAcquisitionDatabaseError(error);
    return data;
  },

  async listJobs(limit = 100) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("acquisition_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwAcquisitionDatabaseError(error);
    return data ?? [];
  },

  async createJob(payload: AcquisitionJobInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("acquisition_jobs").insert(payload).select("*").single();
    if (error) throwAcquisitionDatabaseError(error);
    return data;
  },

  async updateJob(id: string, payload: AcquisitionJobUpdate) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("acquisition_jobs").update(payload).eq("id", id).select("*").single();
    if (error || !data) throwAcquisitionDatabaseError(error ?? { message: "Acquisition job not found" });
    return data;
  },

  async listEnrichment(limit = 100) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("lead_enrichment")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throwAcquisitionDatabaseError(error);
    return data ?? [];
  },

  async getLatestEnrichment(leadId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("lead_enrichment")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throwAcquisitionDatabaseError(error);
    return data;
  },

  async createEnrichment(payload: LeadEnrichmentInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("lead_enrichment").insert(payload).select("*").single();
    if (error) throwAcquisitionDatabaseError(error);
    return data;
  },

  async updateEnrichment(id: string, payload: LeadEnrichmentUpdate) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("lead_enrichment").update(payload).eq("id", id).select("*").single();
    if (error || !data) throwAcquisitionDatabaseError(error ?? { message: "Lead enrichment not found" });
    return data;
  },

  async upsertContact(payload: BusinessContactInsert) {
    const supabase = getSupabaseAdmin();
    if (payload.lead_id && payload.email) {
      const { data, error } = await supabase
        .from("business_contacts")
        .upsert(payload, { onConflict: "lead_id,email" })
        .select("*")
        .single();
      if (error) {
        const inserted = await supabase.from("business_contacts").insert(payload).select("*").single();
        if (inserted.error) throwAcquisitionDatabaseError(inserted.error);
        return inserted.data;
      }
      return data;
    }

    const { data, error } = await supabase.from("business_contacts").insert(payload).select("*").single();
    if (error) throwAcquisitionDatabaseError(error);
    return data;
  },

  async listContacts(limit = 100) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("business_contacts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwAcquisitionDatabaseError(error);
    return data ?? [];
  },

  async findLeadByEmailOrName(input: { email?: string | null; businessName: string; domain?: string | null }) {
    const supabase = getSupabaseAdmin();
    const filters = [`business_name.eq.${escapeSupabaseFilter(input.businessName)}`];
    if (input.email) {
      filters.push(`email.eq.${escapeSupabaseFilter(input.email)}`);
    }

    const { data, error } = await supabase.from("leads").select("*").or(filters.join(",")).limit(10);
    if (error) throw error;
    return data ?? [];
  },

  async findLeadByEmail(email: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("leads").select("*").eq("email", email).limit(1).maybeSingle();
    if (error) throwAcquisitionDatabaseError(error);
    return data as Lead | null;
  },

  async cancelPendingOutreachEmailsForLead(leadId: string, reason?: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("outreach_email_queue")
      .update({ status: "cancelled", last_error: reason ?? "Cancelled due to reply handling" })
      .eq("lead_id", leadId)
      .in("status", ["queued", "pending_approval"] as OutreachEmailStatus[])
      .select("*");
    if (error) throwAcquisitionDatabaseError(error);
    return data ?? [];
  },

  async listCampaigns(limit = 100) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("outreach_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwAcquisitionDatabaseError(error);
    return data ?? [];
  },

  async createCampaign(payload: OutreachCampaignInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("outreach_campaigns").insert(payload).select("*").single();
    if (error) throwAcquisitionDatabaseError(error);
    return data;
  },

  async updateCampaign(id: string, payload: OutreachCampaignUpdate) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("outreach_campaigns").update(payload).eq("id", id).select("*").single();
    if (error || !data) throwAcquisitionDatabaseError(error ?? { message: "Campaign not found" });
    return data;
  },

  async getCampaign(id: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("outreach_campaigns").select("*").eq("id", id).single();
    if (error || !data) {
      if (error) throwAcquisitionDatabaseError(error);
      throw new NotFoundError("Outreach campaign not found");
    }
    return data;
  },

  async listSequences(campaignId?: string) {
    const supabase = getSupabaseAdmin();
    let query = supabase.from("outreach_sequences").select("*").order("step_number", { ascending: true });
    if (campaignId) query = query.eq("campaign_id", campaignId);
    const { data, error } = await query;
    if (error) throwAcquisitionDatabaseError(error);
    return data ?? [];
  },

  async createSequence(payload: OutreachSequenceInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("outreach_sequences").insert(payload).select("*").single();
    if (error) throwAcquisitionDatabaseError(error);
    return data;
  },

  async listEmailQueue(limit = 100, status?: OutreachEmailStatus) {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("outreach_email_queue")
      .select("*")
      .order("scheduled_at", { ascending: true })
      .limit(limit);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throwAcquisitionDatabaseError(error);
    return data ?? [];
  },

  async createEmailQueueItem(payload: OutreachEmailQueueInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("outreach_email_queue").insert(payload).select("*").single();
    if (error) throwAcquisitionDatabaseError(error);
    return data;
  },

  async updateEmailQueueItem(id: string, payload: OutreachEmailQueueUpdate) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("outreach_email_queue").update(payload).eq("id", id).select("*").single();
    if (error || !data) throwAcquisitionDatabaseError(error ?? { message: "Outreach email queue item not found" });
    return data;
  },

  async listReplies(limit = 100) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("outreach_replies")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(limit);
    if (error) throwAcquisitionDatabaseError(error);
    return data ?? [];
  },

  async createReply(payload: OutreachReplyInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("outreach_replies").insert(payload).select("*").single();
    if (error) throwAcquisitionDatabaseError(error);
    return data;
  },

  async updateReply(id: string, payload: OutreachReplyUpdate) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("outreach_replies").update(payload).eq("id", id).select("*").single();
    if (error || !data) throwAcquisitionDatabaseError(error ?? { message: "Outreach reply not found" });
    return data;
  },

  async summary(): Promise<AcquisitionSummary> {
    const supabase = getSupabaseAdmin();
    const [
      sources,
      activeSources,
      jobs,
      contacts,
      enrichment,
      campaigns,
      activeCampaigns,
      queue,
      replies,
      leadsTotal,
      leadsEnriched,
      leadsQualified,
      leadsPendingApproval
    ] = await Promise.all([
      countRows("lead_sources"),
      countRows("lead_sources", { active: true }),
      supabase.from("acquisition_jobs").select("status"),
      countRows("business_contacts"),
      supabase.from("lead_enrichment").select("quality_score"),
      countRows("outreach_campaigns"),
      countRows("outreach_campaigns", { status: "active" }),
      supabase.from("outreach_email_queue").select("status"),
      supabase.from("outreach_replies").select("classification"),
      countRows("leads"),
      countRows("leads", { status: "enriched" satisfies LeadStatus }),
      countRows("leads", { status: "qualified" satisfies LeadStatus }),
      countRows("leads", { status: "pending_approval" satisfies LeadStatus })
    ]);

    if (jobs.error) throwAcquisitionDatabaseError(jobs.error);
    if (enrichment.error) throwAcquisitionDatabaseError(enrichment.error);
    if (queue.error) throwAcquisitionDatabaseError(queue.error);
    if (replies.error) throwAcquisitionDatabaseError(replies.error);

    const jobRows = jobs.data ?? [];
    const queueRows = queue.data ?? [];
    const replyRows = replies.data ?? [];
    const qualityScores = (enrichment.data ?? [])
      .map((row) => Number(row.quality_score ?? 0))
      .filter((score) => Number.isFinite(score) && score > 0);

    return {
      sources,
      active_sources: activeSources,
      jobs: {
        queued: countStatus(jobRows, "queued"),
        running: countStatus(jobRows, "running"),
        completed: countStatus(jobRows, "completed"),
        failed: countStatus(jobRows, "failed"),
        blocked: countStatus(jobRows, "blocked")
      },
      leads: {
        total: leadsTotal,
        enriched: leadsEnriched,
        qualified: leadsQualified,
        pending_approval: leadsPendingApproval
      },
      contacts,
      average_quality_score:
        qualityScores.length === 0 ? 0 : Math.round(qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length),
      outreach: {
        campaigns,
        active_campaigns: activeCampaigns,
        queued_emails: countStatus(queueRows, "queued"),
        pending_approval_emails: countStatus(queueRows, "pending_approval"),
        sent_emails: countStatus(queueRows, "sent"),
        cancelled_emails: countStatus(queueRows, "cancelled"),
        replies: replyRows.length,
        positive_replies: countStatus(replyRows, "positive")
      }
    };
  }
};

export function isAcquisitionMigrationMissing(error: unknown) {
  return error instanceof ConfigurationError && error.message.includes("0004");
}

async function countRows(table: string, filters: Record<string, string | number | boolean> = {}) {
  const supabase = getSupabaseAdmin();
  let query = supabase.from(table as never).select("id", { count: "exact", head: true });
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key as never, value as never);
  }

  const { count, error } = await query;
  if (error) throwAcquisitionDatabaseError(error);
  return count ?? 0;
}

function countStatus<T extends { status?: AcquisitionJobStatus | OutreachEmailStatus; classification?: ReplyClassification }>(
  rows: T[],
  status: AcquisitionJobStatus | OutreachEmailStatus | ReplyClassification
) {
  return rows.filter((row) => row.status === status || row.classification === status).length;
}

function escapeSupabaseFilter(value: string) {
  return value.replace(/,/g, "\\,");
}

function throwAcquisitionDatabaseError(error: { code?: string; message?: string }): never {
  const message = error.message ?? "";
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    [
      "lead_sources",
      "business_contacts",
      "lead_enrichment",
      "acquisition_jobs",
      "outreach_campaigns",
      "outreach_sequences",
      "outreach_email_queue",
      "outreach_replies"
    ].some((table) => message.includes(table))
  ) {
    throw new ConfigurationError("Lead acquisition/outreach migration 0004 has not been applied to Supabase", {
      migration: ACQUISITION_MIGRATION
    });
  }

  throw error;
}
