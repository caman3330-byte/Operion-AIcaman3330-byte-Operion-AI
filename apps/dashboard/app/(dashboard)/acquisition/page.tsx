import { AlertTriangle, BriefcaseBusiness, CheckCircle2, Contact, Database, Search, Star } from "lucide-react";
import { MetricCard } from "@/components/metrics/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { acquisitionRepository, isAcquisitionMigrationMissing } from "@/lib/repositories/acquisition";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AcquisitionPage() {
  try {
    const [summary, sources, jobs, enrichment, contacts] = await Promise.all([
      acquisitionRepository.summary(),
      acquisitionRepository.listSources(),
      acquisitionRepository.listJobs(8),
      acquisitionRepository.listEnrichment(8),
      acquisitionRepository.listContacts(8)
    ]);

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
      </div>
    );
  } catch (error) {
    if (isAcquisitionMigrationMissing(error)) {
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Lead Acquisition</h1>
            <p className="mt-1 text-sm text-muted-foreground">Acquisition infrastructure is coded and waiting for the database migration.</p>
          </div>
          <Card className="border-warning bg-warning/10">
            <CardHeader>
              <CardTitle>Migration Required</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Apply <span className="font-medium text-foreground">packages/database/migrations/0004_lead_acquisition_outreach.sql</span> in
              Supabase SQL Editor to activate source storage, enrichment records, acquisition jobs, campaigns, queues, and replies.
            </CardContent>
          </Card>
        </div>
      );
    }

    throw error;
  }
}
