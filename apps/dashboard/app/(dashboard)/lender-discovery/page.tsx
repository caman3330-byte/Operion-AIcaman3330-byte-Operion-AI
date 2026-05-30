import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { Badge } from "@/components/ui/badge";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { LenderDiscoveryPanel } from "./discovery-panel";

export const dynamic = "force-dynamic";

interface DiscoveryRow {
  id: string;
  company_name: string;
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  states_served: string[] | null;
  funding_range_min: number | null;
  funding_range_max: number | null;
  intelligence_summary: string | null;
  confidence_score: number | null;
  discovery_source: string;
  status: string;
  founder_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

async function loadDiscoveryQueue(): Promise<{ rows: DiscoveryRow[]; counts: Record<string, number> }> {
  try {
    const { data } = await (getSupabaseAdmin() as any)
      .from("lender_discovery_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(150);

    const rows: DiscoveryRow[] = data ?? [];
    const counts = {
      pending_review: rows.filter((r) => r.status === "pending_review").length,
      approved: rows.filter((r) => r.status === "approved").length,
      outreach_ready: rows.filter((r) => r.status === "outreach_ready").length,
      rejected: rows.filter((r) => r.status === "rejected").length,
      ai_enriched: rows.filter((r) => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        return meta.enrichment_method === "claude_ai";
      }).length,
      total: rows.length
    };
    return { rows, counts };
  } catch {
    return { rows: [], counts: { pending_review: 0, approved: 0, outreach_ready: 0, rejected: 0, ai_enriched: 0, total: 0 } };
  }
}

export default async function LenderDiscoveryPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;

  const { rows, counts } = await loadDiscoveryQueue();
  const pendingCount = counts.pending_review;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Lender Operations</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">Lender Discovery</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build the Operion lender network. Run the AI discovery agent, review intelligence summaries, and approve lenders for outreach.
          </p>
        </div>
        <Badge variant={(pendingCount ?? 0) > 0 ? "warning" : "success"}>
          {pendingCount ?? 0} pending review
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Total discovered", counts.total ?? 0, "secondary"],
          ["Pending review", counts.pending_review ?? 0, (counts.pending_review ?? 0) > 0 ? "warning" : "secondary"],
          ["AI enriched", counts.ai_enriched ?? 0, (counts.ai_enriched ?? 0) > 0 ? "success" : "secondary"],
          ["Approved", counts.approved ?? 0, (counts.approved ?? 0) > 0 ? "success" : "secondary"],
          ["Outreach ready", counts.outreach_ready ?? 0, (counts.outreach_ready ?? 0) > 0 ? "success" : "secondary"],
          ["Rejected", counts.rejected ?? 0, (counts.rejected ?? 0) > 0 ? "destructive" : "secondary"]
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-white/10 bg-card/80 p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      <LenderDiscoveryPanel initialRows={rows} />
    </div>
  );
}
