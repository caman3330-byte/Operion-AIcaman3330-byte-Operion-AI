import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { requireFounder } from "@/lib/auth";
import { sampleOperationalAgents } from "@/lib/agent-orchestration/sample-agents";
import { handleRouteError } from "@/lib/errors";
import { orchestrationRepository } from "@/lib/repositories/orchestration";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const agents = await Promise.all(sampleOperationalAgents.map((agent) => orchestrationRepository.upsertAgent(agent)));

    await writeAuditLog({
      eventType: "sample_operational_agents_upserted",
      actorType: actor.role === "workflow" ? "n8n_workflow" : "founder",
      actorId: actor.email,
      entityType: "manager_agent",
      metadata: {
        agent_keys: agents.map((agent) => agent.agent_key)
      } as Json
    });

    return NextResponse.json({ data: agents }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
