import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { runLeadAcquisitionAgent } from "@/lib/workers/lead-acquisition-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const tickSchema = z.object({
  limit: z.number().int().min(1).max(100).default(30),
  sources: z.array(z.enum(["google_places", "opencorporates", "ai_seed"])).optional(),
  industries: z.array(z.string()).optional(),
  states: z.array(z.string().length(2)).optional()
});

export async function POST(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const payload = tickSchema.parse(await request.json().catch(() => ({})));
    const result = await runLeadAcquisitionAgent({
      limit: payload.limit,
      ...(payload.sources ? { sources: payload.sources } : {}),
      ...(payload.industries ? { industries: payload.industries } : {}),
      ...(payload.states ? { states: payload.states } : {})
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
