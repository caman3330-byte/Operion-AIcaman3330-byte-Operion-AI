import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError } from "@/lib/errors";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { MERCHANT_FUNNEL_WORKFLOW_KEY, funnelEvents, normalizeSource } from "@/lib/analytics/merchant-funnel";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const funnelEventSchema = z.object({
  event: z.enum(funnelEvents),
  source: z.string().max(120).optional().nullable(),
  path: z.string().max(240).optional().nullable(),
  utm_source: z.string().max(120).optional().nullable(),
  utm_medium: z.string().max(120).optional().nullable(),
  utm_campaign: z.string().max(120).optional().nullable()
});

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit({
      key: rateLimitKey(request, "merchant_funnel_event"),
      limit: 120,
      windowMs: 60_000
    });

    const payload = funnelEventSchema.parse(await request.json());
    const source = normalizeSource(payload.source);
    const now = new Date().toISOString();

    await getSupabaseAdmin().from("workflow_execution_traces").insert({
      workflow_key: MERCHANT_FUNNEL_WORKFLOW_KEY,
      step_key: payload.event,
      status: "completed",
      entity_type: "merchant_funnel",
      attempt: 1,
      input: {
        source,
        raw_source: payload.source ?? null,
        path: payload.path ?? null,
        utm_source: payload.utm_source ?? null,
        utm_medium: payload.utm_medium ?? null,
        utm_campaign: payload.utm_campaign ?? null
      } as Json,
      output: {} as Json,
      started_at: now,
      completed_at: now
    });

    return NextResponse.json({ data: { tracked: true } }, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
