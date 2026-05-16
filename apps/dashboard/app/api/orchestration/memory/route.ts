import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { orchestrationRepository } from "@/lib/repositories/orchestration";

export const dynamic = "force-dynamic";

const upsertMemorySchema = z.object({
  scope: z.enum(["global", "department", "agent", "workflow", "entity"]),
  scope_key: z.string().min(1),
  memory_key: z.string().min(1),
  memory_value: z.unknown(),
  source_task_id: z.string().uuid().optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable(),
  expires_at: z.string().datetime().optional().nullable()
});

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const memory = await orchestrationRepository.listMemory();

    return NextResponse.json({ data: memory });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = upsertMemorySchema.parse(await request.json());
    const memory = await orchestrationRepository.upsertMemory({
      ...payload,
      memory_value: payload.memory_value as Json
    });

    return NextResponse.json({ data: memory }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
