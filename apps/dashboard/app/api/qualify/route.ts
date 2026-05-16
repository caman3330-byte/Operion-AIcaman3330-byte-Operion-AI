import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { qualifyLead } from "@/lib/anthropic";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError } from "@/lib/errors";
import { leadsRepository } from "@/lib/repositories/leads";
import { promptVersionsRepository } from "@/lib/repositories/prompt-versions";
import { qualifySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const promptVersionId = request.nextUrl.searchParams.get("prompt_version_id") ?? undefined;
    const payload = qualifySchema.parse(await request.json());
    const leadIds = payload.lead_ids ?? (payload.lead_id ? [payload.lead_id] : []);
    const results = [];

    for (const leadId of leadIds) {
      const before = await leadsRepository.getById(leadId);
      const qualification = await qualifyLead(before, { promptVersionId });
      const status = qualification.score >= 65 ? "pending_approval" : qualification.score >= 50 ? "nurture" : "archived";

      await writeAuditLog({
        eventType: "lead_scored",
        actorType: "system",
        actorId: "qualify_api",
        entityType: "lead",
        entityId: leadId,
        beforeState: before,
        metadata: {
          requested_by: actor.email,
          qualification
        }
      });

      const updated = await leadsRepository.update(leadId, {
        qualification_score: qualification.score,
        tier: qualification.tier,
        status,
        processing_error: false,
        processing_error_detail: null
      });

      if (promptVersionId) {
        await promptVersionsRepository.createTestResult({
          prompt_version_id: promptVersionId,
          lead_id: leadId,
          score_produced: qualification.score,
          tier_produced: qualification.tier,
          reason_produced: qualification.reason,
          latency_ms: qualification.latencyMs ?? null
        });
      }

      results.push({ lead: updated, qualification });
    }

    return NextResponse.json({ data: results });
  } catch (error) {
    return handleRouteError(error);
  }
}
