import { Activity, AlertTriangle, BriefcaseBusiness, CheckCircle2, CircleDollarSign, Contact, CopyCheck, Database, MapPin, Search, ShieldCheck, ShieldQuestion, Star, UsersRound, XCircle } from "lucide-react";
import type { AcquisitionJob, Json, LeadSource } from "@operion/shared";
import { MetricCard } from "@/components/metrics/metric-card";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { acquisitionRepository, isAcquisitionMigrationMissing } from "@/lib/repositories/acquisition";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { AcquisitionQueuePanel } from "./acquisition-queue-panel";

export const dynamic = "force-dynamic";

export default async function AcquisitionPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;

  try {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const startOfMonth = new Date(Date.UTC(startOfToday.getUTCFullYear(), startOfToday.getUTCMonth(), 1));
    const [summary, sources, jobs, enrichment, contacts, pendingLeadsResult, realLeadsTodayResult, realLeadsMonthResult, totalRealLeadsResult] = await Promise.all([
      acquisitionRepository.summary(),
      acquisitionRepository.listSources(),
      acquisitionRepository.listJobs(20),
      acquisitionRepository.listEnrichment(8),
      acquisitionRepository.listContacts(8),
      (getSupabaseAdmin() as any)
        .from("leads")
        .select("id,business_name,contact_name,email,phone,industry,state,qualification_score,tier,status,ai_summary,internal_notes,website_verified,email_verified,phone_verified,business_verified,validation_score,validation_reason,validation_timestamp,created_at")
        .in("status", ["pending_approval", "qualified", "enriched"])
        .eq("is_test_data", false)
        .eq("business_verified", true)
        .order("created_at", { ascending: false })
        .limit(50),
      (getSupabaseAdmin() as any)
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("is_test_data", false)
        .gte("created_at", startOfToday.toISOString()),
      (getSupabaseAdmin() as any)
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("is_test_data", false)
        .gte("created_at", startOfMonth.toISOString()),
      (getSupabaseAdmin() as any)
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("is_test_data", false)
        .neq("status", "archived")
    ]);

    const pendingLeads = (pendingLeadsResult?.data ?? []) as Array<{
      id: string; business_name: string; contact_name: string | null; email: string | null;
      phone: string | null; industry: string | null; state: string | null;
      qualification_score: number | null; tier: string | null; status: string;
      ai_summary: string | null; internal_notes: string | null; website_verified?: boolean;
      email_verified?: boolean; phone_verified?: boolean; business_verified?: boolean;
      validation_score?: number; validation_reason?: string | null; validation_timestamp?: string | null; created_at: string;
    }>;
    const acquisitionRuns = summary.jobs.queued + summary.jobs.running + summary.jobs.completed + summary.jobs.failed + summary.jobs.blocked;
    const googlePlacesConfigured = Boolean(process.env.GOOGLE_PLACES_API_KEY);
    const runMetrics = getRunMetrics(jobs);
    const sourceBreakdown = getSourceBreakdown(jobs, sources);

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Lead Acquisition</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Source ingestion, enrichment, quality scoring, SDR preparation, and acquisition worker health.
            </p>
          </div>
          <Badge variant="success">Supabase connected</Badge>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Founder Acquisition Dashboard</CardTitle>
              <Badge variant={googlePlacesConfigured ? "success" : "secondary"}>
                Google Places {googlePlacesConfigured ? "configured" : "optional"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Real Leads Today" value={String(realLeadsTodayResult.count ?? 0)} detail="Non-test leads created today" icon={UsersRound} />
              <MetricCard title="Real Leads This Month" value={String(realLeadsMonthResult.count ?? 0)} detail="Non-test leads created this month" icon={BriefcaseBusiness} />
              <MetricCard title="Verified Leads" value={String(summary.leads.verified)} detail="Business verification passed" icon={ShieldCheck} tone="success" />
              <MetricCard title="Invalid Leads" value={String(summary.leads.invalid)} detail="Rejected by validation" icon={XCircle} tone={summary.leads.invalid > 0 ? "danger" : "default"} />
              <MetricCard title="Acquisition Runs" value={String(acquisitionRuns)} detail={`${summary.jobs.completed} completed / ${summary.jobs.failed} failed`} icon={Activity} />
              <MetricCard title="Cost Per Lead" value="$0" detail="Free-first public sources; infrastructure usage only" icon={CircleDollarSign} />
              <MetricCard title="Qualified Leads" value={String(summary.leads.qualified)} detail="Passed current qualification threshold" icon={CheckCircle2} tone="success" />
              <MetricCard title="Duplicates Prevented" value={String(runMetrics.duplicates)} detail="Across recent acquisition runs" icon={CopyCheck} />
              <MetricCard title="Acquisition Success" value={`${runMetrics.successRate}%`} detail={`${runMetrics.qualified} qualified of ${runMetrics.discovered} discovered`} icon={Activity} tone={runMetrics.successRate >= 50 ? "success" : "default"} />
              <MetricCard title="Total Merchants Acquired" value={String(totalRealLeadsResult.count ?? 0)} detail="Non-test, non-archived leads" icon={BriefcaseBusiness} />
              <MetricCard
                title="Google Places Status"
                value={googlePlacesConfigured ? "Ready" : "Missing key"}
                detail={googlePlacesConfigured ? "Optional paid adapter available" : "Optional only; free-first sources remain available"}
                icon={MapPin}
                tone={googlePlacesConfigured ? "success" : "default"}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acquisition Source Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {sourceBreakdown.map((source) => (
                <div key={source.name} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{source.name}</p>
                    <Badge variant={source.testRuns > 0 ? "secondary" : "outline"}>{source.runs} run(s)</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{source.discovered} discovered / {source.qualified} qualified</p>
                </div>
              ))}
              {sourceBreakdown.length === 0 ? <p className="text-sm text-muted-foreground">No acquisition run history yet.</p> : null}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Active Sources" value={String(summary.active_sources)} detail={`${summary.sources} configured source(s)`} icon={Database} />
          <MetricCard title="Acquisition Jobs" value={String(summary.jobs.queued + summary.jobs.running)} detail={`${summary.jobs.failed} failed`} icon={Search} tone={summary.jobs.failed > 0 ? "danger" : "default"} />
          <MetricCard title="Business Contacts" value={String(summary.contacts)} detail="Normalized contact records" icon={Contact} />
          <MetricCard title="Avg Quality" value={String(summary.average_quality_score)} detail="Lead quality score" icon={Star} tone={summary.average_quality_score >= 70 ? "success" : "warning"} />
          <MetricCard title="Total Leads" value={String(summary.leads.total)} detail={`${summary.leads.qualified} qualified`} icon={BriefcaseBusiness} />
          <MetricCard title="Pending Approval" value={String(summary.leads.pending_approval)} detail="Needs founder review" icon={AlertTriangle} tone="warning" />
          <MetricCard title="Queued Outreach" value={String(summary.outreach.queued_emails)} detail={`${summary.outreach.pending_approval_emails} approval gated`} icon={CheckCircle2} />
          <MetricCard title="Verified Leads" value={String(summary.leads.verified)} detail="Website + business evidence" icon={ShieldCheck} tone="success" />
          <MetricCard title="Unverified Leads" value={String(summary.leads.unverified)} detail="Capped at Tier C" icon={ShieldQuestion} tone="warning" />
          <MetricCard title="Invalid Leads" value={String(summary.leads.invalid)} detail="Rejected by validation" icon={XCircle} tone={summary.leads.invalid > 0 ? "danger" : "default"} />
          <MetricCard title="Parked Domains" value={String(summary.leads.parked_domains)} detail={`${summary.leads.domains_for_sale} for sale / ${summary.leads.placeholder_sites} placeholder`} icon={AlertTriangle} tone={summary.leads.parked_domains > 0 ? "danger" : "default"} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Lead Sources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sources.map((source) => (
                <div key={source.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{source.name}</p>
                    <Badge variant={source.active ? "success" : "secondary"}>{source.source_type}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{source.description ?? source.source_key}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Acquisition Run History</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Found</TableHead>
                    <TableHead>Qualified</TableHead>
                    <TableHead>Duplicates</TableHead>
                    <TableHead>Errors</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Ended</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">{getJobSource(job, sources)}</TableCell>
                      <TableCell>
                        <Badge variant={job.status === "failed" ? "destructive" : job.status === "completed" ? "success" : "secondary"}>
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{readCount(job.counts, "discovered")}</TableCell>
                      <TableCell>{readCount(job.counts, "qualified") || readCount(job.counts, "verified")}</TableCell>
                      <TableCell>{readCount(job.counts, "duplicates")}</TableCell>
                      <TableCell>{readCount(job.counts, "failed")}</TableCell>
                      <TableCell>{formatDateTime(job.started_at ?? job.created_at)}</TableCell>
                      <TableCell>{job.completed_at ? formatDateTime(job.completed_at) : "in progress"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Latest Enrichment</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead className="text-right">Quality</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrichment.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.normalized_business_name ?? record.lead_id}</TableCell>
                      <TableCell>{record.domain ?? "unknown"}</TableCell>
                      <TableCell className="text-right">{record.quality_score ?? 0}</TableCell>
                      <TableCell>
                        <Badge variant={record.status === "failed" ? "destructive" : record.status === "completed" ? "success" : "secondary"}>
                          {record.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Contacts</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">{contact.full_name ?? "Unknown contact"}</TableCell>
                      <TableCell>{contact.email ?? "not captured"}</TableCell>
                      <TableCell>{contact.confidence_score ?? 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Lead Acquisition Queue — founder approval gate */}
        <AcquisitionQueuePanel initialLeads={pendingLeads} />
      </div>
    );
  } catch (error) {
    if (isAcquisitionMigrationMissing(error)) {
      // Acquisition job tables not yet migrated, but leads table is live — show the queue
      const { data: pendingFallback } = await (getSupabaseAdmin() as any)
        .from("leads")
        .select("id,business_name,contact_name,email,phone,industry,state,qualification_score,tier,status,ai_summary,internal_notes,website_verified,email_verified,phone_verified,business_verified,validation_score,validation_reason,validation_timestamp,created_at")
        .in("status", ["pending_approval", "qualified", "enriched"])
        .eq("is_test_data", false)
        .eq("business_verified", true)
        .order("created_at", { ascending: false })
        .limit(50)
        .catch(() => ({ data: [] }));

      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Lead Acquisition</h1>
            <p className="mt-1 text-sm text-muted-foreground">Discover MCA prospects, review quality scores, and approve leads for the pipeline.</p>
          </div>
          <Card className="border-warning bg-warning/10">
            <CardHeader>
              <CardTitle>Acquisition Job Migration Pending</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Apply <span className="font-medium text-foreground">packages/database/migrations/0004_lead_acquisition_outreach.sql</span> in
              Supabase SQL Editor to activate source storage, enrichment records, and acquisition jobs. The lead discovery agent is operational.
            </CardContent>
          </Card>
          <AcquisitionQueuePanel initialLeads={pendingFallback ?? []} />
        </div>
      );
    }

    throw error;
  }
}

function getRunMetrics(jobs: AcquisitionJob[]) {
  const discovered = jobs.reduce((sum, job) => sum + readCount(job.counts, "discovered"), 0);
  const qualified = jobs.reduce(
    (sum, job) => sum + Math.max(readCount(job.counts, "qualified"), readCount(job.counts, "verified"), readCount(job.counts, "created")),
    0
  );
  const duplicates = jobs.reduce((sum, job) => sum + readCount(job.counts, "duplicates"), 0);
  return {
    discovered,
    qualified,
    duplicates,
    successRate: discovered > 0 ? Math.min(100, Math.round((qualified / discovered) * 100)) : 0
  };
}

function getSourceBreakdown(jobs: AcquisitionJob[], sources: LeadSource[]) {
  const grouped = new Map<string, { name: string; runs: number; testRuns: number; discovered: number; qualified: number }>();
  for (const job of jobs) {
    const breakdown = asRecord(asRecord(job.counts).source_breakdown ?? {});
    const rows = Object.keys(breakdown).length > 0
      ? Object.entries(breakdown).map(([name, counts]) => ({
          name: name.replace(/_/g, " "),
          discovered: readCount(counts ?? {}, "discovered"),
          qualified: readCount(counts ?? {}, "qualified")
        }))
      : [{
          name: getJobSource(job, sources, false),
          discovered: readCount(job.counts, "discovered"),
          qualified: Math.max(readCount(job.counts, "qualified"), readCount(job.counts, "verified"), readCount(job.counts, "created"))
        }];
    for (const row of rows) {
      const current = grouped.get(row.name) ?? { name: row.name, runs: 0, testRuns: 0, discovered: 0, qualified: 0 };
      current.runs += 1;
      current.testRuns += job.is_test_data ? 1 : 0;
      current.discovered += row.discovered;
      current.qualified += row.qualified;
      grouped.set(row.name, current);
    }
  }
  return [...grouped.values()].sort((left, right) => right.discovered - left.discovered).slice(0, 8);
}

function getJobSource(job: AcquisitionJob, sources: LeadSource[], includeMode = true) {
  const mode = includeMode && job.is_test_data ? " (dry run)" : "";
  const source = sources.find((candidate) => candidate.id === job.source_id);
  if (source) return `${source.name}${mode}`;
  const parameters = asRecord(job.parameters);
  const sourceKeys = Array.isArray(parameters.source_keys)
    ? parameters.source_keys.filter((value): value is string => typeof value === "string")
    : [];
  if (sourceKeys.length > 0) return `${sourceKeys.join(", ").replace(/_/g, " ")}${mode}`;
  return `${job.job_type.replace(/_/g, " ")}${mode}`;
}

function readCount(value: Json, key: string) {
  const count = asRecord(value)[key];
  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

function asRecord(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
