import { Activity, AlertTriangle, CheckCircle2, Clock3, DatabaseZap, Globe2, ShieldCheck } from "lucide-react";
import { MetricCard } from "@/components/metrics/metric-card";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MerchantCandidateReviewActions } from "./merchant-candidate-review-actions";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MerchantSourcesPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;

  const [sources, scans, importQueue, approvedImportQueue, metrics] = await Promise.all([
    acquisitionRepository.listMerchantSources({ limit: 200 }),
    acquisitionRepository.listMerchantSourceScans(25),
    acquisitionRepository.listMerchantImportQueue(100),
    acquisitionRepository.listApprovedMerchantImportQueue(100),
    acquisitionRepository.merchantAcquisitionDepartmentMetrics()
  ]);
  const activeSources = sources.filter((source) => source.active && source.health_status !== "disabled");
  const pendingSourceApprovals = sources.filter((source) => source.approval_status === "pending_review");
  const blockedSources = sources.filter((source) => source.health_status === "blocked");
  const degradedSources = sources.filter((source) => source.health_status === "degraded");
  const extractedBusinesses = sources.reduce((sum, source) => sum + Number(source.extracted_business_count ?? 0), 0);
  const averageSuccess = activeSources.length === 0
    ? 0
    : Math.round(activeSources.reduce((sum, source) => sum + Number(source.success_rate ?? 0), 0) / activeSources.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Merchant Pipeline</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal">Merchant Acquisition Sources</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Registry, scan health, and founder import review for real merchant acquisition. Scans remain approval-gated and imports require verified score 80+.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Scheduler disabled by default</Badge>
          <Badge variant="outline">No automatic CRM imports</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Registered Sources" value={String(sources.length)} detail={`${activeSources.length} active`} icon={DatabaseZap} />
        <MetricCard title="Source Health" value={`${averageSuccess}%`} detail="Average success rate" icon={Activity} tone={averageSuccess >= 60 ? "success" : "warning"} />
        <MetricCard title="Extracted Businesses" value={String(extractedBusinesses)} detail="Across tracked scans" icon={Globe2} />
        <MetricCard title="Blocked / Degraded" value={`${blockedSources.length}/${degradedSources.length}`} detail="Robots blocked / scan degraded" icon={AlertTriangle} tone={blockedSources.length + degradedSources.length > 0 ? "warning" : "success"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Sources Scanned" value={String(metrics.sources_scanned)} detail="Historical scan records" icon={Activity} />
        <MetricCard title="Candidates Enriched" value={String(metrics.candidates_enriched)} detail={`${metrics.candidates_discovered} discovered`} icon={Globe2} />
        <MetricCard title="Verified Merchants" value={String(metrics.verified_merchants)} detail="Website + phone + identity" icon={CheckCircle2} tone="success" />
        <MetricCard title="Pending Imports" value={String(metrics.pending_imports)} detail={`${metrics.candidate_sources_pending_review} sources need approval`} icon={Clock3} tone={metrics.pending_imports > 0 ? "warning" : "default"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Verified Merchant Import Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <MerchantCandidateReviewActions pendingCandidates={importQueue} approvedCandidates={approvedImportQueue} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Source Registry</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Success</TableHead>
                <TableHead className="text-right">Extracted</TableHead>
                <TableHead>Last Scan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell>
                    <div className="max-w-md">
                      <p className="font-medium">{source.source_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{source.source_url}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="capitalize">{source.industry.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground">{source.state ?? "National"}</p>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{source.source_type.replace(/_/g, " ")}</TableCell>
                  <TableCell>
                    <Badge variant={source.approval_status === "approved" ? "success" : source.approval_status === "rejected" ? "destructive" : "warning"}>
                      {source.approval_status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={healthVariant(source.health_status)}>
                      {source.health_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{Number(source.success_rate ?? 0).toFixed(0)}%</TableCell>
                  <TableCell className="text-right">{source.extracted_business_count}</TableCell>
                  <TableCell>{source.last_scanned_at ? formatDateTime(source.last_scanned_at) : "Not scanned"}</TableCell>
                </TableRow>
              ))}
              {sources.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    No merchant acquisition sources are registered yet. Apply migration 0020 to seed starter sources.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Candidate Sources Awaiting Approval</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingSourceApprovals.map((source) => (
                <TableRow key={source.id}>
                  <TableCell>
                    <div className="max-w-md">
                      <p className="font-medium">{source.source_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{source.source_url}</p>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{source.industry.replace(/_/g, " ")}</TableCell>
                  <TableCell className="capitalize">{source.source_type.replace(/_/g, " ")}</TableCell>
                  <TableCell>{source.state ?? "National"}</TableCell>
                  <TableCell><Badge variant="warning">Needs founder approval</Badge></TableCell>
                </TableRow>
              ))}
              {pendingSourceApprovals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No newly discovered source candidates are waiting for approval.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Source Scans</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Extracted</TableHead>
                <TableHead className="text-right">Verified</TableHead>
                <TableHead className="text-right">Rejected</TableHead>
                <TableHead className="text-right">Duplicates</TableHead>
                <TableHead>Robots</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scans.map((scan) => (
                <TableRow key={scan.id}>
                  <TableCell>{formatDateTime(scan.started_at)}</TableCell>
                  <TableCell>
                    <Badge variant={scan.status === "completed" ? "success" : scan.status === "failed" ? "destructive" : "secondary"}>
                      {scan.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{scan.extracted_businesses}</TableCell>
                  <TableCell className="text-right">{scan.verified_businesses}</TableCell>
                  <TableCell className="text-right">{scan.rejected_businesses}</TableCell>
                  <TableCell className="text-right">{scan.duplicate_businesses}</TableCell>
                  <TableCell>{scan.robots_blocked ? <Badge variant="warning">blocked</Badge> : <Badge variant="outline">clear</Badge>}</TableCell>
                </TableRow>
              ))}
              {scans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No source scans have run yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import Protection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            {["Business website required", "Phone number required", "Duplicate check required", "Score 80+ required"].map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-md border p-3 text-sm">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function healthVariant(status: string) {
  if (status === "active") return "success";
  if (status === "degraded") return "warning";
  if (status === "blocked") return "destructive";
  return "secondary";
}
