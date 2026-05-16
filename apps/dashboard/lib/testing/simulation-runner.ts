import type { Json, Lead, SimulationMode } from "@operion/shared";
import { normalizeBusinessLead } from "@/lib/acquisition/normalization";
import { ingestLeadBatch } from "@/lib/acquisition/pipeline";
import { scoreLeadQuality } from "@/lib/acquisition/scoring";
import { matchLenders } from "@/lib/distribution";
import { writeAuditLog } from "@/lib/audit";
import { ValidationError } from "@/lib/errors";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { leadsRepository } from "@/lib/repositories/leads";
import { orchestrationRepository } from "@/lib/repositories/orchestration";
import { simulationRepository } from "@/lib/repositories/simulation";
import { generateTestLeads, type GeneratedTestLead, type SimulationIndustry } from "@/lib/testing/lead-generator";
import { traceStep, writeTrace } from "@/lib/testing/tracing";

export interface RunSimulationInput {
  batchSize: 10 | 100 | 1000 | 10000;
  industries?: SimulationIndustry[];
  mode?: SimulationMode;
  requestedBy: string;
  seed?: string | undefined;
  pipelineLimit?: number | undefined;
}

export interface SimulationResult {
  run_id: string;
  run_key: string;
  status: string;
  counts: {
    generated: number;
    ingested: number;
    enriched: number;
    qualified: number;
    approval_routed: number;
    matched: number;
    outreach_prepared: number;
    failed: number;
  };
}

const chunkSize = 250;

export async function runSimulation(input: RunSimulationInput): Promise<SimulationResult> {
  const runKey = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const mode = input.mode ?? "standard";
  const pipelineLimit = resolvePipelineLimit(input.batchSize, mode, input.pipelineLimit);
  const run = await simulationRepository.createRun({
    run_key: runKey,
    name: `${mode === "stress" ? "Stress" : "Pipeline"} simulation ${new Date().toISOString()}`,
    mode,
    status: "running",
    batch_size: input.batchSize,
    industries: input.industries ?? [],
    config: {
      seed: input.seed ?? null,
      pipeline_limit: pipelineLimit,
      full_batch_size: input.batchSize
    } as Json,
    counts: {},
    requested_by: input.requestedBy,
    started_at: new Date().toISOString()
  });

  const counts: SimulationResult["counts"] = {
    generated: 0,
    ingested: 0,
    enriched: 0,
    qualified: 0,
    approval_routed: 0,
    matched: 0,
    outreach_prepared: 0,
    failed: 0
  };

  try {
    const generated = await traceStep(
      {
        simulationRunId: run.id,
        workflowKey: "simulation_pipeline",
        stepKey: "generate_test_leads",
        input: { batch_size: input.batchSize, industries: input.industries ?? [] } as Json
      },
      async () => {
        const generatorInput: Parameters<typeof generateTestLeads>[0] = { batchSize: input.batchSize };
        if (input.industries) generatorInput.industries = input.industries;
        if (input.seed) generatorInput.seed = input.seed;
        return generateTestLeads(generatorInput);
      },
      (records) => ({ generated: records.length } as Json)
    );
    counts.generated = generated.length;

    await persistSimulationLeadRecords(run.id, generated);
    const pipelineRecords = generated.slice(0, pipelineLimit);
    const createdLeads = await ingestGeneratedLeads(run.id, pipelineRecords, input.requestedBy);
    counts.ingested = createdLeads.length;

    for (const lead of createdLeads) {
      const generatedLead = pipelineRecords.find((record) => record.email === lead.email);
      try {
        await simulateLeadPipeline(run.id, lead, generatedLead, input.requestedBy, counts);
      } catch (error) {
        counts.failed += 1;
        await writeTrace({
          simulationRunId: run.id,
          workflowKey: "simulation_pipeline",
          stepKey: "lead_pipeline_failed",
          entityType: "lead",
          entityId: lead.id,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown simulated lead pipeline error",
          completedAt: new Date().toISOString()
        });
      }
    }

    const completed = await simulationRepository.updateRun(run.id, {
      status: counts.failed > 0 ? "failed" : "completed",
      counts: counts as unknown as Json,
      completed_at: new Date().toISOString(),
      error_message: counts.failed > 0 ? "One or more simulated lead workflows failed." : null
    });

    await writeAuditLog({
      eventType: "simulation_run_completed",
      actorType: "founder",
      actorId: input.requestedBy,
      entityType: "simulation",
      entityId: completed.id,
      metadata: counts as unknown as Json
    });

    return {
      run_id: completed.id,
      run_key: completed.run_key,
      status: completed.status,
      counts
    };
  } catch (error) {
    const failed = await simulationRepository.updateRun(run.id, {
      status: "failed",
      counts: counts as unknown as Json,
      completed_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : "Unknown simulation failure"
    });
    await writeAuditLog({
      eventType: "simulation_run_failed",
      actorType: "founder",
      actorId: input.requestedBy,
      entityType: "simulation",
      entityId: failed.id,
      metadata: { error: failed.error_message } as Json
    });
    throw error;
  }
}

export async function generateSimulationLeadPreview(input: {
  batchSize: 10 | 100 | 1000 | 10000;
  industries?: SimulationIndustry[];
  seed?: string | undefined;
}) {
  const generatorInput: Parameters<typeof generateTestLeads>[0] = { batchSize: input.batchSize };
  if (input.industries) generatorInput.industries = input.industries;
  if (input.seed) generatorInput.seed = input.seed;
  const records = generateTestLeads(generatorInput);
  return {
    total: records.length,
    sample: records.slice(0, 25)
  };
}

async function persistSimulationLeadRecords(simulationRunId: string, generated: GeneratedTestLead[]) {
  for (let start = 0; start < generated.length; start += chunkSize) {
    const chunk = generated.slice(start, start + chunkSize);
    await simulationRepository.createSimulationLeads(
      chunk.map((lead, offset) => ({
        simulation_run_id: simulationRunId,
        generated_index: start + offset + 1,
        business_name: lead.business_name,
        owner_name: lead.owner_name,
        email: lead.email ?? "",
        phone: lead.phone ?? "",
        industry: lead.industry ?? "unknown",
        revenue_estimate: lead.annual_revenue_est ?? 0,
        funding_need: lead.funding_need,
        risk_profile: lead.risk_profile,
        source_payload: lead.raw_payload
      }))
    );
  }
}

async function ingestGeneratedLeads(simulationRunId: string, generated: GeneratedTestLead[], requestedBy: string) {
  await acquisitionRepository.upsertSource({
    source_key: "simulation",
    name: "Internal Simulation Provider",
    source_type: "api",
    description: "Internal synthetic lead provider for Operion AI launch validation.",
    config: { simulation_only: true } as Json,
    active: true
  });

  const created: Lead[] = [];
  for (const chunk of chunks(generated, chunkSize)) {
    const result = await traceStep(
      {
        simulationRunId,
        workflowKey: "simulation_pipeline",
        stepKey: "ingestion",
        input: { chunk_size: chunk.length } as Json
      },
      () =>
        ingestLeadBatch({
          sourceKey: "simulation",
          records: chunk,
          requestedBy,
          isTestData: true,
          simulationRunId
        }),
      (value) =>
        ({
          created: value.created.length,
          duplicates: value.duplicates.length,
          failed: value.failed.length
        }) as Json
    );

    created.push(...result.created);
    for (const lead of result.created) {
      const simLead = (await simulationRepository.listRunLeads(simulationRunId, 10000)).find((record) => record.email === lead.email);
      if (simLead) {
        await simulationRepository.updateSimulationLead(simLead.id, {
          lead_id: lead.id,
          status: "ingested",
          pipeline_stage: "ingested"
        });
      }
    }
  }
  return created;
}

async function simulateLeadPipeline(
  simulationRunId: string,
  lead: Lead,
  generated: GeneratedTestLead | undefined,
  requestedBy: string,
  counts: SimulationResult["counts"]
) {
  const normalized = normalizeBusinessLead({
    business_name: lead.business_name,
    contact_name: lead.contact_name,
    email: lead.email,
    phone: lead.phone,
    industry: lead.industry,
    state: lead.state,
    annual_revenue_est: lead.annual_revenue_est,
    time_in_business_years: lead.time_in_business_years,
    raw_payload: generated?.raw_payload ?? {}
  });
  const quality = scoreLeadQuality(normalized);

  const enriched = await traceStep(
    {
      simulationRunId,
      workflowKey: "simulation_pipeline",
      stepKey: "enrichment",
      entityType: "lead",
      entityId: lead.id,
      input: { lead_id: lead.id } as Json
    },
    () =>
      leadsRepository.update(lead.id, {
        status: quality.score >= 65 ? "qualified" : "nurture",
        qualification_score: quality.score,
        tier: quality.tier
      }),
    (updated) => ({ status: updated.status, score: updated.qualification_score, tier: updated.tier } as Json)
  );
  counts.enriched += 1;
  if (enriched.status === "qualified") counts.qualified += 1;

  await updateSimulationLeadByEmail(simulationRunId, lead.email, {
    status: enriched.status === "qualified" ? "qualified" : "enriched",
    pipeline_stage: "qualified"
  });

  if (generated?.risk_profile === "high" || generated?.risk_profile === "watchlist" || Number(generated?.funding_need ?? 0) > 250_000) {
    await routeApproval(simulationRunId, enriched, generated, requestedBy);
    counts.approval_routed += 1;
  }

  const matched = await traceStep(
    {
      simulationRunId,
      workflowKey: "simulation_pipeline",
      stepKey: "lender_matching",
      entityType: "lead",
      entityId: enriched.id
    },
    () => matchLenders(enriched),
    (lenders) => ({ matched_lenders: lenders.length } as Json)
  );
  if (matched.length > 0) counts.matched += 1;
  await updateSimulationLeadByEmail(simulationRunId, lead.email, {
    status: "matched",
    pipeline_stage: "lender_matching"
  });

  await prepareSimulatedOutreach(simulationRunId, enriched, requestedBy);
  counts.outreach_prepared += 1;
}

async function routeApproval(simulationRunId: string, lead: Lead, generated: GeneratedTestLead | undefined, requestedBy: string) {
  await traceStep(
    {
      simulationRunId,
      workflowKey: "simulation_pipeline",
      stepKey: "approval_routing",
      entityType: "lead",
      entityId: lead.id,
      input: {
        risk_profile: generated?.risk_profile,
        funding_need: generated?.funding_need
      } as Json
    },
    () =>
      orchestrationRepository.createApproval({
        approval_type: "simulation_high_risk_lead",
        requested_by_agent_key: "operations_manager_agent",
        assigned_to: requestedBy,
        title: `Simulation approval review: ${lead.business_name}`,
        details: {
          lead_id: lead.id,
          simulation_run_id: simulationRunId,
          risk_profile: generated?.risk_profile,
          funding_need: generated?.funding_need,
          qualification_score: lead.qualification_score
        } as Json
      }),
    (approval) => ({ approval_id: approval.id } as Json)
  );

  await updateSimulationLeadByEmail(simulationRunId, lead.email, {
    status: "approval_routed",
    pipeline_stage: "approval_routing"
  });
}

async function prepareSimulatedOutreach(simulationRunId: string, lead: Lead, requestedBy: string) {
  const campaign = await ensureSimulationCampaign(requestedBy);
  const sequence = await ensureSimulationSequence(campaign.id);
  const approval = await orchestrationRepository.createApproval({
    approval_type: "simulation_outreach_email",
    requested_by_agent_key: "outreach_agent",
    assigned_to: requestedBy,
    title: `Simulation outreach approval: ${lead.business_name}`,
    details: {
      simulation_run_id: simulationRunId,
      lead_id: lead.id,
      to_email: lead.email,
      subject: `Funding options for ${lead.business_name}`
    } as Json
  });

  await traceStep(
    {
      simulationRunId,
      workflowKey: "simulation_pipeline",
      stepKey: "outreach_queue_preparation",
      entityType: "lead",
      entityId: lead.id
    },
    () =>
      acquisitionRepository.createEmailQueueItem({
        campaign_id: campaign.id,
        sequence_id: sequence.id,
        lead_id: lead.id,
        to_email: lead.email ?? "",
        subject: `Funding options for ${lead.business_name}`,
        html_body: `<p>Hi ${lead.contact_name ?? "there"},</p><p>Operion AI is validating working-capital outreach for ${lead.business_name}. This is internal simulation traffic only.</p>`,
        text_body: `Hi ${lead.contact_name ?? "there"}, Operion AI is validating working-capital outreach for ${lead.business_name}. This is internal simulation traffic only.`,
        status: "pending_approval",
        scheduled_at: new Date().toISOString(),
        approval_id: approval.id,
        ai_generated: false,
        created_by_agent_key: "simulation_agent",
        is_test_data: true
      }),
    (queueItem) => ({ queue_item_id: queueItem.id, status: queueItem.status } as Json)
  );

  await updateSimulationLeadByEmail(simulationRunId, lead.email, {
    status: "outreach_prepared",
    pipeline_stage: "outreach_queue_preparation"
  });
}

async function ensureSimulationCampaign(requestedBy: string) {
  const existing = (await acquisitionRepository.listCampaigns(100)).find((campaign) => campaign.name === "Internal Simulation SDR Campaign");
  if (existing) return existing;

  return acquisitionRepository.createCampaign({
    name: "Internal Simulation SDR Campaign",
    description: "Simulation-only outreach campaign used for launch readiness testing.",
    status: "pending_approval",
    audience_filter: { simulation_only: true } as Json,
    created_by: requestedBy,
    is_test_data: true
  });
}

async function ensureSimulationSequence(campaignId: string) {
  const existing = (await acquisitionRepository.listSequences(campaignId)).find((sequence) => sequence.step_number === 1);
  if (existing) return existing;

  return acquisitionRepository.createSequence({
    campaign_id: campaignId,
    step_number: 1,
    delay_hours: 0,
    subject_template: "Funding options for {{business_name}}",
    body_template: "Simulation-only outreach body for internal validation.",
    channel: "email",
    send_window: { simulation_only: true } as Json,
    requires_approval: true,
    active: true
  });
}

async function updateSimulationLeadByEmail(simulationRunId: string, email: string | null, payload: Parameters<typeof simulationRepository.updateSimulationLead>[1]) {
  if (!email) return;
  const simLead = (await simulationRepository.listRunLeads(simulationRunId, 10000)).find((record) => record.email === email);
  if (simLead) {
    await simulationRepository.updateSimulationLead(simLead.id, payload);
  }
}

function resolvePipelineLimit(batchSize: number, mode: SimulationMode, explicit?: number) {
  if (explicit !== undefined) {
    if (explicit < 1 || explicit > batchSize) {
      throw new ValidationError("pipelineLimit must be between 1 and batchSize");
    }
    return explicit;
  }

  if (batchSize <= 100) return batchSize;
  if (mode === "stress") return Math.min(batchSize, 1000);
  if (mode === "replay") return Math.min(batchSize, 250);
  return Math.min(batchSize, 250);
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
