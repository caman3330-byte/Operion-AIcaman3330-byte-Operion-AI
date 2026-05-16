import { NextRequest, NextResponse } from "next/server";
import { phase2OperationalAgents } from "@/lib/ai/agents";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { orchestrationRepository } from "@/lib/repositories/orchestration";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const agents = await orchestrationRepository.listAgents();

    return NextResponse.json({ data: agents });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const agents = await Promise.all(phase2OperationalAgents.map((agent) => orchestrationRepository.upsertAgent(agent)));

    return NextResponse.json({ data: agents }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
