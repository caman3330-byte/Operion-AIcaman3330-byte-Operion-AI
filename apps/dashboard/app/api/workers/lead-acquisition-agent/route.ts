import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { runLeadAcquisitionAgent } from "@/lib/workers/lead-acquisition-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const tickSchema = z.object({
  limit: z.number().int().min(1).max(100).default(30),
  sources: z.array(z.enum(["google_places", "opencorporates", "ai_seed"])).optional(),
  industries: z.array(z.string()).optional(),
  states: z.array(z.string().length(2)).optional(),
  researchMode: z.boolean().default(false)
});

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = tickSchema.parse(await request.json().catch(() => ({})));
    if (payload.researchMode || payload.sources?.includes("ai_seed")) throw new ValidationError("Generated research businesses cannot enter DATA.");
    const result = await runLeadAcquisitionAgent({
      limit: payload.limit,
      ...(payload.sources ? { sources: payload.sources } : {}),
      ...(payload.industries ? { industries: payload.industries } : {}),
      ...(payload.states ? { states: payload.states } : {}),
      researchMode: payload.researchMode
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
