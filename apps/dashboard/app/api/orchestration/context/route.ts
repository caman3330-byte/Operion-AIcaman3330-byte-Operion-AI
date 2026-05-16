import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { orchestrationRepository } from "@/lib/repositories/orchestration";

export const dynamic = "force-dynamic";

const upsertContextSchema = z.object({
  context_key: z.string().min(1),
  entity_type: z.string().min(1).optional().nullable(),
  entity_id: z.string().uuid().optional().nullable(),
  payload: z.unknown(),
  created_by_agent_key: z.string().min(1).optional().nullable()
});

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const context = await orchestrationRepository.listSharedContext();

    return NextResponse.json({ data: context });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = upsertContextSchema.parse(await request.json());
    const context = await orchestrationRepository.upsertSharedContext({
      ...payload,
      payload: payload.payload as Json
    });

    return NextResponse.json({ data: context }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
