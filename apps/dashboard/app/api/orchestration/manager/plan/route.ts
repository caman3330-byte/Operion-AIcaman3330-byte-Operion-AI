import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createManagerBrainPlan } from "@/lib/ai/manager-brain";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const managerPlanSchema = z.object({
  objective: z.string().min(10).max(4000),
  context: z.unknown().optional().nullable()
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = managerPlanSchema.parse(await request.json());
    const plan = await createManagerBrainPlan({
      objective: payload.objective,
      context: (payload.context ?? null) as Json | null,
      requestedBy: actor.email
    });

    return NextResponse.json({ data: plan });
  } catch (error) {
    return handleRouteError(error);
  }
}
