import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { enrichExistingLead, ingestLeadBatch } from "@/lib/acquisition/pipeline";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError } from "@/lib/errors";
import { prepareSdrOutreach } from "@/lib/outreach/sequence-engine";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { leadsRepository } from "@/lib/repositories/leads";
import { workerTickSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = workerTickSchema.parse(await request.json().catch(() => ({})));
    const jobs = (await acquisitionRepository.listJobs(100))
      .filter((job) => job.status === "queued")
      .slice(0, payload.limit);
    const processed = [];

    for (const job of jobs) {
      processed.push(await processJob(job.id, payload.worker_id));
    }

    return NextResponse.json({
      data: {
        worker_id: payload.worker_id,
        processed
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function processJob(jobId: string, workerId: string) {
  const job = (await acquisitionRepository.listJobs(100)).find((candidate) => candidate.id === jobId);
  if (!job) {
    return { job_id: jobId, status: "skipped", summary: "Job no longer exists." };
  }

  try {
    await acquisitionRepository.updateJob(job.id, {
      status: "running",
      started_at: job.started_at ?? new Date().toISOString()
    });

    const result = await executeJob(job, workerId);
    const completed = await acquisitionRepository.updateJob(job.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      result_summary: result.summary,
      counts: result.counts
    });

    await writeAuditLog({
      eventType: "acquisition_job_completed",
      actorType: "system",
      actorId: workerId,
      entityType: "acquisition",
      entityId: completed.id,
      metadata: result.counts
    });

    return { job_id: completed.id, status: completed.status, summary: completed.result_summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown acquisition worker error";
    const failed = await acquisitionRepository.updateJob(job.id, {
      status: "failed",
      error_message: message,
      completed_at: new Date().toISOString()
    });

    await writeAuditLog({
      eventType: "acquisition_job_failed",
      actorType: "system",
      actorId: workerId,
      entityType: "acquisition",
      entityId: failed.id,
      metadata: { error: message } as Json
    });

    return { job_id: failed.id, status: failed.status, error: message };
  }
}

async function executeJob(job: Awaited<ReturnType<typeof acquisitionRepository.listJobs>>[number], workerId: string) {
  const parameters = asRecord(job.parameters);

  if (job.job_type === "lead_ingestion" && Array.isArray(parameters.records)) {
    const result = await ingestLeadBatch({
      sourceKey: String(parameters.source_key ?? "api"),
      jobId: job.id,
      requestedBy: workerId,
      records: parameters.records as never
    });

    return {
      summary: `Ingested ${result.created.length} lead(s), detected ${result.duplicates.length} duplicate(s), ${result.failed.length} failed.`,
      counts: {
        created: result.created.length,
        duplicates: result.duplicates.length,
        failed: result.failed.length
      } as Json
    };
  }

  if (job.job_type === "enrichment" || job.job_type === "quality_scoring") {
    const leadIds =
      Array.isArray(parameters.lead_ids) && parameters.lead_ids.every((id) => typeof id === "string")
        ? parameters.lead_ids
        : (await leadsRepository.list({ status: "raw", pageSize: 10 })).data.map((lead) => lead.id);
    let completed = 0;

    for (const leadId of leadIds.slice(0, 10)) {
      await enrichExistingLead(leadId, workerId);
      completed += 1;
    }

    return {
      summary: `Enrichment worker processed ${completed} lead(s).`,
      counts: { completed } as Json
    };
  }

  if (job.job_type === "outreach_prep") {
    const leadIds = Array.isArray(parameters.lead_ids) && parameters.lead_ids.every((id) => typeof id === "string")
      ? parameters.lead_ids
      : [];

    for (const leadId of leadIds.slice(0, 10)) {
      await prepareSdrOutreach({
        leadId,
        campaignId: typeof parameters.campaign_id === "string" ? parameters.campaign_id : null,
        requestedBy: workerId,
        createdByAgentKey: job.assigned_agent_key ?? "outreach_agent"
      });
    }

    return {
      summary: `Prepared SDR outreach for ${leadIds.length} lead(s).`,
      counts: { prepared: leadIds.length } as Json
    };
  }

  return {
    summary: `${job.job_type} requires an external connector or n8n workflow and remains queued in production until configured.`,
    counts: { external_connector_required: true } as Json
  };
}

function asRecord(value: Json | null): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json>) : {};
}
