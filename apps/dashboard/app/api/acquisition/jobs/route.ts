import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { discoverBusinesses } from "@/lib/acquisition/discovery";
import { ingestLeadBatch } from "@/lib/acquisition/pipeline";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { acquisitionJobCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 100);
    const jobs = await acquisitionRepository.listJobs(limit);
    return NextResponse.json({ data: jobs });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = acquisitionJobCreateSchema.parse(await request.json());
    const source = await resolveSource(payload.source_id, payload.source_key);

    const job = await acquisitionRepository.createJob({
      source_id: source?.id ?? payload.source_id ?? null,
      job_type: payload.job_type,
      status: payload.run_now ? "running" : "queued",
      requested_by: actor.email,
      assigned_agent_key: payload.assigned_agent_key ?? defaultAgentForJob(payload.job_type),
      parameters: payload.parameters as Json,
      counts: {}
    });

    await writeAuditLog({
      eventType: "acquisition_job_created",
      actorType: actor.role === "workflow" ? "n8n_workflow" : "founder",
      actorId: actor.email,
      entityType: "acquisition",
      entityId: job.id,
      metadata: {
        job_type: job.job_type,
        source_key: source?.source_key,
        run_now: payload.run_now
      } as Json
    });

    if (!payload.run_now) {
      return NextResponse.json({ data: job }, { status: 201 });
    }

    const result = await runAcquisitionJob(job.id, payload, source?.source_key);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function runAcquisitionJob(
  jobId: string,
  payload: ReturnType<typeof acquisitionJobCreateSchema.parse>,
  sourceKey?: string | null
) {
  if (payload.job_type === "business_discovery") {
    const discoveryInput: Parameters<typeof discoverBusinesses>[0] = {
      sourceKey: normalizeDiscoverySource(sourceKey),
      query: String(payload.parameters.query ?? ""),
      limit: Number(payload.parameters.limit ?? 25)
    };
    if (typeof payload.parameters.location === "string") {
      discoveryInput.location = payload.parameters.location;
    }
    if (typeof payload.parameters.website_url === "string") {
      discoveryInput.websiteUrl = payload.parameters.website_url;
    }

    const discovery = await discoverBusinesses(discoveryInput);

    const ingest = await ingestLeadBatch({
      sourceKey: sourceKey ?? "api",
      jobId,
      requestedBy: "system",
      records: discovery.records
    });

    return acquisitionRepository.updateJob(jobId, {
      status: "completed",
      completed_at: new Date().toISOString(),
      result_summary: `Discovery completed from ${discovery.sourceKey}: ${ingest.created.length} created, ${ingest.duplicates.length} duplicate(s), ${ingest.failed.length} failed.`,
      counts: {
        discovered: discovery.records.length,
        created: ingest.created.length,
        duplicates: ingest.duplicates.length,
        failed: ingest.failed.length
      } as Json
    });
  }

  if (payload.job_type === "lead_ingestion" && Array.isArray(payload.parameters.records)) {
    const ingest = await ingestLeadBatch({
      sourceKey: sourceKey ?? "api",
      jobId,
      requestedBy: "system",
      records: payload.parameters.records as never
    });

    return acquisitionRepository.updateJob(jobId, {
      status: "completed",
      completed_at: new Date().toISOString(),
      result_summary: `Lead ingestion completed: ${ingest.created.length} created, ${ingest.duplicates.length} duplicate(s), ${ingest.failed.length} failed.`,
      counts: {
        created: ingest.created.length,
        duplicates: ingest.duplicates.length,
        failed: ingest.failed.length
      } as Json
    });
  }

  return acquisitionRepository.updateJob(jobId, {
    status: "queued",
    result_summary: "Job queued for acquisition worker execution."
  });
}

async function resolveSource(sourceId?: string | null, sourceKey?: string | null) {
  if (sourceKey) {
    return acquisitionRepository.getSourceByKey(sourceKey);
  }

  if (!sourceId) {
    return null;
  }

  const sources = await acquisitionRepository.listSources();
  return sources.find((source) => source.id === sourceId) ?? null;
}

function defaultAgentForJob(jobType: ReturnType<typeof acquisitionJobCreateSchema.parse>["job_type"]) {
  if (jobType === "outreach_prep") return "outreach_agent";
  if (jobType === "quality_scoring") return "underwriting_manager";
  return "lead_generation_agent";
}

function normalizeDiscoverySource(sourceKey?: string | null): "apollo" | "google_maps" | "website_extraction" {
  if (sourceKey === "apollo") return "apollo";
  if (sourceKey === "google_maps") return "google_maps";
  if (sourceKey === "website_extraction") return "website_extraction";
  throw new ValidationError("business_discovery run_now requires source_key apollo, google_maps, or website_extraction");
}
