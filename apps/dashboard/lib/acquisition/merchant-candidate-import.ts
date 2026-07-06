import type { Json } from "@operion/shared";
import { writeAuditLog } from "@/lib/audit";
import { normalizeBusinessLead } from "@/lib/acquisition/normalization";
import { contactConfidence, scoreLeadQuality } from "@/lib/acquisition/scoring";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { leadsRepository } from "@/lib/repositories/leads";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type MerchantCandidateImportRow = {
  id: string;
  source_id: string;
  business_name: string;
  website_url: string;
  domain: string;
  industry: string;
  state: string | null;
  business_phone: string | null;
  business_email: string | null;
  contact_page_url: string | null;
  company_description: string | null;
  quality_score: number;
  website_verified: boolean;
  phone_verified: boolean;
  email_found: boolean;
  identity_match: boolean;
  enrichment_status: string;
  import_review_status: string;
  created_at: string;
  last_enriched_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  raw_payload: Json;
  merchant_acquisition_sources: {
    source_name: string;
    source_url: string;
    industry: string;
    state: string | null;
  } | null;
};

export async function importApprovedMerchantCandidates(input: {
  candidateIds?: string[];
  requestedBy: string;
}) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("merchant_acquisition_candidates")
    .select(
      "id,source_id,business_name,website_url,domain,industry,state,business_phone,business_email,contact_page_url,company_description,quality_score,website_verified,phone_verified,email_found,identity_match,enrichment_status,import_review_status,created_at,last_enriched_at,reviewed_at,reviewed_by,raw_payload,merchant_acquisition_sources(source_name,source_url,industry,state)"
    )
    .eq("import_review_status", "approved")
    .eq("enrichment_status", "completed")
    .eq("website_verified", true)
    .eq("phone_verified", true)
    .eq("identity_match", true)
    .gte("quality_score", 80)
    .order("quality_score", { ascending: false })
    .limit(100);

  if (input.candidateIds?.length) {
    query = query.in("id", input.candidateIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  const candidates = (data ?? []) as unknown as MerchantCandidateImportRow[];
  const created: Array<{ candidate_id: string; lead_id: string; business_name: string }> = [];
  const duplicates: Array<{ candidate_id: string; business_name: string; reason: string }> = [];
  const failed: Array<{ candidate_id: string; business_name: string; error: string }> = [];
  const importedAt = new Date().toISOString();

  for (const candidate of candidates) {
    try {
      const normalized = normalizeBusinessLead({
        business_name: candidate.business_name,
        email: candidate.business_email,
        phone: candidate.business_phone,
        website_url: candidate.website_url,
        industry: candidate.industry,
        state: candidate.state,
        source: "merchant_acquisition",
        source_record_id: candidate.id,
        raw_payload: candidate.raw_payload
      });

      const existing = await acquisitionRepository.findLeadByEmailOrName({
        businessName: normalized.business_name,
        email: normalized.email,
        phone: normalized.phone,
        domain: normalized.domain
      });

      if (existing.length > 0) {
        const existingLead = existing[0];
        duplicates.push({
          candidate_id: candidate.id,
          business_name: candidate.business_name,
          reason: existingLead ? `Existing CRM lead ${existingLead.id}` : "Existing CRM lead"
        });
        await acquisitionRepository.updateMerchantCandidate(candidate.id, {
          review_notes: appendReviewNote(null, `Import skipped: duplicate CRM lead${existingLead ? ` ${existingLead.id}` : ""}.`)
        });
        continue;
      }

      const quality = scoreLeadQuality(normalized, candidate.industry, { uniqueDomain: true });
      const attribution = buildAttribution(candidate, importedAt);
      const lead = await leadsRepository.create({
        business_name: normalized.business_name,
        email: normalized.email,
        phone: normalized.phone,
        industry: normalized.industry,
        state: normalized.state,
        status: "enriched",
        qualification_score: Math.max(candidate.quality_score, quality.score),
        tier: quality.tier,
        website_verified: candidate.website_verified,
        email_verified: Boolean(candidate.business_email),
        phone_verified: candidate.phone_verified,
        business_verified: candidate.identity_match,
        validation_score: candidate.quality_score,
        validation_reason: "Founder-approved verified merchant acquisition candidate imported to CRM.",
        validation_timestamp: importedAt,
        is_test_data: false,
        internal_notes: JSON.stringify({
          source_attribution: attribution,
          website_url: candidate.website_url,
          contact_page_url: candidate.contact_page_url,
          company_description: candidate.company_description
        })
      });

      await acquisitionRepository.createEnrichment({
        lead_id: lead.id,
        source_id: null,
        status: "completed",
        provider: "merchant_acquisition",
        normalized_business_name: normalized.normalized_business_name,
        website_url: normalized.website_url,
        domain: normalized.domain,
        industry: normalized.industry,
        contact_confidence_score: contactConfidence({
          email: normalized.email,
          phone: normalized.phone,
          contactName: normalized.contact_name
        }),
        quality_score: Math.max(candidate.quality_score, quality.score),
        duplicate_group_key: normalized.domain ?? normalized.normalized_business_name,
        funding_signals: {
          reasons: quality.reasons,
          source_attribution: attribution,
          founder_approved: true
        } as Json,
        raw_payload: {
          ...(isJsonRecord(candidate.raw_payload) ? candidate.raw_payload : {}),
          source_attribution: attribution,
          merchant_candidate_id: candidate.id
        } as Json,
        is_test_data: false,
        enriched_at: importedAt
      });

      if (normalized.email || normalized.phone) {
        await acquisitionRepository.upsertContact({
          lead_id: lead.id,
          source_id: null,
          email: normalized.email,
          phone: normalized.phone,
          website_url: normalized.website_url,
          confidence_score: contactConfidence({ email: normalized.email, phone: normalized.phone }),
          is_primary: true,
          source_record_id: candidate.id,
          raw_payload: {
            source_attribution: attribution,
            merchant_candidate_id: candidate.id
          } as Json,
          is_test_data: false
        });
      }

      await acquisitionRepository.updateMerchantCandidate(candidate.id, {
        import_review_status: "imported",
        review_notes: appendReviewNote(null, `Imported to CRM lead ${lead.id}.`)
      });

      await writeAuditLog({
        eventType: "merchant_candidate_imported",
        actorType: "founder",
        actorId: input.requestedBy,
        entityType: "lead",
        entityId: lead.id,
        metadata: {
          merchant_candidate_id: candidate.id,
          source_attribution: attribution
        } as Json
      });

      created.push({ candidate_id: candidate.id, lead_id: lead.id, business_name: candidate.business_name });
    } catch (error) {
      failed.push({
        candidate_id: candidate.id,
        business_name: candidate.business_name,
        error: error instanceof Error ? error.message : "Unknown import error"
      });
    }
  }

  return {
    reviewed: candidates.length,
    imported: created.length,
    duplicates: duplicates.length,
    failed: failed.length,
    created,
    duplicate_details: duplicates,
    failed_details: failed
  };
}

function buildAttribution(candidate: MerchantCandidateImportRow, importedAt: string) {
  return {
    merchant_candidate_id: candidate.id,
    merchant_source_id: candidate.source_id,
    discovery_source: candidate.merchant_acquisition_sources?.source_name ?? "Unknown source",
    discovery_source_url: candidate.merchant_acquisition_sources?.source_url ?? null,
    discovery_date: candidate.created_at,
    verification_date: candidate.last_enriched_at,
    approval_date: candidate.reviewed_at,
    approved_by: candidate.reviewed_by,
    crm_import_date: importedAt,
    application_date: null,
    funding_date: null,
    revenue: null
  };
}

function appendReviewNote(existing: string | null, note: string) {
  const timestamped = `${new Date().toISOString()} ${note}`;
  return existing ? `${existing}\n${timestamped}` : timestamped;
}

function isJsonRecord(value: Json): value is Record<string, Json> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
