import { AlertTriangle, BriefcaseBusiness, CheckCircle2, Contact, Database, Search, ShieldCheck, ShieldQuestion, Star, XCircle } from "lucide-react";
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
    const [summary, sources, jobs, enrichment, contacts, pendingLeadsResult] = await Promise.all([
      acquisitionRepository.summary(),
      acquisitionRepository.listSources(),
      acquisitionRepository.listJobs(8),
      acquisitionRepository.listEnrichment(8),
      acquisitionRepository.listContacts(8),
      (getSupabaseAdmin() as any)
        .from("leads")
        .select("id,business_name,contact_name,email,phone,industry,state,qualification_score,tier,status,ai_summary,internal_notes,website_verified,email_verified,phone_verified,business_verified,validation_score,validation_reason,validation_timestamp,created_at")
        .in("status", ["pending_approval", "qualified", "enriched"])
        .eq("is_test_data", false)
        .eq("business_verified", true)
        .order("created_at", { ascending: false })
        .limit(50)
    ]);

    const pendingLeads = (pendingLeadsResult?.data ?? []) as Array<{
      id: string; business_name: string; contact_name: string | null; email: string | null;
      phone: string | null; industry: string | null; state: string | null;
      qualification_score: number | null; tier: string | null; status: string;
      ai_summary: string | null; internal_notes: string | null; website_verified?: boolean;
      email_verified?: boolean; phone_verified?: boolean; business_verified?: boolean;
      validation_score?: number; validation_reason?: string | null; validation_timestamp?: string | null; created_at: string;
    }>;

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
              <CardTitle>Acquisition Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">{job.job_type.replace(/_/g, " ")}</TableCell>
                      <TableCell>{job.assigned_agent_key ?? "unassigned"}</TableCell>
                      <TableCell>
                        <Badge variant={job.status === "failed" ? "destructive" : job.status === "completed" ? "success" : "secondary"}>
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(job.updated_at)}</TableCell>
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
