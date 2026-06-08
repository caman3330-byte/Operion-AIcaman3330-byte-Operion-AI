import type { Json } from "@operion/shared";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const MERCHANT_FUNNEL_WORKFLOW_KEY = "merchant_acquisition_funnel";

export const funnelSources = ["instagram", "business-funding", "direct", "organic", "referral"] as const;
export type FunnelSource = (typeof funnelSources)[number];

export const funnelEvents = [
  "landing_page_visit",
  "ig_visit",
  "business_funding_visit",
  "apply_cta_click",
  "application_started",
  "application_completed"
] as const;

export type FunnelEvent = (typeof funnelEvents)[number];

export interface MerchantFunnelSummary {
  totals: Record<FunnelEvent, number>;
  sourceBreakdown: Array<{ source: FunnelSource; applications: number; visits: number; ctaClicks: number; conversionRate: number }>;
  dailyTrend: Array<Record<FunnelEvent, number> & { label: string; date: string }>;
  weeklyTrend: Array<Record<FunnelEvent, number> & { label: string; weekStart: string }>;
  conversionRate: number;
}

export async function getMerchantFunnelSummary(): Promise<MerchantFunnelSummary> {
  const supabase = await getSupabaseAdmin();
  const since = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: traces }, { data: applications }] = await Promise.all([
    supabase
      .from("workflow_execution_traces")
      .select("step_key,input,created_at")
      .eq("workflow_key", MERCHANT_FUNNEL_WORKFLOW_KEY)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(5000),
    supabase
      .from("business_applications")
      .select("metadata,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(5000)
  ]);

  const rows = (traces ?? []).map((row) => ({
    event: normalizeEvent(row.step_key),
    source: readSource(row.input),
    createdAt: row.created_at
  }));

  for (const application of applications ?? []) {
    rows.push({
      event: "application_completed",
      source: readApplicationSource(application.metadata),
      createdAt: application.created_at
    });
  }

  const totals = emptyEventCounts();
  for (const row of rows) totals[row.event] += 1;

  const sourceBreakdown = funnelSources.map((source) => {
    const sourceRows = rows.filter((row) => row.source === source);
    const visits = sourceRows.filter((row) => row.event === "landing_page_visit" || row.event === "ig_visit" || row.event === "business_funding_visit").length;
    const ctaClicks = sourceRows.filter((row) => row.event === "apply_cta_click").length;
    const applications = sourceRows.filter((row) => row.event === "application_completed").length;
    return {
      source,
      applications,
      visits,
      ctaClicks,
      conversionRate: visits > 0 ? Math.round((applications / visits) * 100) : 0
    };
  });

  return {
    totals,
    sourceBreakdown,
    dailyTrend: buildDailyTrend(rows),
    weeklyTrend: buildWeeklyTrend(rows),
    conversionRate: totals.landing_page_visit > 0 ? Math.round((totals.application_completed / totals.landing_page_visit) * 100) : 0
  };
}

function buildDailyTrend(rows: Array<{ event: FunnelEvent; createdAt: string }>) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - (6 - index));
    date.setUTCHours(0, 0, 0, 0);
    return date;
  });

  return days.map((date) => {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + 1);
    const counts = emptyEventCounts();
    for (const row of rows) {
      const time = new Date(row.createdAt).getTime();
      if (time >= date.getTime() && time < next.getTime()) counts[row.event] += 1;
    }
    return {
      date: date.toISOString(),
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      ...counts
    };
  });
}

function buildWeeklyTrend(rows: Array<{ event: FunnelEvent; createdAt: string }>) {
  const start = startOfUtcWeek(new Date());
  const weeks = Array.from({ length: 8 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() - (7 * (7 - index)));
    return date;
  });

  return weeks.map((weekStart) => {
    const next = new Date(weekStart);
    next.setUTCDate(next.getUTCDate() + 7);
    const counts = emptyEventCounts();
    for (const row of rows) {
      const time = new Date(row.createdAt).getTime();
      if (time >= weekStart.getTime() && time < next.getTime()) counts[row.event] += 1;
    }
    return {
      weekStart: weekStart.toISOString(),
      label: weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      ...counts
    };
  });
}

function emptyEventCounts(): Record<FunnelEvent, number> {
  return {
    landing_page_visit: 0,
    ig_visit: 0,
    business_funding_visit: 0,
    apply_cta_click: 0,
    application_started: 0,
    application_completed: 0
  };
}

function startOfUtcWeek(date: Date) {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  const day = copy.getUTCDay();
  copy.setUTCDate(copy.getUTCDate() - day);
  return copy;
}

function readSource(input: Json): FunnelSource {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "direct";
  return normalizeSource((input as Record<string, unknown>).source);
}

function readApplicationSource(metadata: Json): FunnelSource {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "direct";
  const record = metadata as Record<string, unknown>;
  const attribution = record.attribution;
  if (attribution && typeof attribution === "object" && !Array.isArray(attribution)) {
    return normalizeSource((attribution as Record<string, unknown>).source);
  }
  return normalizeSource(record.source);
}

export function normalizeSource(value: unknown): FunnelSource {
  const source = String(value ?? "").trim().toLowerCase();
  if (source.startsWith("instagram")) return "instagram";
  if (source.startsWith("business-funding")) return "business-funding";
  if (source === "organic" || source.startsWith("seo")) return "organic";
  if (source === "referral" || source.startsWith("partner")) return "referral";
  return "direct";
}

function normalizeEvent(value: unknown): FunnelEvent {
  const event = String(value ?? "");
  return funnelEvents.includes(event as FunnelEvent) ? event as FunnelEvent : "landing_page_visit";
}
