import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const submitSchema = z.object({
  company_name: z.string().min(1).max(200),
  website_url: z.string().url().optional().nullable(),
  contact_page_url: z.string().url().optional().nullable(),
  contact_email: z.string().email().optional().nullable(),
  contact_phone: z.string().optional().nullable(),
  states_served: z.array(z.string()).optional().default([]),
  industries_served: z.array(z.string()).optional().default([]),
  funding_range_min: z.number().positive().optional().nullable(),
  funding_range_max: z.number().positive().optional().nullable(),
  qualification_summary: z.string().optional().nullable(),
  intelligence_summary: z.string().optional().nullable(),
  confidence_score: z.number().min(0).max(1).optional().nullable(),
  discovery_source: z.enum(["manual", "web_search", "referral", "directory", "import"]).default("manual")
});

export async function GET(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 100);

    let query = (getSupabaseAdmin() as any)
      .from("lender_discovery_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw error;

    const counts = await getDiscoveryCounts();

    return NextResponse.json({ data: data ?? [], counts });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireInternalUser(request);
    const payload = submitSchema.parse(await request.json());

    const { data, error } = await (getSupabaseAdmin() as any)
      .from("lender_discovery_queue")
      .insert({
        ...payload,
        metadata: { submitted_by: actor.email, submitted_at: new Date().toISOString() } as Json
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function getDiscoveryCounts() {
  const { data } = await (getSupabaseAdmin() as any)
    .from("lender_discovery_queue")
    .select("status");

  const rows: any[] = data ?? [];
  return {
    pending_review: rows.filter((r) => r.status === "pending_review").length,
    approved: rows.filter((r) => r.status === "approved").length,
    outreach_ready: rows.filter((r) => r.status === "outreach_ready").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    total: rows.length
  };
}
