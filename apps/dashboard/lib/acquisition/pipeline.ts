import type { Json, Lead } from "@operion/shared";
import { writeAuditLog } from "@/lib/audit";
import { normalizeBusinessLead, type RawBusinessLead } from "@/lib/acquisition/normalization";
import { contactConfidence, scoreLeadQuality } from "@/lib/acquisition/scoring";
import { applyValidationToQuality, validateAcquisitionLead } from "@/lib/acquisition/validation";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { leadsRepository } from "@/lib/repositories/leads";

export interface IngestLeadBatchInput {
  sourceKey: string;
  records: RawBusinessLead[];
  requestedBy?: string;
  createJob?: boolean;
  jobId?: string | null;
  isTestData?: boolean;
  simulationRunId?: string | null;
}

export async function ingestLeadBatch(input: IngestLeadBatchInput) {
  const requestedBy = input.requestedBy ?? "system";
  const source = await acquisitionRepository.getSourceByKey(input.sourceKey);
  const job = input.jobId
    ? { id: input.jobId }
    : input.createJob
      ? await acquisitionRepository.createJob({
          source_id: source?.id ?? null,
          job_type: "lead_ingestion",
          status: "running",
          requested_by: requestedBy,
        assigned_agent_key: "lead_generation_agent",
        parameters: { source_key: input.sourceKey, record_count: input.records.length } as Json,
        is_test_data: input.isTestData ?? false,
        started_at: new Date().toISOString()
      })
    : null;

  const created: Lead[] = [];
  const duplicates: Array<{ business_name: string; existing_lead_id: string }> = [];
  const failed: Array<{ business_name: string; error: string }> = [];

  for (const rawRecord of input.records) {
    try {
      const normalized = normalizeBusinessLead(rawRecord);
      const existing = await acquisitionRepository.findLeadByEmailOrName({
        email: normalized.email,
        phone: normalized.phone,
        businessName: normalized.business_name,
        domain: normalized.domain
      });

      if (existing.length > 0) {
        const existingLead = existing[0];
        if (existingLead) {
          duplicates.push({ business_name: normalized.business_name, existing_lead_id: existingLead.id });
        }
        continue;
      }

      const validation = await validateAcquisitionLead({
        businessName: normalized.business_name,
        websiteUrl: normalized.website_url,
        email: normalized.email,
        phone: normalized.phone,
        businessCategory: normalized.industry,
        source: rawRecord.source ?? input.sourceKey,
        sourcePageUrl: readSourcePageUrl(rawRecord)
      });
      const quality = applyValidationToQuality(scoreLeadQuality(normalized), validation);
      const validationMetadata = {
        status: validation.status,
        website_verified: validation.website_verified,
        email_verified: validation.email_verified,
        phone_verified: validation.phone_verified,
        business_verified: validation.business_verified,
        validation_score: validation.validation_score,
        validation_reason: validation.validation_reason,
        validation_flags: validation.flags
      };
      const lead = await leadsRepository.create({
        business_name: normalized.business_name,
        contact_name: normalized.contact_name,
        email: normalized.email,
        phone: normalized.phone,
        industry: normalized.industry,
        state: normalized.state,
        annual_revenue_est: normalized.annual_revenue_est,
        time_in_business_years: normalized.time_in_business_years,
        status: validation.status === "invalid" || quality.score < 80 ? "rejected" : "enriched",
        qualification_score: quality.score,
        tier: quality.tier,
        website_verified: validation.website_verified,
        email_verified: validation.email_verified,
        phone_verified: validation.phone_verified,
        business_verified: validation.business_verified,
        validation_score: validation.validation_score,
        validation_reason: validation.validation_reason,
        validation_timestamp: validation.validation_timestamp,
        is_test_data: input.isTestData ?? false,
        simulation_run_id: input.simulationRunId ?? null
      });

      await acquisitionRepository.createEnrichment({
        lead_id: lead.id,
        source_id: source?.id ?? null,
        status: "completed",
        provider: input.sourceKey,
        normalized_business_name: normalized.normalized_business_name,
        website_url: normalized.website_url,
        domain: normalized.domain,
        industry: normalized.industry,
        annual_revenue_est: normalized.annual_revenue_est,
        contact_confidence_score: contactConfidence({
          email: normalized.email,
          phone: normalized.phone,
          contactName: normalized.contact_name
        }),
        quality_score: quality.score,
        duplicate_group_key: normalized.domain ?? normalized.normalized_business_name,
        funding_signals: { reasons: quality.reasons, validation: validationMetadata } as Json,
        raw_payload: normalized.raw_payload as Json,
        is_test_data: input.isTestData ?? false,
        enriched_at: new Date().toISOString()
      });

      if (normalized.email || normalized.phone || normalized.contact_name) {
        await acquisitionRepository.upsertContact({
          lead_id: lead.id,
          source_id: source?.id ?? null,
          full_name: normalized.contact_name,
          email: normalized.email,
          phone: normalized.phone,
          website_url: normalized.website_url,
          confidence_score: contactConfidence({
            email: normalized.email,
            phone: normalized.phone,
            contactName: normalized.contact_name
          }),
          is_primary: true,
          source_record_id: normalized.source_record_id,
          raw_payload: normalized.raw_payload as Json,
          is_test_data: input.isTestData ?? false
        });
      }

      created.push(lead);
    } catch (error) {
      failed.push({
        business_name: rawRecord.business_name,
        error: error instanceof Error ? error.message : "Unknown ingestion error"
      });
    }
  }

  if (job) {
    await acquisitionRepository.updateJob(job.id, {
      status: failed.length > 0 ? "failed" : "completed",
      counts: {
        input: input.records.length,
        created: created.length,
        duplicates: duplicates.length,
        failed: failed.length
      } as Json,
      result_summary: `${created.length} lead(s) ingested, ${duplicates.length} duplicate(s), ${failed.length} failed.`,
      error_message: failed.length > 0 ? "One or more records failed ingestion." : null,
      completed_at: new Date().toISOString()
    });
  }

  await writeAuditLog({
    eventType: "lead_ingestion_completed",
    actorType: requestedBy === "n8n_workflow" ? "n8n_workflow" : requestedBy === "system" ? "system" : "founder",
    actorId: requestedBy,
    entityType: "acquisition",
    metadata: {
      source_key: input.sourceKey,
      created: created.length,
      duplicates: duplicates.length,
      failed: failed.length
    } as Json
  });

  return { job, created, duplicates, failed };
}

function readSourcePageUrl(record: RawBusinessLead) {
  if (!record.raw_payload || typeof record.raw_payload !== "object" || Array.isArray(record.raw_payload)) return null;
  const value = (record.raw_payload as Record<string, unknown>).source_url;
  return typeof value === "string" ? value : null;
}

export async function enrichExistingLead(leadId: string, requestedBy: string) {
  const lead = await leadsRepository.getById(leadId);
  const normalized = normalizeBusinessLead({
    business_name: lead.business_name,
    contact_name: lead.contact_name,
    email: lead.email,
    phone: lead.phone,
    website_url: readWebsiteUrlFromNotes(lead.internal_notes),
    industry: lead.industry,
    state: lead.state,
    annual_revenue_est: lead.annual_revenue_est,
    time_in_business_years: lead.time_in_business_years
  });
  const source = readDiscoverySourceFromNotes(lead.internal_notes);
  const validation = await validateAcquisitionLead({
    businessName: normalized.business_name,
    websiteUrl: normalized.website_url,
    email: normalized.email,
    phone: normalized.phone,
    businessCategory: normalized.industry,
    source
  });
  const quality = applyValidationToQuality(scoreLeadQuality(normalized), validation);
  const enrichment =
    (await acquisitionRepository.getLatestEnrichment(leadId)) ??
    (await acquisitionRepository.createEnrichment({ lead_id: leadId, status: "running", provider: "internal" }));

  const updatedEnrichment = await acquisitionRepository.updateEnrichment(enrichment.id, {
    status: "completed",
    provider: enrichment.provider ?? "internal",
    normalized_business_name: normalized.normalized_business_name,
    website_url: normalized.website_url,
    domain: normalized.domain,
    industry: normalized.industry,
    annual_revenue_est: normalized.annual_revenue_est,
    contact_confidence_score: contactConfidence({
      email: normalized.email,
      phone: normalized.phone,
      contactName: normalized.contact_name
    }),
    quality_score: quality.score,
    funding_signals: {
      reasons: quality.reasons,
      validation: {
        status: validation.status,
        website_verified: validation.website_verified,
        email_verified: validation.email_verified,
        phone_verified: validation.phone_verified,
        business_verified: validation.business_verified,
        validation_score: validation.validation_score,
        validation_reason: validation.validation_reason,
        validation_flags: validation.flags
      }
    } as Json,
    enriched_at: new Date().toISOString()
  });

  const updatedLead = await leadsRepository.update(leadId, {
    qualification_score: quality.score,
    tier: quality.tier,
    status: validation.status === "invalid" ? "rejected" : quality.score >= 65 ? "qualified" : "nurture",
    website_verified: validation.website_verified,
    email_verified: validation.email_verified,
    phone_verified: validation.phone_verified,
    business_verified: validation.business_verified,
    validation_score: validation.validation_score,
    validation_reason: validation.validation_reason,
    validation_timestamp: validation.validation_timestamp
  });

  await writeAuditLog({
    eventType: "lead_enriched",
    actorType: requestedBy === "n8n_workflow" ? "n8n_workflow" : "founder",
    actorId: requestedBy,
    entityType: "lead",
    entityId: leadId,
    metadata: {
      quality_score: quality.score,
      tier: quality.tier,
      reasons: quality.reasons
    } as Json
  });

  return { lead: updatedLead, enrichment: updatedEnrichment, quality };
}

function readWebsiteUrlFromNotes(notes: string | null | undefined) {
  const parsed = parseNotes(notes);
  return typeof parsed.website_url === "string" ? parsed.website_url : null;
}

function readDiscoverySourceFromNotes(notes: string | null | undefined) {
  const parsed = parseNotes(notes);
  return typeof parsed.discovery_source === "string" ? parsed.discovery_source : null;
}

function parseNotes(notes: string | null | undefined): Record<string, unknown> {
  if (!notes) return {};
  try {
    return JSON.parse(notes) as Record<string, unknown>;
  } catch {
    return {};
  }
}
