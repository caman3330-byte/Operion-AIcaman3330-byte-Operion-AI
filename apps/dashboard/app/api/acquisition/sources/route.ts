import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError } from "@/lib/errors";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { leadSourceCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const sources = await acquisitionRepository.listSources();
    return NextResponse.json({ data: sources });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = leadSourceCreateSchema.parse(await request.json());
    const source = await acquisitionRepository.upsertSource({
      ...payload,
      config: payload.config as Json
    });

    await writeAuditLog({
      eventType: "lead_source_upserted",
      actorType: actor.role === "workflow" ? "n8n_workflow" : "founder",
      actorId: actor.email,
      entityType: "acquisition",
      entityId: source.id,
      metadata: {
        source_key: source.source_key,
        source_type: source.source_type
      } as Json
    });

    return NextResponse.json({ data: source }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
